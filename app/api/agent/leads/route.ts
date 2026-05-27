import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeadAction =
  | "accept_callback"
  | "record_call"
  | "create_assisted_link"
  | "mark_do_not_contact"
  | "create_lead"
  | "submit_review_request";

type Body = {
  action?: unknown;
  lead_id?: unknown;
  outcome?: unknown;
  notes?: unknown;
  follow_up_at?: unknown;
  external_call_id?: unknown;
  call_duration_seconds?: unknown;
  actual_call_cost?: unknown;
  caller_id_used?: unknown;
  customer_name?: unknown;
  phone?: unknown;
  email?: unknown;
  product_interest?: unknown;
  contact_basis?: unknown;
  contact_basis_details?: unknown;
  consent_reference?: unknown;
  consent_recorded_at?: unknown;
  request_type?: unknown;
  related_lead_id?: unknown;
};

const outcomes = new Set([
  "no_answer",
  "interested",
  "follow_up",
  "not_interested",
  "do_not_contact",
  "completed_no_sale",
]);

const contactBases = new Set([
  "customer_requested_call",
  "customer_messaged_business",
  "existing_customer_requested_assistance",
  "documented_consent",
]);

const reviewTypes = new Set([
  "reassignment_or_duplicate",
  "do_not_contact_review",
  "conversion_dispute",
  "compliance_question",
  "other",
]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function reply(message: string, status: number, error = "REQUEST_ERROR") {
  return NextResponse.json({ message, error }, { status });
}

function bearer(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}

function ip(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "local-development"
  );
}

function limiters() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
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

function limited(reset: number) {
  return NextResponse.json(
    { error: "RATE_LIMITED", message: "Too many lead actions. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))),
      },
    }
  );
}

