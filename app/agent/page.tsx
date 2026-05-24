"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Order, Profile, ToastItem } from "@/lib/types";

type AgentProfile = {
  id: string;
  user_id: string;
  referral_code: string | null;
  status: "pending" | "approved" | "rejected" | "suspended";
  display_name: string | null;
  phone: string | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const emptyAgentForm = {
  display_name: "",
  phone: "",
  notes: "",
};

export default function AgentPage() {
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null);
  const [referredOrders, setReferredOrders] = useState<Order[]>([]);
  const [agentForm, setAgentForm] = useState(emptyAgentForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));
  };

  const loadAgentPage = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserId("");
      setUserEmail("");
      setProfile(null);
      setAgentProfile(null);
      setReferredOrders([]);
      setLoading(false);
      return;
    }

    setUserId(user.id);
    setUserEmail(user.email || "");

    const [profileResult, agentResult, ordersResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("agent_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("orders")
        .select(
          "id, user_id, status, total_amount, payment_method, full_name, phone, city, province, created_at"
        )
        .eq("agent_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (profileResult.data) {
      setProfile(profileResult.data as Profile);
    }

    if (agentResult.error) {
      console.error(agentResult.error);
      addToast("Unable to load agent profile", "error");
    }

    if (agentResult.data) {
      const data = agentResult.data as AgentProfile;
      setAgentProfile(data);
      setAgentForm({
        display_name: data.display_name || "",
        phone: data.phone || "",
        notes: data.notes || "",
      });
    } else {
      setAgentProfile(null);
      setAgentForm({
        display_name: profileResult.data?.full_name || "",
        phone: profileResult.data?.phone || "",
        notes: "",
      });
    }

    if (!ordersResult.error) {
      setReferredOrders((ordersResult.data || []) as Order[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAgentPage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadAgentPage();
    });

    return () => subscription.unsubscribe();
  }, []);

  const submitApplication = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userId) {
      addToast("Please login first", "error");
      return;
    }

    if (!agentForm.display_name.trim()) {
      addToast("Display name is required", "error");
      return;
    }

    if (agentForm.display_name.length > 100) {
      addToast("Display name is too long", "error");
      return;
    }

    if (agentForm.phone.length > 30) {
      addToast("Phone number is too long", "error");
      return;
    }

    if (agentForm.notes.length > 1000) {
      addToast("Notes are too long", "error");
      return;
    }

    setSubmitting(true);

    const payload = {
      user_id: userId,
      display_name: agentForm.display_name.trim(),
      phone: agentForm.phone.trim(),
      notes: agentForm.notes.trim(),
      status: "pending",
      updated_at: new Date().toISOString(),
    };

    const result = agentProfile
      ? await supabase
          .from("agent_profiles")
          .update({
            display_name: payload.display_name,
            phone: payload.phone,
            notes: payload.notes,
            updated_at: payload.updated_at,
          })
          .eq("user_id", userId)
      : await supabase.from("agent_profiles").insert(payload);

    if (result.error) {
      addToast("Unable to submit agent application", "error");
      console.error(result.error);
    } else {
      addToast("Agent application submitted", "success");
      loadAgentPage();
    }

    setSubmitting(false);
  };

  const copyReferralCode = async () => {
    if (!agentProfile?.referral_code) return;

    try {
      await navigator.clipboard.writeText(agentProfile.referral_code);
      addToast("Referral code copied", "success");
    } catch {
      addToast("Unable to copy referral code", "error");
    }
  };

  const stats = useMemo(() => {
    const totalSales = referredOrders.reduce(
      (total, order) => total + Number(order.total_amount || 0),
      0
    );

    const deliveredSales = referredOrders
      .filter((order) => order.status === "delivered")
      .reduce((total, order) => total + Number(order.total_amount || 0), 0);

    const pendingOrders = referredOrders.filter(
      (order) => order.status === "pending"
    ).length;

    return {
      totalOrders: referredOrders.length,
      totalSales,
      deliveredSales,
      pendingOrders,
    };
  }, [referredOrders]);

  const statusLabel = agentProfile?.status || "not applied";

  if (loading) {
    return (
      <AppShell title="Agent" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!userId) {
    return (
      <AppShell title="Agent" toasts={toasts}>
        <section className="mx-auto max-w-2xl rounded-[2.5rem] border border-[#ded0bf] bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
            Login required
          </p>
          <h1 className="mt-4 text-4xl font-black">Agent Access</h1>
          <p className="mt-4 text-[#725f4d] dark:text-gray-400">
            Please login first to apply as an agent or view your agent dashboard.
          </p>

          <Link
            href="/login?redirect=/agent"
            className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black dark:hover:bg-violet-400"
          >
            Go to Login
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell title="Agent" toasts={toasts}>
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
              Agent Program
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Agent Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-[#725f4d] dark:text-gray-400">
              Apply as an outbound agent, get approved by admin, and use your
              referral code to track guided customer purchases.
            </p>
          </div>

          <div className="rounded-3xl bg-[#f8efe4] p-5 dark:bg-white/[0.05]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#725f4d] dark:text-gray-400">
              Status
            </p>
            <p className="mt-1 text-3xl font-black capitalize">{statusLabel}</p>
            <p className="text-sm text-[#725f4d] dark:text-gray-400">
              {userEmail}
            </p>
          </div>
        </div>
      </section>

      {agentProfile?.status === "approved" ? (
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-4">
            <StatCard label="Guided Orders" value={stats.totalOrders.toString()} />
            <StatCard label="Total Guided Sales" value={formatUSD(stats.totalSales)} />
            <StatCard label="Delivered Sales" value={formatUSD(stats.deliveredSales)} />
            <StatCard label="Pending Orders" value={stats.pendingOrders.toString()} />
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
            <aside className="h-fit rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <h2 className="text-2xl font-black">Referral Code</h2>
              <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
                Give this code to customers you guide during outbound calls.
              </p>

              <div className="mt-5 rounded-3xl bg-[#f8efe4] p-5 text-center dark:bg-white/[0.05]">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#725f4d] dark:text-gray-400">
                  Code
                </p>
                <p className="mt-2 text-3xl font-black">
                  {agentProfile.referral_code}
                </p>
              </div>

              <button
                onClick={copyReferralCode}
                className="mt-5 w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black dark:hover:bg-violet-400"
              >
                Copy Code
              </button>

              <div className="mt-5 rounded-3xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                <p className="font-black">Agent Reminder</p>
                <p className="mt-1">
                  Explain that products are novelty collectibles only. Do not
                  claim they are investments, legal tender, cryptocurrency, or
                  redeemable for monetary value.
                </p>
              </div>
            </aside>

            <section className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <h2 className="text-2xl font-black">Recent Guided Orders</h2>
              <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
                Orders linked to your referral code.
              </p>

              <div className="mt-5 space-y-3">
                {referredOrders.length === 0 ? (
                  <p className="rounded-3xl bg-[#f8efe4] p-5 text-sm text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400">
                    No guided orders yet.
                  </p>
                ) : (
                  referredOrders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-3xl border border-[#ded0bf] bg-[#f8efe4] p-5 dark:border-white/10 dark:bg-white/[0.05]"
                    >
                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                        <div>
                          <p className="font-black">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </p>
                          <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
                            {order.full_name || "Customer"} ·{" "}
                            {order.payment_method || "COD"} ·{" "}
                            {order.status || "pending"}
                          </p>
                        </div>

                        <p className="font-black">
                          {formatUSD(Number(order.total_amount || 0))}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </section>
        </>
      ) : (
        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <form
            onSubmit={submitApplication}
            className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
          >
            <h2 className="text-2xl font-black">
              {agentProfile ? "Update Application" : "Apply as Agent"}
            </h2>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
              Admin must approve your account before a referral code becomes
              active.
            </p>

            <div className="mt-6 space-y-4">
              <AgentInput
                label="Display Name"
                value={agentForm.display_name}
                onChange={(value) =>
                  setAgentForm((prev) => ({ ...prev, display_name: value }))
                }
                placeholder="Agent display name"
              />

              <AgentInput
                label="Phone"
                value={agentForm.phone}
                onChange={(value) =>
                  setAgentForm((prev) => ({ ...prev, phone: value }))
                }
                placeholder="Optional phone number"
              />

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
                  Notes
                </label>
                <textarea
                  value={agentForm.notes}
                  onChange={(e) =>
                    setAgentForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  rows={5}
                  placeholder="Optional: experience, schedule, reason for applying"
                  className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-600 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:placeholder:text-gray-500"
                />
              </div>

              <button
                disabled={submitting || agentProfile?.status === "suspended"}
                className="w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-violet-400"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </form>

          <aside className="h-fit rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <h2 className="text-2xl font-black">Application Status</h2>

            <div className="mt-5 rounded-3xl bg-[#f8efe4] p-5 dark:bg-white/[0.05]">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#725f4d] dark:text-gray-400">
                Current Status
              </p>
              <p className="mt-2 text-3xl font-black capitalize">
                {statusLabel}
              </p>
            </div>

            <div className="mt-5 space-y-3 text-sm text-[#725f4d] dark:text-gray-400">
              <p><b>Pending:</b> Waiting for admin approval.</p>
              <p><b>Approved:</b> Referral code is active.</p>
              <p><b>Rejected:</b> Application was not approved.</p>
              <p><b>Suspended:</b> Agent access was disabled.</p>
            </div>
          </aside>
        </section>
      )}
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#725f4d] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}

function AgentInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-600 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:placeholder:text-gray-500"
      />
    </div>
  );
}