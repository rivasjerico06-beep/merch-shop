import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WithdrawalBody = {
  lead_id?: unknown;
  do_not_call?: unknown;
};

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
      limiter: Ratelimit.slidingWindow(20, "15 m"),
      analytics: true,
      prefix: "merch-shop:assistance-withdraw:ip",
    }),
    user: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "merch-shop:assistance-withdraw:user",
    }),
  };
}

function rateLimitedResponse(reset: number) {
  return NextResponse.json(
    {
      error: "RATE_LIMITED",
      message: "Too many request updates. Please try again later.",
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
      return jsonError("Please sign in to update your request.", 401, "UNAUTHORIZED");
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

    let body: WithdrawalBody;
    try {
      body = (await request.json()) as WithdrawalBody;
    } catch {
      return jsonError("Invalid request data.", 400, "INVALID_JSON");
    }

    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    const doNotCall = body.do_not_call === true;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        leadId
      )
    ) {
      return jsonError("Invalid assistance request.", 400, "VALIDATION_ERROR");
    }

    const adminClient = createClient(supabaseUrl, serverSecret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { error } = await adminClient.rpc(
      "server_withdraw_customer_assistance_callback",
      {
        input_customer_user_id: user.id,
        input_lead_id: leadId,
        input_do_not_call: doNotCall,
      }
    );

    if (error) {
      return jsonError(
        error.message || "Unable to update your request.",
        400,
        error.code || "DATABASE_ERROR"
      );
    }

    return NextResponse.json(
      {
        message: doNotCall
          ? "Your Do Not Call preference was saved."
          : "Your callback request was cancelled.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Protected callback withdrawal error:", error);
    return jsonError(
      "Unable to update your assistance request right now.",
      500,
      "SERVER_ERROR"
    );
  }
}