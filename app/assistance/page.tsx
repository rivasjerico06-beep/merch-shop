"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { ToastItem } from "@/lib/types";

type AssistanceRequest = {
  id: string;
  customer_name: string;
  phone: string;
  product_interest: string | null;
  preferred_callback_at: string | null;
  status: string;
  call_permission_status: string;
  do_not_contact: boolean;
  created_at: string;
  last_contacted_at: string | null;
  converted_order_id: string | null;
};

type RequestForm = {
  full_name: string;
  phone: string;
  email: string;
  product_interest: string;
  preferred_callback_at: string;
  notes: string;
  callback_consent: boolean;
};

const emptyForm: RequestForm = {
  full_name: "",
  phone: "",
  email: "",
  product_interest: "",
  preferred_callback_at: "",
  notes: "",
  callback_consent: false,
};

export default function AssistancePage() {
  const searchParams = useSearchParams();
  const selectedProductFromLink = searchParams.get("product")?.trim() || "";

  const [userId, setUserId] = useState("");
  const [form, setForm] = useState<RequestForm>(emptyForm);
  const [requests, setRequests] = useState<AssistanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((previous) => [...previous, { id, message, type }]);
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 3500);
  };

  const loadPage = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserId("");
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const [profileResult, requestResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("sales_leads")
        .select(
          "id, customer_name, phone, product_interest, preferred_callback_at, status, call_permission_status, do_not_contact, created_at, last_contacted_at, converted_order_id"
        )
        .eq("customer_user_id", user.id)
        .eq("created_via", "website_request")
        .order("created_at", { ascending: false }),
    ]);

    const customerProfile = profileResult.data;

    if (customerProfile) {
      setForm((previous) => ({
        ...previous,
        full_name: previous.full_name || customerProfile.full_name || "",
        phone: previous.phone || customerProfile.phone || "",
        email: previous.email || user.email || "",
        product_interest:
          previous.product_interest || selectedProductFromLink || "",
      }));
    } else {
      setForm((previous) => ({
        ...previous,
        email: previous.email || user.email || "",
        product_interest:
          previous.product_interest || selectedProductFromLink || "",
      }));
    }

    if (requestResult.error) {
      addToast("Unable to load your assistance requests.", "error");
      console.warn("Assistance requests load issue:", requestResult.error);
    } else {
      setRequests((requestResult.data || []) as AssistanceRequest[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductFromLink]);

  const activeRequest = useMemo(
    () =>
      requests.find((request) =>
        ["new", "assigned", "attempted", "interested", "follow_up"].includes(
          request.status
        )
      ) || null,
    [requests]
  );

  const validateForm = () => {
    const name = form.full_name.trim();
    const phone = form.phone.trim();
    const product = form.product_interest.trim();

    if (name.length < 2 || name.length > 100) {
      return "Enter your full name.";
    }

    if (phone.length < 7 || phone.length > 30 || !/^[+0-9() -]+$/.test(phone)) {
      return "Enter a valid callback phone number.";
    }

    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      return "Enter a valid email address.";
    }

    if (product.length < 2 || product.length > 200) {
      return "Tell us which product you need assistance with.";
    }

    if (form.notes.trim().length > 500) {
      return "Additional notes must be 500 characters or fewer.";
    }

    if (!form.callback_consent) {
      return "Confirm that you want an agent to contact you about this request.";
    }

    return "";
  };

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      addToast(validationError, "error");
      return;
    }

    setSubmitting(true);

    const { data, error } = await supabase.rpc(
      "request_product_assistance_callback",
      {
        input_full_name: form.full_name.trim(),
        input_phone: form.phone.trim(),
        input_email: form.email.trim() || null,
        input_product_interest: form.product_interest.trim(),
        input_preferred_callback_at: form.preferred_callback_at
          ? new Date(form.preferred_callback_at).toISOString()
          : null,
        input_notes: form.notes.trim() || null,
        input_callback_consent: form.callback_consent,
        input_callback_notice_version: "callback-v1",
      }
    );

    if (error) {
      addToast(error.message || "Unable to submit assistance request.", "error");
      setSubmitting(false);
      return;
    }

    const result = Array.isArray(data)
      ? (data[0] as { assigned_to_agent: boolean } | undefined)
      : undefined;

    addToast(
      result?.assigned_to_agent
        ? "Your request was sent to an agent. They may contact you using your provided number."
        : "Your request was received and is awaiting assignment.",
      "success"
    );

    setForm((previous) => ({
      ...emptyForm,
      full_name: previous.full_name,
      phone: previous.phone,
      email: previous.email,
    }));

    await loadPage();
    setSubmitting(false);
  };

  const withdrawRequest = async (
    request: AssistanceRequest,
    doNotCall: boolean
  ) => {
    const confirmation = window.confirm(
      doNotCall
        ? "Choose Do Not Call? This blocks future agent calls to this phone number until reviewed."
        : "Cancel this callback request?"
    );

    if (!confirmation) return;

    setActionId(request.id);

    const { error } = await supabase.rpc("withdraw_my_assistance_callback", {
      input_lead_id: request.id,
      input_do_not_call: doNotCall,
    });

    if (error) {
      addToast(error.message || "Unable to update your request.", "error");
    } else {
      addToast(
        doNotCall
          ? "Your preference was saved. Agents must not call this number."
          : "Your callback request was cancelled.",
        "success"
      );
      await loadPage();
    }

    setActionId(null);
  };

  if (loading) {
    return (
      <AppShell title="Request Assistance" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#093459]/12 bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#58948f] border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!userId) {
    return (
      <AppShell title="Request Assistance" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-[#093459]/12 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
            Customer Assistance
          </p>
          <h1 className="mt-4 text-4xl font-black">Request a Product Call</h1>
          <p className="mt-4 text-[#093459]/60 dark:text-gray-400">
            Log in first so your assistance request and any assisted order can
            be connected securely to your account.
          </p>
          <Link
            href="/login?redirect=/assistance"
            className="mt-6 inline-block rounded-full bg-[#093459] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-[#58948f] dark:bg-[#58948f] dark:text-white dark:hover:bg-[#6fb0aa]"
          >
            Log In to Continue
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell title="Request Assistance" toasts={toasts}>
      {/* ── Header ── */}
      <section className="rounded-[2.5rem] border border-[#093459]/12 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
          Product Assistance
        </p>
        <h1 className="mt-3 text-4xl font-black md:text-6xl">
          Request a Call
        </h1>
        <p className="mt-3 max-w-3xl text-[#093459]/60 dark:text-gray-400">
          Need guidance before ordering? Submit your request and an available
          approved agent may call you through HelloAirDial regarding the product
          you selected.
        </p>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        {/* ── Form ── */}
        <form
          onSubmit={submitRequest}
          className="rounded-[2rem] border border-[#093459]/12 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
        >
          <h2 className="text-2xl font-black">Callback Details</h2>
          <p className="mt-1 text-sm text-[#093459]/60 dark:text-gray-400">
            Only submit a number where you want to receive this requested call.
          </p>

          {selectedProductFromLink && (
            <div className="mt-6 rounded-2xl border border-[#58948f]/25 bg-[#58948f]/10 p-4 text-sm text-[#093459] dark:border-[#58948f]/25 dark:text-[#d9efed]">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#58948f]">
                Selected Product
              </p>
              <p className="mt-2 font-black">{selectedProductFromLink}</p>
              <p className="mt-1 text-xs opacity-75">
                You may edit the product field below before submitting.
              </p>
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field
              label="Full Name"
              value={form.full_name}
              onChange={(value) =>
                setForm((previous) => ({ ...previous, full_name: value }))
              }
              maxLength={100}
            />
            <Field
              label="Phone Number"
              value={form.phone}
              onChange={(value) =>
                setForm((previous) => ({ ...previous, phone: value }))
              }
              maxLength={30}
            />
            <Field
              label="Email (Optional)"
              type="email"
              value={form.email}
              onChange={(value) =>
                setForm((previous) => ({ ...previous, email: value }))
              }
              maxLength={254}
            />
            <Field
              label="Product of Interest"
              value={form.product_interest}
              onChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  product_interest: value,
                }))
              }
              maxLength={200}
            />
            <div className="sm:col-span-2">
              <Field
                label="Preferred Callback Time (Optional)"
                type="datetime-local"
                value={form.preferred_callback_at}
                onChange={(value) =>
                  setForm((previous) => ({
                    ...previous,
                    preferred_callback_at: value,
                  }))
                }
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#093459]/50 dark:text-gray-400">
              Notes (Optional)
            </label>
            <textarea
              rows={4}
              maxLength={500}
              value={form.notes}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  notes: event.target.value,
                }))
              }
              placeholder="Question about quantity, product details, checkout assistance..."
              className="w-full rounded-2xl border border-[#093459]/20 bg-white px-4 py-3 text-sm outline-none focus:border-[#58948f] dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            />
          </div>

          {/* ── Consent checkbox ── */}
          <label className="mt-5 flex gap-3 rounded-2xl border border-[#58948f]/30 bg-[#58948f]/08 p-4 text-sm text-[#093459] dark:border-[#58948f]/25 dark:bg-[#58948f]/10 dark:text-[#d9efed]">
            <input
              type="checkbox"
              checked={form.callback_consent}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  callback_consent: event.target.checked,
                }))
              }
              className="mt-1 h-4 w-4 accent-[#58948f]"
            />
            <span>
              I request a call about my selected product and permit an assigned
              agent to contact me at the phone number I provided. I understand I
              can cancel this request or choose Do Not Call below.
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting || Boolean(activeRequest)}
            className="mt-6 w-full rounded-2xl bg-[#093459] py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#58948f] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#58948f] dark:text-white dark:hover:bg-[#6fb0aa]"
          >
            {activeRequest
              ? "Active Request Already Exists"
              : submitting
                ? "Submitting..."
                : "Request a Call"}
          </button>
        </form>

        {/* ── My Requests ── */}
        <aside className="h-fit rounded-[2rem] border border-[#093459]/12 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">My Requests</h2>
          <p className="mt-1 text-sm text-[#093459]/60 dark:text-gray-400">
            You control whether agents may continue calling about your request.
          </p>

          <div className="mt-5 space-y-4">
            {requests.length === 0 ? (
              <p className="rounded-3xl bg-[#093459]/05 p-6 text-center text-sm text-[#093459]/50 dark:bg-white/[0.05] dark:text-gray-400">
                You have no assistance requests yet.
              </p>
            ) : (
              requests.slice(0, 8).map((request) => {
                const active = [
                  "new",
                  "assigned",
                  "attempted",
                  "interested",
                  "follow_up",
                ].includes(request.status);

                return (
                  <div
                    key={request.id}
                    className="rounded-3xl border border-[#093459]/10 p-4 dark:border-white/10"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-black">
                          {request.product_interest || "Product Assistance"}
                        </p>
                        <p className="mt-1 text-xs text-[#093459]/50 dark:text-gray-400">
                          Requested {new Date(request.created_at).toLocaleString()}
                        </p>
                      </div>
                      <StatusBadge status={request.status} />
                    </div>

                    {request.preferred_callback_at && (
                      <p className="mt-3 text-sm text-[#093459]/60 dark:text-gray-300">
                        Preferred call time:{" "}
                        {new Date(request.preferred_callback_at).toLocaleString()}
                      </p>
                    )}

                    {active && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionId === request.id}
                          onClick={() => withdrawRequest(request, false)}
                          className="rounded-full border border-[#093459]/20 px-4 py-2 text-xs font-black transition hover:bg-[#093459] hover:text-white dark:border-white/10 dark:hover:bg-[#58948f]"
                        >
                          Cancel Request
                        </button>
                        <button
                          type="button"
                          disabled={actionId === request.id}
                          onClick={() => withdrawRequest(request, true)}
                          className="rounded-full bg-red-600 px-4 py-2 text-xs font-black text-white transition hover:bg-red-700"
                        >
                          Do Not Call Me
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "converted"
      ? "bg-green-600"
      : status === "do_not_contact"
        ? "bg-red-600"
        : status === "assigned" || status === "interested" || status === "follow_up"
          ? "bg-[#58948f]"
          : status === "not_interested"
            ? "bg-zinc-500"
            : "bg-amber-500 text-black";

  return (
    <span
      className={`h-fit rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${style}`}
    >
      {titleCase(status)}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#093459]/50 dark:text-gray-400">
        {label}
      </label>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#093459]/20 bg-white px-4 py-3 text-sm outline-none focus:border-[#58948f] dark:border-white/10 dark:bg-zinc-900 dark:text-white"
      />
    </div>
  );
}