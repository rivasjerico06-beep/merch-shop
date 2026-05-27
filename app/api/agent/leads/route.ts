import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentLeadActionBody = {
  action?: unknown;
  lead_id?: unknown;
  outcome?: unknown;
  notes?: unknown;
  follow_up_at?: unknown;
  external_call_id?: unknown;
  call_duration_seconds?: unknown;
  actual_call_cost?: unknown;
  caller_id_used?: unknown;
};

const allowedOutcomes = new Set([
  "no_answer",
  "interested",
  "follow_up",
  "not_interested",
  "do_not_contact",
  "completed_no_sale",
]);

function jsonError(message: string, status: number, error = "REQUEST_ERROR") {
  return NextResponse.json({ error, message }, { status });
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "local-development";
  return request.headers.get("x-real-ip")?.trim() || request.headers.get("cf-connecting-ip")?.trim() || "local-development";
}

function createLimiters() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return null;

  const redis = new Redis({ url: redisUrl, token: redisToken });

  return {
    ip: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(45, "15 m"),
      analytics: true,
      prefix: "merch-shop:agent-lead-action:ip",
    }),
    user: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "15 m"),
      analytics: true,
      prefix: "merch-shop:agent-lead-action:user",
    }),
  };
}

function rateLimitedResponse(reset: number) {
  return NextResponse.json(
    { error: "RATE_LIMITED", message: "Too many lead actions. Please try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) },
    }
  );
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const limiters = createLimiters();
    if (!limiters) return jsonError("Upstash rate limiting is not configured on the server.", 500, "SERVER_CONFIGURATION");

    const ipResult = await limiters.ip.limit(getClientIp(request));
    if (!ipResult.success) return rateLimitedResponse(ipResult.reset);

    const accessToken = getBearerToken(request);
    if (!accessToken) return jsonError("Please sign in as an agent.", 401, "UNAUTHORIZED");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serverSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publicKey || !serverSecret) {
      return jsonError("Supabase server configuration is incomplete.", 500, "SERVER_CONFIGURATION");
    }

    const authClient = createClient(supabaseUrl, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);
    if (userError || !user) return jsonError("Your session is invalid. Please sign in again.", 401, "UNAUTHORIZED");

    const userResult = await limiters.user.limit(user.id);
    if (!userResult.success) return rateLimitedResponse(userResult.reset);

    let body: AgentLeadActionBody;
    try {
      body = (await request.json()) as AgentLeadActionBody;
    } catch {
      return jsonError("Invalid request data.", 400, "INVALID_JSON");
    }

    const leadId = asText(body.lead_id);
    if (!validUuid(leadId)) return jsonError("Invalid lead request.", 400, "VALIDATION_ERROR");

    const adminClient = createClient(supabaseUrl, serverSecret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    if (body.action === "accept_callback") {
      const { error } = await adminClient.rpc("server_accept_agent_inbound_callback", {
        input_agent_user_id: user.id,
        input_lead_id: leadId,
      });

      if (error) return jsonError(error.message || "Unable to accept this callback request.", 400, error.code || "DATABASE_ERROR");

      return NextResponse.json(
        { message: "Callback request accepted. You may now contact the customer." },
        { status: 200 }
      );
    }

    if (body.action === "record_call") {
      const outcome = asText(body.outcome);
      const notes = asText(body.notes);
      const followUpAt = asText(body.follow_up_at);
      const externalCallId = asText(body.external_call_id);
      const callerIdUsed = asText(body.caller_id_used);

      if (!allowedOutcomes.has(outcome)) return jsonError("Invalid call outcome.", 400, "VALIDATION_ERROR");
      if (notes.length > 2000) return jsonError("Notes must be 2,000 characters or fewer.", 400, "VALIDATION_ERROR");
      if (outcome === "follow_up" && !followUpAt) return jsonError("Set a follow-up date and time.", 400, "VALIDATION_ERROR");

      const duration = body.call_duration_seconds === null || body.call_duration_seconds === "" ? null : Number(body.call_duration_seconds);
      const cost = body.actual_call_cost === null || body.actual_call_cost === "" ? null : Number(body.actual_call_cost);

      if (duration !== null && (!Number.isInteger(duration) || duration < 0)) return jsonError("Enter a valid duration in seconds.", 400, "VALIDATION_ERROR");
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return jsonError("Enter a valid call cost.", 400, "VALIDATION_ERROR");

      const { error } = await adminClient.rpc("server_record_agent_helloairdial_call", {
        input_agent_user_id: user.id,
        input_lead_id: leadId,
        input_outcome: outcome,
        input_notes: notes || null,
        input_follow_up_at: followUpAt || null,
        input_external_call_id: externalCallId || null,
        input_call_duration_seconds: duration,
        input_actual_call_cost: cost,
        input_caller_id_used: callerIdUsed || null,
      });

      if (error) return jsonError(error.message || "Unable to record call result.", 400, error.code || "DATABASE_ERROR");

      return NextResponse.json({ message: "HelloAirDial call result recorded." }, { status: 200 });
    }

    if (body.action === "create_assisted_link") {
      const { data, error } = await adminClient.rpc(
        "server_create_agent_lead_assisted_link",
        {
          input_agent_user_id: user.id,
          input_lead_id: leadId,
        }
      );

      if (error) {
        return jsonError(
          error.message || "Unable to create assisted shopping link.",
          400,
          error.code || "DATABASE_ERROR"
        );
      }

      const linkRecord = Array.isArray(data) ? data[0] : undefined;

      if (!linkRecord?.assist_token) {
        return jsonError(
          "Unable to create assisted shopping link.",
          400,
          "LINK_NOT_CREATED"
        );
      }

      return NextResponse.json(
        {
          assist_token: linkRecord.assist_token as string,
          expires_at: linkRecord.expires_at as string,
          message: "Single-use assisted shopping link created.",
        },
        { status: 200 }
      );
    }

    return jsonError("Unsupported lead action.", 400, "UNSUPPORTED_ACTION");
  } catch (error) {
    console.error("Protected agent lead action error:", error);
    return jsonError("Unable to process this lead action right now.", 500, "SERVER_ERROR");
  }
}