import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssistanceRequestBody = {
  full_name?: unknown;
  phone?: unknown;
  email?: unknown;
  product_interest?: unknown;
  preferred_callback_at?: unknown;
  notes?: unknown;
  callback_consent?: unknown;
};

type AssistanceRpcRow = {
  request_id: string;
  request_status: string;
  assigned_to_agent: boolean;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function jsonError(message: string, status: number, error = "REQUEST_ERROR") {
  return NextResponse.json({ error, message }, { status });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  return authorization.slice("Bearer ".length).trim() || null;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "local-development";

  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "local-development"
  );
}

function createLimiters() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return null;

  const redis = new Redis({ url: redisUrl, token: redisToken });

  return {
    ip: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "15 m"),
      analytics: true,
      prefix: "merch-shop:assistance:ip",
    }),
    user: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(4, "1 h"),
      analytics: true,
      prefix: "merch-shop:assistance:user",
    }),
  };
}

function rateLimitedResponse(reset: number) {
  return NextResponse.json(
    {
      error: "RATE_LIMITED",
      message: "Too many callback requests. Please try again later.",
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
    if (!ipResult.success) return rateLimitedResponse(ipResult.reset);

    const accessToken = getBearerToken(request);
    if (!accessToken) {
      return jsonError("Please sign in before requesting a call.", 401, "UNAUTHORIZED");
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
    if (!userResult.success) return rateLimitedResponse(userResult.reset);

    let body: AssistanceRequestBody;
    try {
      body = (await request.json()) as AssistanceRequestBody;
    } catch {
      return jsonError("Invalid request data.", 400, "INVALID_JSON");
    }

    const fullName = asText(body.full_name);
    const phone = asText(body.phone);
    const email = asText(body.email);
    const productInterest = asText(body.product_interest);
    const notes = asText(body.notes);
    const preferredCallbackAt = asText(body.preferred_callback_at);

    if (fullName.length < 2 || fullName.length > 100) {
      return jsonError("Enter your full name.", 400, "VALIDATION_ERROR");
    }

    if (
      phone.length < 7 ||
      phone.length > 30 ||
      !/^[+0-9() -]+$/.test(phone)
    ) {
      return jsonError("Enter a valid callback phone number.", 400, "VALIDATION_ERROR");
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError("Enter a valid email address.", 400, "VALIDATION_ERROR");
    }

    if (productInterest.length < 2 || productInterest.length > 200) {
      return jsonError(
        "Tell us which product you need assistance with.",
        400,
        "VALIDATION_ERROR"
      );
    }

    if (notes.length > 500) {
      return jsonError(
        "Additional notes must be 500 characters or fewer.",
        400,
        "VALIDATION_ERROR"
      );
    }

    if (body.callback_consent !== true) {
      return jsonError(
        "Confirm that you want an agent to contact you about this request.",
        400,
        "VALIDATION_ERROR"
      );
    }

    const adminClient = createClient(supabaseUrl, serverSecret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } = await adminClient.rpc(
      "server_request_product_assistance_callback",
      {
        input_customer_user_id: user.id,
        input_full_name: fullName,
        input_phone: phone,
        input_email: email || null,
        input_product_interest: productInterest,
        input_preferred_callback_at: preferredCallbackAt || null,
        input_notes: notes || null,
        input_callback_consent: true,
        input_callback_notice_version: "callback-v1",
      }
    );

    if (error) {
      const message = error.message || "Unable to submit assistance request.";

      if (message.includes("RATE_LIMITED")) {
        return jsonError(message, 429, "RATE_LIMITED");
      }

      return jsonError(message, 400, error.code || "DATABASE_ERROR");
    }

    return NextResponse.json(
      { data: (data || []) as AssistanceRpcRow[] },
      { status: 201 }
    );
  } catch (error) {
    console.error("Protected assistance request error:", error);
    return jsonError(
      "Unable to process the assistance request right now.",
      500,
      "SERVER_ERROR"
    );
  }
}