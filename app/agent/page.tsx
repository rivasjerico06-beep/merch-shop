"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Profile, ToastItem } from "@/lib/types";

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
  accepting_inbound_leads: boolean | null;
  inbound_assignment_enabled: boolean | null;
  max_active_inbound_leads: number | null;
  availability_updated_at: string | null;
};

type ReferredOrder = {
  id: string;
  status: string | null;
  total_amount: number | null;
  full_name: string | null;
  payment_method: string | null;
  agent_referral_code: string | null;
  created_at: string;
};

type TrendRow = {
  label: string;
  revenue: number;
  orders: number;
};

type StatusRow = {
  name: string;
  value: number;
};

type LeadConversionMetrics = {
  total_assigned_leads: number;
  contacted_leads: number;
  placed_order_conversions: number;
  delivered_order_conversions: number;
  contact_to_order_percent: number;
  contact_to_delivered_percent: number;
  delivered_revenue: number;
};

const statusColors = ["#7c3aed", "#16a34a", "#f59e0b", "#2563eb", "#dc2626", "#52525b"];

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
  const [referredOrders, setReferredOrders] = useState<ReferredOrder[]>([]);
  const [leadMetrics, setLeadMetrics] = useState<LeadConversionMetrics | null>(null);
  const [agentForm, setAgentForm] = useState(emptyAgentForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const formatUSD = (value: number | null | undefined) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));

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
      setLeadMetrics(null);
      setLoading(false);
      return;
    }

    setUserId(user.id);
    setUserEmail(user.email || "");

    const [profileResult, agentResult, ordersResult, metricsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("agent_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("orders")
        .select(
          "id, status, total_amount, full_name, payment_method, agent_referral_code, created_at"
        )
        .eq("agent_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.rpc("get_my_lead_conversion_metrics"),
    ]);

    if (profileResult.data) {
      setProfile(profileResult.data as Profile);
    }

    if (agentResult.error) {
      addToast("Unable to load agent access", "error");
      console.error("Agent profile load error:", agentResult.error);
    }

    if (agentResult.data) {
      const loadedAgent = agentResult.data as AgentProfile;
      setAgentProfile(loadedAgent);
      setAgentForm({
        display_name: loadedAgent.display_name || "",
        phone: loadedAgent.phone || "",
        notes: loadedAgent.notes || "",
      });
    } else {
      setAgentProfile(null);
      setAgentForm({
        display_name: profileResult.data?.full_name || "",
        phone: profileResult.data?.phone || "",
        notes: "",
      });
    }

    if (ordersResult.error) {
      if (agentResult.data?.status === "approved") {
        addToast("Unable to load guided orders", "error");
        console.error("Guided order load error:", ordersResult.error);
      }
    } else {
      setReferredOrders((ordersResult.data || []) as ReferredOrder[]);
    }

    if (metricsResult.error) {
      if (agentResult.data?.status === "approved") {
        addToast("Unable to load lead conversion metrics", "error");
        console.error("Lead conversion metrics error:", metricsResult.error);
      }
      setLeadMetrics(null);
    } else {
      const rows = (metricsResult.data || []) as LeadConversionMetrics[];
      setLeadMetrics(rows[0] || null);
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

  const submitApplication = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userId) {
      addToast("Please log in as a customer first.", "error");
      return;
    }

    const displayName = agentForm.display_name.trim();
    const phone = agentForm.phone.trim();
    const notes = agentForm.notes.trim();

    if (displayName.length < 2 || displayName.length > 100) {
      addToast("Display name must be between 2 and 100 characters.", "error");
      return;
    }

    if (phone.length > 30) {
      addToast("Phone number is too long.", "error");
      return;
    }

    if (notes.length > 1000) {
      addToast("Notes must be 1,000 characters or fewer.", "error");
      return;
    }

    if (
      agentProfile &&
      agentProfile.status !== "pending"
    ) {
      addToast("This application can no longer be edited.", "error");
      return;
    }

    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      addToast("Your session expired. Please log in again.", "error");
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/agent/application", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        display_name: displayName,
        phone,
        notes,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      if (response.status === 429 || payload.error === "RATE_LIMITED") {
        addToast(
          "Too many application submissions. Please try again later.",
          "error"
        );
      } else {
        addToast(payload.message || "Unable to submit agent application.", "error");
      }

      setSubmitting(false);
      return;
    }

    addToast(
      payload.message || (agentProfile ? "Application updated." : "Application submitted."),
      "success"
    );
    await loadAgentPage();
    setSubmitting(false);
  };

  const copyReferralCode = async () => {
    if (!agentProfile?.referral_code) return;

    try {
      await navigator.clipboard.writeText(agentProfile.referral_code);
      addToast("Referral code copied.", "success");
    } catch {
      addToast("Unable to copy referral code.", "error");
    }
  };

  const copyReferralStoreLink = async () => {
    if (!agentProfile?.referral_code) return;

    const referralLink = `${window.location.origin}/products?ref=${encodeURIComponent(
      agentProfile.referral_code
    )}`;

    try {
      await navigator.clipboard.writeText(referralLink);
      addToast("Referral shopping link copied.", "success");
    } catch {
      addToast("Unable to copy referral shopping link.", "error");
    }
  };

  const toggleInboundAvailability = async () => {
    if (!agentProfile || agentProfile.status !== "approved") return;

    const nextAvailable = !Boolean(agentProfile.accepting_inbound_leads);
    setUpdatingAvailability(true);

    const { error } = await supabase.rpc("set_my_inbound_availability", {
      input_available: nextAvailable,
    });

    if (error) {
      addToast(error.message || "Unable to update availability.", "error");
      setUpdatingAvailability(false);
      return;
    }

    setAgentProfile((previous) =>
      previous
        ? {
            ...previous,
            accepting_inbound_leads: nextAvailable,
            availability_updated_at: new Date().toISOString(),
          }
        : previous
    );

    addToast(
      nextAvailable
        ? "You are now available for new customer callback requests."
        : "You are unavailable for new callback assignments.",
      "success"
    );
    setUpdatingAvailability(false);
  };

  const metrics = useMemo(() => {
    const delivered = referredOrders.filter((order) => order.status === "delivered");
    const active = referredOrders.filter((order) =>
      ["pending", "confirmed", "packed", "shipped"].includes(order.status || "")
    );
    const cancelled = referredOrders.filter((order) => order.status === "cancelled");

    const deliveredSales = delivered.reduce(
      (total, order) => total + Number(order.total_amount || 0),
      0
    );
    const activeValue = active.reduce(
      (total, order) => total + Number(order.total_amount || 0),
      0
    );

    return {
      allOrders: referredOrders.length,
      deliveredOrders: delivered.length,
      deliveredSales,
      activeOrders: active.length,
      activeValue,
      cancelledOrders: cancelled.length,
      deliveredRate:
        referredOrders.length > 0
          ? (delivered.length / referredOrders.length) * 100
          : 0,
    };
  }, [referredOrders]);

  const revenueTrend = useMemo<TrendRow[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result: TrendRow[] = [];

    for (let offset = 29; offset >= 0; offset -= 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - offset);
      const key = day.toISOString().slice(0, 10);

      const ordersForDay = referredOrders.filter(
        (order) =>
          order.status === "delivered" &&
          new Date(order.created_at).toISOString().slice(0, 10) === key
      );

      result.push({
        label: day.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        revenue: ordersForDay.reduce(
          (total, order) => total + Number(order.total_amount || 0),
          0
        ),
        orders: ordersForDay.length,
      });
    }

    return result;
  }, [referredOrders]);

  const statusData = useMemo<StatusRow[]>(() => {
    const groups = new Map<string, number>();

    referredOrders.forEach((order) => {
      const name = titleCase(order.status || "unknown");
      groups.set(name, (groups.get(name) || 0) + 1);
    });

    return Array.from(groups.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }, [referredOrders]);

  if (loading) {
    return (
      <AppShell title="Agent Portal" toasts={toasts}>
        <LoadingCard />
      </AppShell>
    );
  }

  if (!userId) {
    return (
      <AppShell title="Agent Portal" toasts={toasts}>
        <section className="mx-auto max-w-2xl rounded-[2.5rem] border border-[#ded0bf] bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
            Customer Login Required
          </p>
          <h1 className="mt-4 text-4xl font-black">Apply as an Agent</h1>
          <p className="mt-4 text-[#725f4d] dark:text-gray-400">
            Create or log in to a customer account first, then submit your agent
            application. Approved agents remain able to shop personally.
          </p>
          <Link
            href="/login?redirect=/agent"
            className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black"
          >
            Log In to Apply
          </Link>
        </section>
      </AppShell>
    );
  }

  if (agentProfile?.status === "approved") {
    return (
      <AppShell title="Agent Portal" toasts={toasts}>
        <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
                Agent Performance
              </p>
              <h1 className="mt-3 text-4xl font-black md:text-6xl">
                Welcome, {agentProfile.display_name || profile?.full_name || "Agent"}
              </h1>
              <p className="mt-3 max-w-2xl text-[#725f4d] dark:text-gray-400">
                Monitor guided customer orders and completed sales attributed to
                your referral code.
              </p>
            </div>

            <div className="min-w-[290px] rounded-3xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-400/20 dark:bg-violet-400/10">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">
                Referral Code
              </p>
              <p className="mt-2 font-mono text-2xl font-black">
                {agentProfile.referral_code || "Not generated"}
              </p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={copyReferralStoreLink}
                  disabled={!agentProfile.referral_code}
                  className="w-full rounded-full bg-violet-600 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-violet-700 disabled:opacity-50"
                >
                  Copy Shopping Link
                </button>

                <button
                  type="button"
                  onClick={copyReferralCode}
                  disabled={!agentProfile.referral_code}
                  className="w-full rounded-full border border-violet-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-400/20 dark:bg-transparent dark:text-violet-200"
                >
                  Copy Code Only
                </button>
              </div>

              <p className="mt-3 text-xs text-[#725f4d] dark:text-gray-300">
                Share the shopping link with customers you personally assist.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">
                Inbound Customer Requests
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {agentProfile.inbound_assignment_enabled === false
                  ? "Assignment Disabled by Admin"
                  : agentProfile.accepting_inbound_leads
                    ? "Available for New Requests"
                    : "Unavailable for New Requests"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-[#725f4d] dark:text-gray-400">
                Turn availability on only while you can accept new customer-requested
                callback leads. Your maximum active inbound workload is{" "}
                <span className="font-black">
                  {agentProfile.max_active_inbound_leads ?? 15} leads
                </span>.
              </p>
            </div>

            <button
              type="button"
              onClick={toggleInboundAvailability}
              disabled={
                updatingAvailability ||
                agentProfile.inbound_assignment_enabled === false
              }
              className={`rounded-full px-7 py-4 text-xs font-black uppercase tracking-[0.18em] text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                agentProfile.accepting_inbound_leads
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {updatingAvailability
                ? "Updating..."
                : agentProfile.accepting_inbound_leads
                  ? "Go Unavailable"
                  : "Go Available"}
            </button>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Guided Orders" value={metrics.allOrders.toString()} />
          <StatCard label="Delivered Sales" value={formatUSD(metrics.deliveredSales)} highlight />
          <StatCard label="Delivered Orders" value={metrics.deliveredOrders.toString()} />
          <StatCard label="Active Pipeline" value={formatUSD(metrics.activeValue)} />
          <StatCard label="Delivered Rate" value={`${metrics.deliveredRate.toFixed(0)}%`} />
        </section>

        <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h2 className="text-2xl font-black">Lead Conversion Analytics</h2>
              <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
                Based on leads assigned to you and HelloAirDial call outcomes recorded in the portal.
              </p>
            </div>
            <Link
              href="/agent/leads"
              className="rounded-full bg-violet-600 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-violet-700"
            >
              Open My Leads
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Assigned Leads"
              value={String(Number(leadMetrics?.total_assigned_leads || 0))}
            />
            <StatCard
              label="Contacted"
              value={String(Number(leadMetrics?.contacted_leads || 0))}
            />
            <StatCard
              label="Placed Orders"
              value={String(Number(leadMetrics?.placed_order_conversions || 0))}
            />
            <StatCard
              label="Delivered Conversions"
              value={String(Number(leadMetrics?.delivered_order_conversions || 0))}
            />
            <StatCard
              label="Contact-to-Order"
              value={`${Number(leadMetrics?.contact_to_order_percent || 0).toFixed(1)}%`}
              highlight
            />
            <StatCard
              label="Contact-to-Delivered"
              value={`${Number(leadMetrics?.contact_to_delivered_percent || 0).toFixed(1)}%`}
            />
          </div>

          <p className="mt-5 rounded-2xl bg-[#f8efe4] p-4 text-xs text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400">
            Contact-to-Order rate is calculated from contacted assigned leads that later place a verified referral-attributed order. Delivered conversion is shown separately because placed orders can still be pending or cancelled.
          </p>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
          <ChartCard
            title="Delivered Sales Trend"
            subtitle="Revenue attributed to your referral code over the last 30 days."
          >
            <ResponsiveContainer width="100%" height={285}>
              <LineChart data={revenueTrend} margin={{ top: 12, right: 12, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7ded2" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tickFormatter={(value) => `$${value}`} width={64} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatUSD(Number(value))} />
                <Line
                  dataKey="revenue"
                  name="Delivered Sales"
                  stroke="#7c3aed"
                  strokeWidth={3}
                  dot={false}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Order Status"
            subtitle="Status of purchases guided by your referral code."
          >
            {statusData.length === 0 ? (
              <EmptyState text="No guided orders yet." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={205}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={82}
                      paddingAngle={3}
                    >
                      {statusData.map((row, index) => (
                        <Cell
                          key={row.name}
                          fill={statusColors[index % statusColors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>

                <div className="space-y-2">
                  {statusData.map((row, index) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: statusColors[index % statusColors.length],
                          }}
                        />
                        <span className="font-bold">{row.name}</span>
                      </div>
                      <span className="text-[#725f4d] dark:text-gray-400">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <h2 className="text-2xl font-black">Recent Guided Orders</h2>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
              Purchases attributed to your referral code.
            </p>

            <div className="mt-5 space-y-3">
              {referredOrders.length === 0 ? (
                <EmptyState text="No guided orders yet. Share your referral code while assisting customers." />
              ) : (
                referredOrders.slice(0, 10).map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-col justify-between gap-3 rounded-3xl border border-[#ded0bf] bg-[#f8efe4] p-4 dark:border-white/10 dark:bg-white/[0.05] sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-black">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="mt-1 text-xs text-[#725f4d] dark:text-gray-400">
                        {order.full_name || "Customer"} · {titleCase(order.status || "pending")} ·{" "}
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="font-black">{formatUSD(order.total_amount)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="h-fit rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <h2 className="text-2xl font-black">Agent Guidelines</h2>
            <div className="mt-5 space-y-4 text-sm text-[#725f4d] dark:text-gray-400">
              <Guideline text="Give your referral code to customers you personally guide." />
              <Guideline text="Customers must complete purchases using their own accounts." />
              <Guideline text="You cannot receive referral credit from your personal purchases." />
              <Guideline text="Describe products as novelty collectibles only, not investments or redeemable cryptocurrency." />
            </div>
            <p className="mt-6 rounded-2xl bg-[#f8efe4] p-4 text-xs text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400">
              Delivered Rate measures delivered referred orders divided by all
              referred orders. It is not a call conversion rate because calls and
              unsuccessful leads are not yet recorded.
            </p>
          </div>
        </section>
      </AppShell>
    );
  }

  const canEditApplication = !agentProfile || agentProfile.status === "pending";

  return (
    <AppShell title="Agent Application" toasts={toasts}>
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
          Agent Program
        </p>
        <h1 className="mt-3 text-4xl font-black md:text-6xl">
          Apply as an Agent
        </h1>
        <p className="mt-3 max-w-2xl text-[#725f4d] dark:text-gray-400">
          Approved agents receive a referral code to track purchases they help
          customers complete. Your customer shopping access remains active.
        </p>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <form
          onSubmit={submitApplication}
          className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
        >
          <h2 className="text-2xl font-black">
            {agentProfile ? "Application Details" : "Submit Application"}
          </h2>
          <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
            Admin approval is required before referral tracking becomes active.
          </p>

          <div className="mt-6 space-y-4">
            <FormField
              label="Display Name"
              value={agentForm.display_name}
              onChange={(value) =>
                setAgentForm((prev) => ({ ...prev, display_name: value }))
              }
              disabled={!canEditApplication}
              maxLength={100}
              placeholder="Name visible to customers/admin"
            />

            <FormField
              label="Phone"
              value={agentForm.phone}
              onChange={(value) =>
                setAgentForm((prev) => ({ ...prev, phone: value }))
              }
              disabled={!canEditApplication}
              maxLength={30}
              placeholder="Optional contact number"
            />

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
                Notes
              </label>
              <textarea
                value={agentForm.notes}
                onChange={(event) =>
                  setAgentForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                disabled={!canEditApplication}
                maxLength={1000}
                rows={5}
                placeholder="Optional experience or availability"
                className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm outline-none focus:border-violet-600 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
              />
            </div>

            {canEditApplication && (
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-60 dark:bg-white dark:text-black"
              >
                {submitting ? "Submitting..." : agentProfile ? "Update Application" : "Submit Application"}
              </button>
            )}
          </div>
        </form>

        <aside className="h-fit rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">Application Status</h2>
          <div className="mt-5 rounded-3xl bg-[#f8efe4] p-5 dark:bg-white/[0.05]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#725f4d] dark:text-gray-400">
              Current Status
            </p>
            <p className="mt-2 text-3xl font-black capitalize">
              {agentProfile?.status || "Not Applied"}
            </p>
            <p className="mt-2 text-sm text-[#725f4d] dark:text-gray-400">
              {userEmail}
            </p>
          </div>

          {agentProfile?.status === "pending" && (
            <p className="mt-5 text-sm text-[#725f4d] dark:text-gray-400">
              Your application is awaiting admin review. You can edit the details
              while it remains pending.
            </p>
          )}

          {agentProfile?.status === "rejected" && (
            <p className="mt-5 text-sm text-[#725f4d] dark:text-gray-400">
              This application was not approved. Contact an administrator if a
              review is needed.
            </p>
          )}

          {agentProfile?.status === "suspended" && (
            <p className="mt-5 text-sm text-[#725f4d] dark:text-gray-400">
              Agent access is currently suspended. Your customer shopping access
              remains available.
            </p>
          )}
        </aside>
      </section>
    </AppShell>
  );
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function LoadingCard() {
  return (
    <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[2rem] border p-5 shadow-sm ${
        highlight
          ? "border-violet-200 bg-violet-50 dark:border-violet-400/20 dark:bg-violet-400/10"
          : "border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]"
      }`}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#725f4d] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-black">{value}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <h2 className="text-2xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[130px] items-center justify-center rounded-3xl bg-[#f8efe4] p-5 text-center text-sm text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400">
      {text}
    </div>
  );
}

function Guideline({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[10px] font-black text-white">
        ✓
      </span>
      <p>{text}</p>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  disabled,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  maxLength: number;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
        {label}
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm outline-none focus:border-violet-600 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
      />
    </div>
  );
}