export async function POST(request: Request) {
  try {
    const rate = limiters();
    if (!rate) return reply("Upstash rate limiting is not configured on the server.", 500, "SERVER_CONFIGURATION");

    const ipResult = await rate.ip.limit(ip(request));
    if (!ipResult.success) return limited(ipResult.reset);

    const token = bearer(request);
    if (!token) return reply("Please sign in as an agent.", 401, "UNAUTHORIZED");

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || !secret) return reply("Supabase server configuration is incomplete.", 500, "SERVER_CONFIGURATION");

    const auth = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user) return reply("Your session is invalid. Please sign in again.", 401, "UNAUTHORIZED");

    const userResult = await rate.user.limit(user.id);
    if (!userResult.success) return limited(userResult.reset);

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return reply("Invalid request data.", 400, "INVALID_JSON");
    }

    const action = text(body.action) as LeadAction;
    const leadId = text(body.lead_id);
    const server = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    if (action === "accept_callback") {
      if (!validUuid(leadId)) return reply("Invalid lead request.", 400, "VALIDATION_ERROR");
      const { error } = await server.rpc("server_accept_agent_inbound_callback", {
        input_agent_user_id: user.id,
        input_lead_id: leadId,
      });
      if (error) return reply(error.message || "Unable to accept this callback request.", 400, error.code || "DATABASE_ERROR");
      return NextResponse.json({ message: "Callback request accepted. You may now contact the customer." });
    }

    if (action === "record_call") {
      if (!validUuid(leadId)) return reply("Invalid lead request.", 400, "VALIDATION_ERROR");
      const outcome = text(body.outcome);
      const notes = text(body.notes);
      const followUpAt = text(body.follow_up_at);
      if (!outcomes.has(outcome)) return reply("Invalid call outcome.", 400, "VALIDATION_ERROR");
      if (notes.length > 2000) return reply("Notes must be 2,000 characters or fewer.", 400, "VALIDATION_ERROR");
      if (outcome === "follow_up" && !followUpAt) return reply("Set a follow-up date and time.", 400, "VALIDATION_ERROR");
      const duration = body.call_duration_seconds === null || body.call_duration_seconds === "" || body.call_duration_seconds === undefined ? null : Number(body.call_duration_seconds);
      const cost = body.actual_call_cost === null || body.actual_call_cost === "" || body.actual_call_cost === undefined ? null : Number(body.actual_call_cost);
      if (duration !== null && (!Number.isInteger(duration) || duration < 0)) return reply("Enter a valid duration in seconds.", 400, "VALIDATION_ERROR");
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return reply("Enter a valid call cost.", 400, "VALIDATION_ERROR");
      const { error } = await server.rpc("server_record_agent_helloairdial_call", {
        input_agent_user_id: user.id,
        input_lead_id: leadId,
        input_outcome: outcome,
        input_notes: notes || null,
        input_follow_up_at: followUpAt || null,
        input_external_call_id: text(body.external_call_id) || null,
        input_call_duration_seconds: duration,
        input_actual_call_cost: cost,
        input_caller_id_used: text(body.caller_id_used) || null,
      });
      if (error) return reply(error.message || "Unable to record call result.", 400, error.code || "DATABASE_ERROR");
      return NextResponse.json({ message: "HelloAirDial call result recorded." });
    }

    if (action === "create_assisted_link") {
      if (!validUuid(leadId)) return reply("Invalid lead request.", 400, "VALIDATION_ERROR");
      const { data, error } = await server.rpc("server_create_agent_lead_assisted_link", {
        input_agent_user_id: user.id,
        input_lead_id: leadId,
      });
      if (error) return reply(error.message || "Unable to create assisted shopping link.", 400, error.code || "DATABASE_ERROR");
      const result = Array.isArray(data) ? data[0] : null;
      if (!result?.assist_token) return reply("Unable to create assisted shopping link.", 400, "LINK_NOT_CREATED");
      return NextResponse.json({ message: "Single-use assisted shopping link created.", assist_token: result.assist_token, expires_at: result.expires_at });
    }

    if (action === "mark_do_not_contact") {
      if (!validUuid(leadId)) return reply("Invalid lead request.", 400, "VALIDATION_ERROR");
      const reason = text(body.notes);
      if (reason.length < 3 || reason.length > 500) return reply("Provide a Do Not Contact reason between 3 and 500 characters.", 400, "VALIDATION_ERROR");
      const { error } = await server.rpc("server_mark_agent_lead_do_not_contact", {
        input_agent_user_id: user.id,
        input_lead_id: leadId,
        input_reason: reason,
      });
      if (error) return reply(error.message || "Unable to mark Do Not Contact.", 400, error.code || "DATABASE_ERROR");
      return NextResponse.json({ message: "Lead placed on Do Not Contact list." });
    }

    if (action === "create_lead") {
      const name = text(body.customer_name);
      const phone = text(body.phone);
      const email = text(body.email);
      const basis = text(body.contact_basis);
      const details = text(body.contact_basis_details);
      const consentRef = text(body.consent_reference);
      const consentAt = text(body.consent_recorded_at);
      if (name.length < 2 || name.length > 100) return reply("Customer name must be between 2 and 100 characters.", 400, "VALIDATION_ERROR");
      if (phone.length < 7 || phone.length > 30 || !/^[+0-9() -]+$/.test(phone)) return reply("Enter a valid customer phone number.", 400, "VALIDATION_ERROR");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply("Enter a valid email address or leave it blank.", 400, "VALIDATION_ERROR");
      if (!contactBases.has(basis)) return reply("Choose a valid contact basis.", 400, "VALIDATION_ERROR");
      if (details.length < 5 || details.length > 500) return reply("Record how the customer requested or authorized contact.", 400, "VALIDATION_ERROR");
      if (basis === "documented_consent" && (!consentRef || !consentAt)) return reply("Documented consent requires a reference and recorded date.", 400, "VALIDATION_ERROR");
      const { error } = await server.rpc("server_create_agent_sales_lead", {
        input_agent_user_id: user.id,
        input_customer_name: name,
        input_phone: phone,
        input_email: email || null,
        input_product_interest: text(body.product_interest) || null,
        input_contact_basis: basis,
        input_contact_basis_details: details,
        input_consent_reference: basis === "documented_consent" ? consentRef : null,
        input_consent_recorded_at: basis === "documented_consent" ? consentAt : null,
      });
      if (error) return reply(error.message || "Unable to create lead.", 400, error.code || "DATABASE_ERROR");
      return NextResponse.json({ message: "Lead created and ready for your assisted workflow." }, { status: 201 });
    }

    if (action === "submit_review_request") {
      const type = text(body.request_type);
      const reason = text(body.notes);
      const phone = text(body.phone);
      const relatedLeadId = text(body.related_lead_id);
      if (!reviewTypes.has(type)) return reply("Choose a valid review request type.", 400, "VALIDATION_ERROR");
      if (reason.length < 10 || reason.length > 1000) return reply("Explain the issue using 10 to 1,000 characters.", 400, "VALIDATION_ERROR");
      if (phone && (phone.length > 30 || !/^[+0-9() -]+$/.test(phone))) return reply("Enter a valid phone number or leave it blank.", 400, "VALIDATION_ERROR");
      if (relatedLeadId && !validUuid(relatedLeadId)) return reply("Invalid related lead.", 400, "VALIDATION_ERROR");
      const { error } = await server.rpc("server_submit_agent_lead_review_request", {
        input_agent_user_id: user.id,
        input_request_type: type,
        input_reason: reason,
        input_phone: phone || null,
        input_related_lead_id: relatedLeadId || null,
      });
      if (error) return reply(error.message || "Unable to send admin review request.", 400, error.code || "DATABASE_ERROR");
      return NextResponse.json({ message: "Admin review request submitted." }, { status: 201 });
    }

    return reply("Unsupported lead action.", 400, "UNSUPPORTED_ACTION");
  } catch (error) {
    console.error("Protected agent lead action error:", error);
    return reply("Unable to process this lead action right now.", 500, "SERVER_ERROR");
  }
}