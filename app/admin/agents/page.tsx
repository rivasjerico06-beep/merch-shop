"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
  approved_at: string | null;
  created_at: string;
  accepting_inbound_leads: boolean | null;
  inbound_assignment_enabled: boolean | null;
  max_active_inbound_leads: number | null;
};

type AgentOrder = {
  id: string;
  agent_id: string | null;
  status: string | null;
  total_amount: number | null;
  full_name: string | null;
  created_at: string;
};

type AgentRow = AgentProfile & {
  allOrders: number;
  deliveredOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  deliveredRevenue: number;
  pipelineValue: number;
  deliveredRate: number;
};

type InboundWorkload = {
  agent_id: string;
  agent_name: string;
  accepting_inbound_leads: boolean;
  inbound_assignment_enabled: boolean;
  max_active_inbound_leads: number;
  active_inbound_leads: number;
  remaining_capacity: number;
  last_inbound_assigned_at: string | null;
};

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "suspended";

export default function AdminAgentsPage() {
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [orders, setOrders] = useState<AgentOrder[]>([]);
  const [inboundWorkload, setInboundWorkload] = useState<InboundWorkload[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentRow | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
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

  const loadAgents = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

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
      addToast("Unable to load admin profile.", "error");
      setAdminProfile(null);
      setLoading(false);
      return;
    }

    setAdminProfile(profileData as Profile);

    if (profileData.role !== "admin") {
      setLoading(false);
      return;
    }

    const [agentResult, orderResult, workloadResult] = await Promise.all([
      supabase
        .from("agent_profiles")
        .select(
          "id, user_id, referral_code, status, display_name, phone, notes, approved_at, created_at, accepting_inbound_leads, inbound_assignment_enabled, max_active_inbound_leads"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id, agent_id, status, total_amount, full_name, created_at")
        .not("agent_id", "is", null)
        .order("created_at", { ascending: false }),
      supabase.rpc("get_admin_agent_inbound_workload"),
    ]);

    if (agentResult.error) {
      addToast("Unable to load agents.", "error");
      console.error("Agents load error:", agentResult.error);
    } else {
      setAgents((agentResult.data || []) as AgentProfile[]);
    }

    if (orderResult.error) {
      addToast("Unable to load attributed sales.", "error");
      console.error("Attributed orders load error:", orderResult.error);
    } else {
      setOrders((orderResult.data || []) as AgentOrder[]);
    }

    if (workloadResult.error) {
      console.error("Workload load error:", workloadResult.error);
    } else {
      setInboundWorkload((workloadResult.data || []) as InboundWorkload[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const agentRows = useMemo<AgentRow[]>(() => {
    return agents.map((agent) => {
      const guidedOrders = orders.filter((order) => order.agent_id === agent.user_id);
      const delivered = guidedOrders.filter((order) => order.status === "delivered");
      const active = guidedOrders.filter((order) =>
        ["pending", "confirmed", "packed", "shipped"].includes(order.status || "")
      );
      const cancelled = guidedOrders.filter((order) => order.status === "cancelled");

      const deliveredRevenue = delivered.reduce(
        (total, order) => total + Number(order.total_amount || 0),
        0
      );
      const pipelineValue = active.reduce(
        (total, order) => total + Number(order.total_amount || 0),
        0
      );

      return {
        ...agent,
        allOrders: guidedOrders.length,
        deliveredOrders: delivered.length,
        activeOrders: active.length,
        cancelledOrders: cancelled.length,
        deliveredRevenue,
        pipelineValue,
        deliveredRate:
          guidedOrders.length > 0 ? (delivered.length / guidedOrders.length) * 100 : 0,
      };
    });
  }, [agents, orders]);

  const rankedAgents = useMemo(
    () =>
      [...agentRows].sort(
        (left, right) => right.deliveredRevenue - left.deliveredRevenue
      ),
    [agentRows]
  );

  const filteredAgents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rankedAgents.filter((agent) => {
      const matchesSearch =
        !query ||
        (agent.display_name || "").toLowerCase().includes(query) ||
        (agent.phone || "").toLowerCase().includes(query) ||
        (agent.referral_code || "").toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" || agent.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rankedAgents, search, statusFilter]);

  const summary = useMemo(() => {
    const approvedAgents = agentRows.filter((agent) => agent.status === "approved");
    const pendingApplications = agentRows.filter((agent) => agent.status === "pending");
    const deliveredRevenue = agentRows.reduce(
      (total, agent) => total + agent.deliveredRevenue,
      0
    );
    const deliveredOrders = agentRows.reduce(
      (total, agent) => total + agent.deliveredOrders,
      0
    );
    const allGuidedOrders = agentRows.reduce(
      (total, agent) => total + agent.allOrders,
      0
    );

    return {
      totalAgents: agentRows.length,
      approvedAgents: approvedAgents.length,
      pendingApplications: pendingApplications.length,
      deliveredRevenue,
      deliveredOrders,
      deliveredRate:
        allGuidedOrders > 0 ? (deliveredOrders / allGuidedOrders) * 100 : 0,
      availableForInbound: approvedAgents.filter(
        (agent) =>
          agent.inbound_assignment_enabled !== false &&
          agent.accepting_inbound_leads === true
      ).length,
    };
  }, [agentRows]);

  const chartData = rankedAgents
    .filter((agent) => agent.status === "approved" || agent.deliveredRevenue > 0)
    .slice(0, 7)
    .map((agent) => ({
      name: agent.display_name || "Agent",
      revenue: Number(agent.deliveredRevenue.toFixed(2)),
    }));

  const approveAgent = async (agentId: string) => {
    setSavingAgentId(agentId);

    const { error } = await supabase.rpc("approve_agent", {
      agent_profile_id: agentId,
    });

    if (error) {
      addToast("Failed to approve agent.", "error");
      console.error("Approve agent error:", error);
    } else {
      addToast("Agent approved and referral code activated.", "success");
      await loadAgents();
    }

    setSavingAgentId(null);
  };

  const rejectAgent = async (agentId: string) => {
    if (!window.confirm("Reject this pending agent application?")) return;

    setSavingAgentId(agentId);

    const { error } = await supabase
      .from("agent_profiles")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId)
      .eq("status", "pending");

    if (error) {
      addToast("Failed to reject agent.", "error");
      console.error("Reject agent error:", error);
    } else {
      addToast("Agent application rejected.", "info");
      await loadAgents();
    }

    setSavingAgentId(null);
  };

  const suspendAgent = async (agentId: string) => {
    if (!window.confirm("Suspend this agent's referral access?")) return;

    setSavingAgentId(agentId);

    const { error } = await supabase.rpc("suspend_agent", {
      agent_profile_id: agentId,
    });

    if (error) {
      addToast("Failed to suspend agent.", "error");
      console.error("Suspend agent error:", error);
    } else {
      addToast("Agent referral access suspended.", "info");
      await loadAgents();
    }

    setSavingAgentId(null);
  };

  const reactivateAgent = async (agentId: string) => {
    setSavingAgentId(agentId);

    const { error } = await supabase.rpc("approve_agent", {
      agent_profile_id: agentId,
    });

    if (error) {
      addToast("Failed to reactivate agent.", "error");
      console.error("Reactivate agent error:", error);
    } else {
      addToast("Agent referral access reactivated.", "success");
      await loadAgents();
    }

    setSavingAgentId(null);
  };

  const configureInboundCapacity = async (agent: AgentRow) => {
    const currentLimit = agent.max_active_inbound_leads ?? 15;
    const enteredLimit = window.prompt(
      "Maximum active inbound customer-request leads for this agent (1-100):",
      String(currentLimit)
    );

    if (enteredLimit === null) return;

    const limit = Number(enteredLimit);

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      addToast("Enter a whole-number capacity from 1 to 100.", "error");
      return;
    }

    const enabled = window.confirm(
      "Allow this agent to receive automatic inbound callback assignments?\n\nOK = Enabled\nCancel = Disabled"
    );

    setSavingAgentId(agent.id);

    const { error } = await supabase.rpc("admin_configure_agent_inbound_assignment", {
      input_agent_user_id: agent.user_id,
      input_enabled: enabled,
      input_max_active_leads: limit,
    });

    if (error) {
      addToast(error.message || "Unable to update inbound assignment settings.", "error");
    } else {
      addToast("Inbound assignment settings updated.", "success");
      await loadAgents();
    }

    setSavingAgentId(null);
  };

  const copyReferralCode = async (code: string | null) => {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      addToast("Referral code copied.", "success");
    } catch {
      addToast("Unable to copy referral code.", "error");
    }
  };

  if (loading) {
    return (
      <AppShell title="Admin Agents" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: '#58948f', borderTopColor: 'transparent' }} />
        </div>
      </AppShell>
    );
  }

  if (!adminProfile) {
    return (
      <AppShell title="Admin Agents" toasts={toasts}>
        <AccessCard
          title="Admin Login"
          body="Please log in with an admin account to manage agent access."
          href="/login?redirect=/admin/agents"
          button="Log In as Admin"
        />
      </AppShell>
    );
  }

  if (adminProfile.role !== "admin") {
    return (
      <AppShell title="Admin Agents" toasts={toasts}>
        <AccessCard
          title="Admin Only"
          body={`This page is restricted to admin accounts. Current account: ${
            userEmail || "unknown"
          }.`}
          href="/"
          button="Back to Shop"
          danger
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Admin Agents"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search agent, phone, or referral code..."
      toasts={toasts}
    >
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: '#58948f' }}>
              Agent Management
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Agent Performance
            </h1>
            <p className="mt-3 max-w-3xl text-[#725f4d] dark:text-gray-400">
              Approve applications, monitor referral-attributed delivered sales,
              and rank agent performance using verified orders.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadAgents}
              className="rounded-full border border-[#cdbba7] bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] transition-colors duration-200 dark:border-white/10 dark:bg-transparent"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#58948f';
                e.currentTarget.style.borderColor = '#58948f';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = '';
                e.currentTarget.style.color = '';
              }}
            >
              Refresh
            </button>
            <Link
              href="/admin/sales"
              className="rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition-colors duration-200"
              style={{ backgroundColor: '#093459' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#093459'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#58948f'}
            >
              Sales Analytics
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <StatCard label="Applicants" value={summary.totalAgents.toString()} />
        <StatCard label="Approved" value={summary.approvedAgents.toString()} />
        <StatCard label="Available Inbound" value={summary.availableForInbound.toString()} highlight />
        <StatCard label="Pending Review" value={summary.pendingApplications.toString()} />
        <StatCard label="Delivered Orders" value={summary.deliveredOrders.toString()} />
        <StatCard label="Delivered Revenue" value={formatUSD(summary.deliveredRevenue)} />
        <StatCard label="Delivered Rate" value={`${summary.deliveredRate.toFixed(0)}%`} />
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <h2 className="text-2xl font-black">Inbound Callback Capacity</h2>
        <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
          Customer-requested callbacks are distributed only to enabled agents who are currently available and below capacity.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {inboundWorkload.map((workload) => (
            <div
              key={workload.agent_id}
              className="rounded-2xl border border-[#eadfd1] p-4 dark:border-white/10"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-black">{workload.agent_name}</p>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${
                  !workload.inbound_assignment_enabled
                    ? "bg-red-600"
                    : workload.accepting_inbound_leads
                      ? "bg-green-600"
                      : "bg-zinc-500"
                }`}>
                  {!workload.inbound_assignment_enabled
                    ? "Disabled"
                    : workload.accepting_inbound_leads
                      ? "Available"
                      : "Offline"}
                </span>
              </div>
              <p className="mt-3 text-sm text-[#725f4d] dark:text-gray-300">
                Active inbound: <span className="font-black">{workload.active_inbound_leads}</span>
                {" / "}
                {workload.max_active_inbound_leads}
              </p>
              <p className="mt-1 text-xs text-[#725f4d] dark:text-gray-400">
                Remaining capacity: {workload.remaining_capacity}
              </p>
            </div>
          ))}
          {inboundWorkload.length === 0 && (
            <p className="text-sm text-[#725f4d] dark:text-gray-400">
              No approved agents available for inbound configuration.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">Top Agents by Delivered Revenue</h2>
          <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
            Only delivered referred purchases are counted as completed sales.
          </p>

          {chartData.length === 0 ? (
            <EmptyState text="No delivered agent-attributed sales yet." />
          ) : (
            <div className="mt-5">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical" margin={{ right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7ded2" />
                  <XAxis type="number" tickFormatter={(value) => `$${value}`} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={115} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatUSD(Number(value))} />
                  <Bar dataKey="revenue" name="Delivered Revenue" fill="#58948f" radius={[0, 10, 10, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">Metric Definition</h2>
          <div className="mt-5 space-y-4 text-sm">
            <MetricDefinition
              title="Delivered Revenue"
              text="Value of referral-attributed orders marked delivered."
            />
            <MetricDefinition
              title="Pipeline Value"
              text="Value of pending, confirmed, packed, or shipped attributed orders."
            />
            <MetricDefinition
              title="Delivered Rate"
              text="Delivered referred orders divided by all referred orders."
            />
          </div>

          <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
            <p className="font-black">Not call conversion yet</p>
            <p className="mt-1">
              True conversion rate requires recording attempted calls or leads,
              include customers who did not purchase.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-black">Agent Rankings and Applications</h2>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
              Review access status and verified referral performance.
            </p>
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            className="rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm font-bold outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1160px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#ded0bf] text-xs uppercase tracking-[0.18em] text-[#725f4d] dark:border-white/10 dark:text-gray-400">
                <th className="py-4">Rank / Agent</th>
                <th className="py-4">Code</th>
                <th className="py-4">Status</th>
                <th className="py-4">Inbound</th>
                <th className="py-4">Guided</th>
                <th className="py-4">Delivered</th>
                <th className="py-4">Delivered Revenue</th>
                <th className="py-4">Pipeline</th>
                <th className="py-4">Delivered Rate</th>
                <th className="py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => {
                const rank =
                  rankedAgents.findIndex((row) => row.user_id === agent.user_id) + 1;

                return (
                  <tr
                    key={agent.id}
                    className="border-b border-[#eadfd1] dark:border-white/5"
                  >
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f1e6d9] text-xs font-black dark:bg-white/[0.08]">
                          {rank}
                        </span>
                        <div>
                          <p className="font-black">
                            {agent.display_name || "Unnamed Agent"}
                          </p>
                          <p className="text-xs text-[#725f4d] dark:text-gray-400">
                            {agent.phone || "No phone"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      {agent.referral_code ? (
                        <button
                          type="button"
                          onClick={() => copyReferralCode(agent.referral_code)}
                          className="rounded-full bg-violet-50 px-3 py-2 font-mono text-xs font-black text-violet-700 transition hover:bg-violet-100 dark:bg-violet-400/10 dark:text-violet-200"
                        >
                          {agent.referral_code}
                        </button>
                      ) : (
                        <span className="text-zinc-400">Not issued</span>
                      )}
                    </td>
                    <td className="py-4">
                      <StatusBadge status={agent.status} />
                    </td>
                    <td className="py-4">
                      {agent.status === "approved" ? (
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${
                          agent.inbound_assignment_enabled === false
                            ? "bg-red-600"
                            : agent.accepting_inbound_leads
                              ? "bg-green-600"
                              : "bg-zinc-500"
                        }`}>
                          {agent.inbound_assignment_enabled === false
                            ? "Disabled"
                            : agent.accepting_inbound_leads
                              ? "Available"
                              : "Offline"}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="py-4 font-bold">{agent.allOrders}</td>
                    <td className="py-4 font-bold">{agent.deliveredOrders}</td>
                    <td className="py-4 font-black">
                      {formatUSD(agent.deliveredRevenue)}
                    </td>
                    <td className="py-4 font-bold">
                      {formatUSD(agent.pipelineValue)}
                    </td>
                    <td className="py-4 font-black">
                      {agent.deliveredRate.toFixed(0)}%
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedAgent(agent)}
                          className="rounded-full border border-[#cdbba7] px-4 py-2 text-xs font-bold transition-colors duration-200 dark:border-white/10"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#58948f';
                            e.currentTarget.style.borderColor = '#58948f';
                            e.currentTarget.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.borderColor = '';
                            e.currentTarget.style.color = '';
                          }}
                        >
                          Details
                        </button>

                        {agent.status === "pending" && (
                          <>
                            <ActionButton
                              label="Approve"
                              disabled={savingAgentId === agent.id}
                              onClick={() => approveAgent(agent.id)}
                              style="approve"
                            />
                            <ActionButton
                              label="Reject"
                              disabled={savingAgentId === agent.id}
                              onClick={() => rejectAgent(agent.id)}
                              style="danger"
                            />
                          </>
                        )}

                        {agent.status === "approved" && (
                          <>
                            <ActionButton
                              label="Capacity"
                              disabled={savingAgentId === agent.id}
                              onClick={() => configureInboundCapacity(agent)}
                              style="neutral"
                            />
                            <ActionButton
                              label="Suspend"
                              disabled={savingAgentId === agent.id}
                              onClick={() => suspendAgent(agent.id)}
                              style="danger"
                            />
                          </>
                        )}

                        {agent.status === "suspended" && (
                          <ActionButton
                            label="Reactivate"
                            disabled={savingAgentId === agent.id}
                            onClick={() => reactivateAgent(agent.id)}
                            style="approve"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredAgents.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="py-10 text-center text-[#725f4d] dark:text-gray-400"
                  >
                    No agents found for the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          orders={orders.filter((order) => order.agent_id === selectedAgent.user_id)}
          formatUSD={formatUSD}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </AppShell>
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
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#725f4d] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-black">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "approved"
      ? "bg-green-600"
      : status === "pending"
        ? "bg-amber-500 text-black"
        : status === "suspended"
          ? "bg-red-600"
          : "bg-zinc-500";

  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${style}`}>
      {status}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  style,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  style: "approve" | "danger" | "neutral";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full px-4 py-2 text-xs font-bold text-white transition-colors duration-200 disabled:opacity-50"
      style={{
        backgroundColor: style === "approve" ? "#58948f" : style === "neutral" ? "#093459" : "#dc2626"
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = style === "approve" ? "#093459" : style === "neutral" ? "#58948f" : "#b91c1c";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = style === "approve" ? "#58948f" : style === "neutral" ? "#093459" : "#dc2626";
      }}
    >
      {label}
    </button>
  );
}

function MetricDefinition({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="font-black">{title}</p>
      <p className="mt-1 text-[#725f4d] dark:text-gray-400">{text}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="mt-5 rounded-3xl bg-[#f8efe4] p-6 text-center text-sm text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400">
      {text}
    </p>
  );
}

function AccessCard({
  title,
  body,
  href,
  button,
  danger = false,
}: {
  title: string;
  body: string;
  href: string;
  button: string;
  danger?: boolean;
}) {
  return (
    <section className="mx-auto max-w-xl rounded-[2rem] border border-[#ded0bf] bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: danger ? '#dc2626' : '#58948f' }}>
        {danger ? "Access Denied" : "Login Required"}
      </p>
      <h1 className="mt-4 text-4xl font-black">{title}</h1>
      <p className="mt-4 text-[#725f4d] dark:text-gray-400">{body}</p>
      <Link
        href={href}
        className="mt-6 inline-block rounded-full px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-white transition-colors duration-200"
        style={{ backgroundColor: '#093459' }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#58948f'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#093459'}
      >
        {button}
      </Link>
    </section>
  );
}

function AgentDetailModal({
  agent,
  orders,
  onClose,
  formatUSD,
}: {
  agent: AgentRow;
  orders: AgentOrder[];
  onClose: () => void;
  formatUSD: (value: number | null | undefined) => string;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full px-3 py-2 text-sm font-bold text-white transition-colors duration-200"
          style={{ backgroundColor: '#093459' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#58948f'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#093459'}
        >
          ✕
        </button>

        <p className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: '#58948f' }}>
          Agent Profile Details
        </p>
        <h2 className="mt-2 text-3xl font-black">
          {agent.display_name || "Unnamed Agent"}
        </h2>
        <p className="text-sm text-[#725f4d] dark:text-gray-400">
          Referral Code: {agent.referral_code || "None"} · Phone: {agent.phone || "N/A"}
        </p>

        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-4">
          <div className="rounded-2xl border border-[#eadfd1] p-4 dark:border-white/10">
            <p className="text-xs font-bold uppercase text-[#725f4d] dark:text-gray-400">Delivered Revenue</p>
            <p className="mt-1 text-xl font-black">{formatUSD(agent.deliveredRevenue)}</p>
          </div>
          <div className="rounded-2xl border border-[#eadfd1] p-4 dark:border-white/10">
            <p className="text-xs font-bold uppercase text-[#725f4d] dark:text-gray-400">Pipeline Value</p>
            <p className="mt-1 text-xl font-black">{formatUSD(agent.pipelineValue)}</p>
          </div>
          <div className="rounded-2xl border border-[#eadfd1] p-4 dark:border-white/10">
            <p className="text-xs font-bold uppercase text-[#725f4d] dark:text-gray-400">Delivered Orders</p>
            <p className="mt-1 text-xl font-black">{agent.deliveredOrders} / {agent.allOrders}</p>
          </div>
          <div className="rounded-2xl border border-[#eadfd1] p-4 dark:border-white/10">
            <p className="text-xs font-bold uppercase text-[#725f4d] dark:text-gray-400">Delivered Rate</p>
            <p className="mt-1 text-xl font-black">{agent.deliveredRate.toFixed(0)}%</p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-black">Notes / Application Detail</h3>
          <p className="mt-2 rounded-2xl bg-[#f8efe4] p-4 text-sm text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-300">
            {agent.notes || "No additional profile information or application text submitted."}
          </p>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-black">Attributed Orders ({orders.length})</h3>
          <div className="mt-3 max-h-60 overflow-y-auto rounded-2xl border border-[#eadfd1] dark:border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-[#f8efe4] text-xs uppercase tracking-wider text-[#725f4d] dark:bg-white/[0.02] dark:text-gray-400">
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-[#eadfd1] last:border-0 dark:border-white/5">
                    <td className="p-3 font-mono text-xs">{order.id.slice(0, 8).toUpperCase()}</td>
                    <td className="p-3 font-bold">{order.full_name || "N/A"}</td>
                    <td className="p-3 uppercase text-xs font-black">{order.status || "pending"}</td>
                    <td className="p-3 font-black">{formatUSD(order.total_amount)}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-[#725f4d] dark:text-gray-400">
                      No attributed orders found for this agent.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl border border-[#cdbba7] py-4 text-sm font-black uppercase tracking-[0.2em] transition-colors duration-200 dark:border-white/10"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#58948f';
            e.currentTarget.style.borderColor = '#58948f';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.borderColor = '';
            e.currentTarget.style.color = '';
          }}
        >
          Close View
        </button>
      </div>
    </div>
  );
}