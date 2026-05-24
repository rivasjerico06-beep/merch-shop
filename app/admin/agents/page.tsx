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

type AgentWithStats = AgentProfile & {
  total_orders: number;
  total_sales: number;
  delivered_sales: number;
  pending_orders: number;
};

const statusOptions = ["all", "pending", "approved", "rejected", "suspended"];

export default function AdminAgentsPage() {
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentWithStats | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3000);
  };

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
  };

  const fetchAgentsPage = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setAdminProfile(null);
      setUserEmail("");
      setLoading(false);
      return;
    }

    setUserEmail(user.email || "");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      addToast("Unable to load admin profile", "error");
      setAdminProfile(null);
      setLoading(false);
      return;
    }

    setAdminProfile(profileData as Profile);

    if (profileData.role !== "admin") {
      setLoading(false);
      return;
    }

    const [agentsResult, ordersResult] = await Promise.all([
      supabase.from("agent_profiles").select("*").order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id, user_id, status, total_amount, payment_method, full_name, phone, city, province, agent_id, agent_referral_code, agent_name, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (agentsResult.error) {
      addToast("Failed to load agents", "error");
      console.error(agentsResult.error);
    } else {
      setAgents((agentsResult.data || []) as AgentProfile[]);
    }

    if (ordersResult.error) {
      addToast("Failed to load agent orders", "error");
      console.error(ordersResult.error);
    } else {
      setOrders((ordersResult.data || []) as Order[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchAgentsPage();
  }, []);

  const getAgentOrders = (agentUserId: string) => {
    return orders.filter((order) => order.agent_id === agentUserId);
  };

  const agentsWithStats = useMemo<AgentWithStats[]>(() => {
    return agents.map((agent) => {
      const agentOrders = getAgentOrders(agent.user_id);
      const totalSales = agentOrders.reduce((total, order) => total + Number(order.total_amount || 0), 0);
      const deliveredSales = agentOrders
        .filter((order) => order.status === "delivered")
        .reduce((total, order) => total + Number(order.total_amount || 0), 0);
      const pendingOrders = agentOrders.filter((order) => order.status === "pending").length;

      return {
        ...agent,
        total_orders: agentOrders.length,
        total_sales: totalSales,
        delivered_sales: deliveredSales,
        pending_orders: pendingOrders,
      };
    });
  }, [agents, orders]);

  const filteredAgents = useMemo(() => {
    return agentsWithStats.filter((agent) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (agent.display_name || "").toLowerCase().includes(q) ||
        (agent.phone || "").toLowerCase().includes(q) ||
        (agent.referral_code || "").toLowerCase().includes(q) ||
        agent.user_id.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || agent.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [agentsWithStats, search, statusFilter]);

  const summary = useMemo(() => {
    const totalSales = agentsWithStats.reduce((total, agent) => total + agent.total_sales, 0);
    const approved = agentsWithStats.filter((agent) => agent.status === "approved").length;
    const pending = agentsWithStats.filter((agent) => agent.status === "pending").length;
    const totalOrders = agentsWithStats.reduce((total, agent) => total + agent.total_orders, 0);

    return { totalAgents: agentsWithStats.length, approved, pending, totalSales, totalOrders };
  }, [agentsWithStats]);

  const approveAgent = async (agentId: string) => {
    setSavingAgentId(agentId);
    const { error } = await supabase.rpc("approve_agent", { agent_profile_id: agentId });

    if (error) {
      addToast("Failed to approve agent", "error");
      console.error(error);
    } else {
      addToast("Agent approved and referral code generated", "success");
      fetchAgentsPage();
    }

    setSavingAgentId(null);
  };

  const rejectAgent = async (agentId: string) => {
    const confirmed = window.confirm("Reject this agent application?");
    if (!confirmed) return;

    setSavingAgentId(agentId);

    const { error } = await supabase
      .from("agent_profiles")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", agentId);

    if (error) {
      addToast("Failed to reject agent", "error");
      console.error(error);
    } else {
      addToast("Agent rejected", "info");
      fetchAgentsPage();
    }

    setSavingAgentId(null);
  };

  const suspendAgent = async (agentId: string) => {
    const confirmed = window.confirm("Suspend this agent?");
    if (!confirmed) return;

    setSavingAgentId(agentId);

    const { error } = await supabase.rpc("suspend_agent", { agent_profile_id: agentId });

    if (error) {
      addToast("Failed to suspend agent", "error");
      console.error(error);
    } else {
      addToast("Agent suspended", "info");
      fetchAgentsPage();
    }

    setSavingAgentId(null);
  };

  const reactivateAgent = async (agentId: string) => {
    setSavingAgentId(agentId);

    const { error } = await supabase.rpc("approve_agent", { agent_profile_id: agentId });

    if (error) {
      addToast("Failed to reactivate agent", "error");
      console.error(error);
    } else {
      addToast("Agent reactivated", "success");
      fetchAgentsPage();
    }

    setSavingAgentId(null);
  };

  const copyCode = async (code: string | null) => {
    if (!code) {
      addToast("No referral code yet", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      addToast("Referral code copied", "success");
    } catch {
      addToast("Unable to copy code", "error");
    }
  };

  if (loading) {
    return (
      <AppShell title="Admin Agents" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!adminProfile) {
    return (
      <AppShell title="Admin Agents" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-[#ded0bf] bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Login required</p>
          <h1 className="mt-4 text-4xl font-black">Admin Login</h1>
          <p className="mt-4 text-[#725f4d] dark:text-gray-400">Please login with your admin account to manage agents.</p>
          <Link href="/login?redirect=/admin/agents" className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white dark:bg-white dark:text-black">
            Login as Admin
          </Link>
        </section>
      </AppShell>
    );
  }

  if (adminProfile.role !== "admin") {
    return (
      <AppShell title="Admin Agents" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-[#ded0bf] bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-red-600">Access Denied</p>
          <h1 className="mt-4 text-4xl font-black">Admin Only</h1>
          <p className="mt-4 text-[#725f4d] dark:text-gray-400">This page is only for accounts with <b>role = admin</b>.</p>
          <Link href="/" className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white dark:bg-white dark:text-black">
            Back to Shop
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Admin Agents"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search agents, phone, code, or user ID..."
      toasts={toasts}
    >
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Agent Management</p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">Agents</h1>
            <p className="mt-3 max-w-2xl text-[#725f4d] dark:text-gray-400">
              Approve agents, generate referral codes, track guided orders, and review agent sales performance.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchAgentsPage}
              className="rounded-full border border-[#cdbba7] bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white dark:hover:text-black"
            >
              Refresh
            </button>
            <Link
              href="/admin"
              className="rounded-full bg-zinc-950 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black dark:hover:bg-violet-400"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-5">
        <StatCard label="Agents" value={summary.totalAgents.toString()} />
        <StatCard label="Approved" value={summary.approved.toString()} />
        <StatCard label="Pending" value={summary.pending.toString()} />
        <StatCard label="Guided Orders" value={summary.totalOrders.toString()} />
        <StatCard label="Guided Sales" value={formatUSD(summary.totalSales)} />
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-600 dark:border-white/10 dark:bg-zinc-900 dark:text-white md:max-w-xs"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status} className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white">
                  {status === "all" ? "All Statuses" : status}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
            }}
            className="rounded-2xl border border-[#cdbba7] bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white dark:hover:text-black"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <h2 className="text-2xl font-black">Agent List</h2>
        <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
          Showing {filteredAgents.length} of {agentsWithStats.length} agents.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1060px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#ded0bf] text-xs uppercase tracking-[0.2em] text-[#725f4d] dark:border-white/10 dark:text-gray-400">
                <th className="py-4">Agent</th>
                <th className="py-4">Code</th>
                <th className="py-4">Phone</th>
                <th className="py-4">Status</th>
                <th className="py-4">Orders</th>
                <th className="py-4">Sales</th>
                <th className="py-4">Delivered</th>
                <th className="py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => (
                <tr key={agent.id} className="border-b border-[#eadfd1] dark:border-white/5">
                  <td className="py-4">
                    <p className="font-black">{agent.display_name || "Unnamed Agent"}</p>
                    <p className="text-xs text-[#725f4d] dark:text-gray-400">{agent.user_id.slice(0, 8)}</p>
                  </td>
                  <td className="py-4">
                    {agent.referral_code ? (
                      <button
                        onClick={() => copyCode(agent.referral_code)}
                        className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black text-white"
                      >
                        {agent.referral_code}
                      </button>
                    ) : (
                      <span className="text-[#725f4d] dark:text-gray-400">Not generated</span>
                    )}
                  </td>
                  <td className="py-4 text-[#725f4d] dark:text-gray-400">{agent.phone || "N/A"}</td>
                  <td className="py-4"><StatusBadge status={agent.status} /></td>
                  <td className="py-4 font-bold">{agent.total_orders}</td>
                  <td className="py-4 font-black">{formatUSD(agent.total_sales)}</td>
                  <td className="py-4 font-black">{formatUSD(agent.delivered_sales)}</td>
                  <td className="py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setSelectedAgent(agent)}
                        className="rounded-full border border-[#cdbba7] bg-white px-4 py-2 text-xs font-bold transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white dark:hover:text-black"
                      >
                        Details
                      </button>

                      {agent.status !== "approved" && (
                        <button
                          disabled={savingAgentId === agent.id}
                          onClick={() => approveAgent(agent.id)}
                          className="rounded-full bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          Approve
                        </button>
                      )}

                      {agent.status === "pending" && (
                        <button
                          disabled={savingAgentId === agent.id}
                          onClick={() => rejectAgent(agent.id)}
                          className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      )}

                      {agent.status === "approved" && (
                        <button
                          disabled={savingAgentId === agent.id}
                          onClick={() => suspendAgent(agent.id)}
                          className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Suspend
                        </button>
                      )}

                      {agent.status === "suspended" && (
                        <button
                          disabled={savingAgentId === agent.id}
                          onClick={() => reactivateAgent(agent.id)}
                          className="rounded-full bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredAgents.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#725f4d] dark:text-gray-400">
                    No agents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedAgent && (
        <AgentDetailsModal
          agent={selectedAgent}
          orders={getAgentOrders(selectedAgent.user_id)}
          onClose={() => setSelectedAgent(null)}
          formatUSD={formatUSD}
        />
      )}
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#725f4d] dark:text-gray-400">{label}</p>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "approved"
      ? "bg-green-600"
      : status === "pending"
      ? "bg-yellow-500 text-black"
      : status === "suspended"
      ? "bg-red-600"
      : "bg-zinc-500";

  return <span className={`rounded-full px-3 py-1 text-xs font-black uppercase text-white ${className}`}>{status}</span>;
}

function AgentDetailsModal({
  agent,
  orders,
  onClose,
  formatUSD,
}: {
  agent: AgentWithStats;
  orders: Order[];
  onClose: () => void;
  formatUSD: (value: number) => string;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xl">
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:p-8">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-2 text-sm font-bold text-white dark:bg-white dark:text-black"
        >
          ✕
        </button>

        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Agent Details</p>
        <h2 className="mt-3 text-3xl font-black">{agent.display_name || "Unnamed Agent"}</h2>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <DetailStat label="Orders" value={agent.total_orders.toString()} />
          <DetailStat label="Sales" value={formatUSD(agent.total_sales)} />
          <DetailStat label="Delivered" value={formatUSD(agent.delivered_sales)} />
          <DetailStat label="Pending" value={agent.pending_orders.toString()} />
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[2rem] border border-[#ded0bf] bg-[#f8efe4] p-5 dark:border-white/10 dark:bg-white/[0.05]">
            <h3 className="text-xl font-black">Profile</h3>
            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Referral Code" value={agent.referral_code || "N/A"} />
              <InfoRow label="Phone" value={agent.phone || "N/A"} />
              <InfoRow label="Status" value={agent.status} />
              <InfoRow label="Approved At" value={agent.approved_at ? new Date(agent.approved_at).toLocaleString() : "N/A"} />
              <InfoRow label="Notes" value={agent.notes || "No notes"} />
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#ded0bf] bg-[#f8efe4] p-5 dark:border-white/10 dark:bg-white/[0.05]">
            <h3 className="text-xl font-black">Recent Guided Orders</h3>
            <div className="mt-4 space-y-3">
              {orders.length === 0 ? (
                <p className="rounded-2xl bg-white p-4 text-sm text-[#725f4d] dark:bg-white/[0.03] dark:text-gray-400">
                  No referred orders yet.
                </p>
              ) : (
                orders.slice(0, 8).map((order) => (
                  <div key={order.id} className="rounded-2xl border border-[#ded0bf] bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                      <div>
                        <p className="font-black">#{order.id.slice(0, 8).toUpperCase()}</p>
                        <p className="text-xs text-[#725f4d] dark:text-gray-400">{order.full_name || "Customer"} · {order.status || "pending"}</p>
                      </div>
                      <p className="font-black">{formatUSD(Number(order.total_amount || 0))}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-2xl border border-[#cdbba7] py-4 text-sm font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
        >
          Close Details
        </button>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[#ded0bf] bg-[#f8efe4] p-5 dark:border-white/10 dark:bg-white/[0.05]">
      <p className="text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">{label}</p>
      <p className="mt-2 break-words text-sm font-black">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}