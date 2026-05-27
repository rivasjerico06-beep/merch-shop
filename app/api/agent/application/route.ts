import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentApplicationBody = {
  display_name?: unknown;
  phone?: unknown;
  notes?: unknown;
};

type ExistingApplication = {
  id: string;
  status: "pending" | "approved" | "rejected" | "suspended";
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function jsonError(message: string, status: number, error = "REQUEST_ERROR") {
  return NextResponse.json({ error, message }, { status });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "local-development";
  }

  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "local-development"
  );
}

function createLimiters() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    return null;
  }

  const redis = new Redis({ url: redisUrl, token: redisToken });

  return {
    ip: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "30 m"),
      analytics: true,
      prefix: "merch-shop:agent-application:ip",
    }),
    user: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      analytics: true,
      prefix: "merch-shop:agent-application:user",
    }),
  };
}

function rateLimitedResponse(reset: number) {
  return NextResponse.json(
    {
      error: "RATE_LIMITED",
      message: "Too many application submissions. Please try again later.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((reset - Date.now()) / 1000))
        ),
      },
    }
  );
}

export async function POST(request: Request) {
  try {
    const limiters = createLimiters();

    if (!limiters) {
      return jsonError(
        "Upstash rate limiting is not configured on the server.",
        500,
        "SERVER_CONFIGURATION"
      );
    }

    const ipResult = await limiters.ip.limit(getClientIp(request));

    if (!ipResult.success) {
      return rateLimitedResponse(ipResult.reset);
    }

    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return jsonError(
        "Please log in as a customer before submitting an agent application.",
        401,
        "UNAUTHORIZED"
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serverSecret =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publicKey || !serverSecret) {
      return jsonError(
        "Supabase server configuration is incomplete.",
        500,
        "SERVER_CONFIGURATION"
      );
    }

    // Uses the customer token only to verify who is making the request.
    const authClient = createClient(supabaseUrl, publicKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return jsonError(
        "Your session is invalid. Please sign in again.",
        401,
        "UNAUTHORIZED"
      );
    }

    const userResult = await limiters.user.limit(user.id);

    if (!userResult.success) {
      return rateLimitedResponse(userResult.reset);
    }

    let body: AgentApplicationBody;

    try {
      body = (await request.json()) as AgentApplicationBody;
    } catch {
      return jsonError("Invalid request data.", 400, "INVALID_JSON");
    }

    const displayName = asText(body.display_name);
    const phone = asText(body.phone);
    const notes = asText(body.notes);

    if (displayName.length < 2 || displayName.length > 100) {
      return jsonError(
        "Display name must be between 2 and 100 characters.",
        400,
        "VALIDATION_ERROR"
      );
    }

    if (phone.length > 30 || (phone && !/^[+0-9() -]+$/.test(phone))) {
      return jsonError(
        "Enter a valid phone number or leave it blank.",
        400,
        "VALIDATION_ERROR"
      );
    }

    if (notes.length > 1000) {
      return jsonError(
        "Notes must be 1,000 characters or fewer.",
        400,
        "VALIDATION_ERROR"
      );
    }

    // Server-only client. Never move this key into a client component.
    const adminClient = createClient(supabaseUrl, serverSecret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: customerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return jsonError(
        "Unable to verify customer account.",
        400,
        profileError.code || "DATABASE_ERROR"
      );
    }

    if (!customerProfile || customerProfile.role === "admin") {
      return jsonError(
        "Admin accounts do not submit agent applications.",
        403,
        "FORBIDDEN"
      );
    }

    const { data: existingApplication, error: applicationLookupError } =
      await adminClient
        .from("agent_profiles")
        .select("id, status")
        .eq("user_id", user.id)
        .maybeSingle<ExistingApplication>();

    if (applicationLookupError) {
      return jsonError(
        "Unable to review your current application status.",
        400,
        applicationLookupError.code || "DATABASE_ERROR"
      );
    }

    if (existingApplication && existingApplication.status !== "pending") {
      return jsonError(
        "This application can no longer be edited.",
        403,
        "APPLICATION_LOCKED"
      );
    }

    const updatedAt = new Date().toISOString();

    if (existingApplication) {
      const { error: updateError } = await adminClient
        .from("agent_profiles")
        .update({
          display_name: displayName,
          phone: phone || null,
          notes: notes || null,
          updated_at: updatedAt,
        })
        .eq("id", existingApplication.id)
        .eq("user_id", user.id)
        .eq("status", "pending");

      if (updateError) {
        return jsonError(
          "Unable to update agent application.",
          400,
          updateError.code || "DATABASE_ERROR"
        );
      }

      return NextResponse.json(
        { message: "Application updated.", action: "updated" },
        { status: 200 }
      );
    }

    const { error: insertError } = await adminClient
      .from("agent_profiles")
      .insert({
        user_id: user.id,
        display_name: displayName,
        phone: phone || null,
        notes: notes || null,
        status: "pending",
        updated_at: updatedAt,
      });

    if (insertError) {
      return jsonError(
        "Unable to submit agent application.",
        400,
        insertError.code || "DATABASE_ERROR"
      );
    }

    return NextResponse.json(
      { message: "Application submitted.", action: "created" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Protected agent application error:", error);

    return jsonError(
      "Unable to process the agent application right now.",
      500,
      "SERVER_ERROR"
    );
  }
}
