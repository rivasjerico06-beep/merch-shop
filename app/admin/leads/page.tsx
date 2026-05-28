"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Profile, ToastItem } from "@/lib/types";

type ApprovedAgent = {
  user_id: string;
  display_name: string | null;
  referral_code: string | null;
};

type CustomerAccount = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

type Lead = {
  id: string;
  assigned_agent_id: string | null;
  customer_user_id: string | null;
  converted_order_id: string | null;
  converted_at: string | null;
  customer_name: string;
  phone: string;
  email: string | null;
  source: string;
  status: string;
  call_permission_status: string;
  do_not_contact: boolean;
  do_not_contact_reason: string | null;
  product_interest: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
  created_via?: string | null;
  agent_acknowledged_at?: string | null;
  assignment_acceptance_due_at?: string | null;
  first_contact_due_at?: string | null;
  reassignment_count?: number | null;
  first_contact_escalated_at?: string | null;
};

type Activity = {
  id: string;
  lead_id: string;
  activity_type: string;
  outcome: string | null;
  notes: string | null;
  related_order_id: string | null;
  recorded_by_system: boolean | null;
  call_provider: string | null;
  call_duration_seconds: number | null;
  actual_call_cost: number | null;
  created_at: string;
};

type AttributedOrder = {
  id: string;
  user_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_referral_code: string | null;
  full_name: string | null;
  total_amount: number | null;
  status: string | null;
  created_at: string;
};

type ConversionMetric = {
  agent_id: string;
  agent_name: string;
  total_assigned_leads: number;
  contacted_leads: number;
  placed_order_conversions: number;
  delivered_order_conversions: number;
  contact_to_order_percent: number;
  contact_to_delivered_percent: number;
  delivered_revenue: number;
};

type QualityMetric = {
  agent_id: string;
  agent_name: string;
  auto_assigned_requests: number;
  accepted_requests: number;
  acceptance_rate_percent: number;
  sla_eligible_accepted_requests: number;
  first_contact_within_sla: number;
  first_contact_sla_percent: number;
  missed_unaccepted_assignments: number;
  accepted_sla_escalations: number;
  delivered_conversions: number;
  delivered_revenue: number;
  coaching_flag:
    | "insufficient_data"
    | "coach_acceptance_reliability"
    | "coach_response_time"
    | "on_track";
  coaching_reason: string;
};

type ReviewRequest = {
  id: string;
  requested_by: string;
  related_lead_id: string | null;
  request_type: string;
  phone_normalized: string | null;
  reason: string;
  status: string;
  resolution_notes: string | null;
  created_at: string;
};

type OperationalException = {
  exception_key: string;
  exception_type: string;
  priority: "high" | "medium" | "low";
  lead_id: string;
  assigned_agent_id: string | null;
  customer_name: string;
  phone: string;
  detail: string;
  occurred_at: string;
};

type AutomationRun = {
  run_type: "expired_acceptance_sweep" | "first_contact_sla_sweep";
  ran_at: string;
  requeued_count: number;
  redispatched_count: number;
  escalated_count: number;
  notes: string | null;
};

type LeadForm = {
  customer_name: string;
  phone: string;
  email: string;
  source: string;
  product_interest: string;
  assigned_agent_id: string;
  customer_user_id: string;
  call_permission_status: string;
};

const emptyForm: LeadForm = {
  customer_name: "",
  phone: "",
  email: "",
  source: "admin_entry",
  product_interest: "",
  assigned_agent_id: "",
  customer_user_id: "",
  call_permission_status: "not_confirmed",
};

const statusOptions = [
  "all", "new", "assigned", "attempted", "interested", "follow_up",
  "converted", "not_interested", "do_not_contact",
];

export default function AdminLeadsPage() {
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [agents, setAgents] = useState<ApprovedAgent[]>([]);
  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [orders, setOrders] = useState<AttributedOrder[]>([]);
  const [conversionMetrics, setConversionMetrics] = useState<ConversionMetric[]>([]);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetric[]>([]);
  const [qualityDays, setQualityDays] = useState(30);
  const [reviewRequests, setReviewRequests] = useState<ReviewRequest[]>([]);
  const [operationalExceptions, setOperationalExceptions] = useState<OperationalException[]>([]);
  const [automationRuns, setAutomationRuns] = useState<AutomationRun[]>([]);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((previous) => [...previous, { id, message, type }]);
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 3500);
  };

  const formatUSD = (value: number | null | undefined) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
      .format(Number(value || 0));

  const loadPage = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setAdminProfile(null);
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles").select("*").eq("id", user.id).single();

    if (profileError || !profileData) {
      addToast("Unable to load admin profile.", "error");
      setLoading(false);
      return;
    }

    setAdminProfile(profileData as Profile);

    if (profileData.role !== "admin") {
      setLoading(false);
      return;
    }

    const [
      agentsResult,
      customersResult,
      leadsResult,
      activitiesResult,
      ordersResult,
      metricResult,
      qualityResult,
      requestResult,
      exceptionResult,
      automationResult,
    ] = await Promise.all([
        supabase.from("agent_profiles")
          .select("user_id, display_name, referral_code")
          .eq("status", "approved").order("display_name"),
        supabase.from("profiles")
          .select("id, full_name, phone")
          .eq("role", "customer").order("full_name"),
        supabase.from("sales_leads")
          .select("id, assigned_agent_id, customer_user_id, converted_order_id, converted_at, customer_name, phone, email, source, status, call_permission_status, do_not_contact, do_not_contact_reason, product_interest, next_follow_up_at, last_contacted_at, created_at, created_via, agent_acknowledged_at, assignment_acceptance_due_at, first_contact_due_at, reassignment_count, first_contact_escalated_at")
          .order("created_at", { ascending: false }),
        supabase.from("lead_activities")
          .select("id, lead_id, activity_type, outcome, notes, related_order_id, recorded_by_system, call_provider, call_duration_seconds, actual_call_cost, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("orders")
          .select("id, user_id, agent_id, agent_name, agent_referral_code, full_name, total_amount, status, created_at")
          .not("agent_id", "is", null)
          .order("created_at", { ascending: false }),
        supabase.rpc("get_admin_agent_lead_conversion_metrics"),
        supabase.rpc("get_admin_agent_quality_monitoring", {
          input_days: qualityDays,
        }),
        supabase.from("lead_review_requests")
          .select("id, requested_by, related_lead_id, request_type, phone_normalized, reason, status, resolution_notes, created_at")
          .eq("status", "open")
          .order("created_at", { ascending: false }),
        supabase.rpc("get_admin_operational_lead_exceptions"),
        supabase.rpc("get_admin_callback_automation_runs"),
      ]);

    const failedLoads = [
      { name: "Agents", error: agentsResult.error },
      { name: "Customers", error: customersResult.error },
      { name: "Leads", error: leadsResult.error },
      { name: "Activities", error: activitiesResult.error },
      { name: "Orders", error: ordersResult.error },
      { name: "Conversion Metrics", error: metricResult.error },
      { name: "Quality Metrics", error: qualityResult.error },
      { name: "Review Requests", error: requestResult.error },
      { name: "Operational Exceptions", error: exceptionResult.error },
      { name: "Automation History", error: automationResult.error },
    ].filter((item) => item.error);

    if (failedLoads.length > 0) {
      const firstFailure = failedLoads[0];

      addToast(
        `${firstFailure.name} failed: ${
          firstFailure.error?.message || "Unknown database error"
        }`,
        "error"
      );

      console.warn(
        "Admin lead load failures:",
        failedLoads.map((item) => ({
          query: item.name,
          code: item.error?.code,
          message: item.error?.message,
          details: item.error?.details,
          hint: item.error?.hint,
        }))
      );
    }


    setAgents((agentsResult.data || []) as ApprovedAgent[]);
    setCustomers((customersResult.data || []) as CustomerAccount[]);
    setLeads((leadsResult.data || []) as Lead[]);
    setActivities((activitiesResult.data || []) as Activity[]);
    setOrders((ordersResult.data || []) as AttributedOrder[]);
    setConversionMetrics((metricResult.data || []) as ConversionMetric[]);
    setQualityMetrics((qualityResult.data || []) as QualityMetric[]);
    setReviewRequests((requestResult.data || []) as ReviewRequest[]);
    setOperationalExceptions((exceptionResult.data || []) as OperationalException[]);
    setAutomationRuns((automationResult.data || []) as AutomationRun[]);
    setLoading(false);
  };

  useEffect(() => { loadPage(); }, []);

  useEffect(() => {
    if (adminProfile?.role === "admin") {
      void loadPage();
    }
    // Reload quality metrics when the admin changes the monitoring period.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualityDays]);

  useEffect(() => {
    if (adminProfile?.role !== "admin") return;

    let refreshTimer: number | undefined;

    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void loadPage();
      }, 150);
    };

    const channel = supabase
      .channel("admin-live-lead-operations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_leads" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_activities" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_review_requests" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
    // Start the operations subscription only after admin access is confirmed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminProfile?.role]);

  const agentName = (agentId: string | null) =>
    agents.find((agent) => agent.user_id === agentId)?.display_name ||
    (agentId ? "Approved Agent" : "Unassigned");

  const customerName = (customerId: string | null) =>
    customers.find((customer) => customer.id === customerId)?.full_name ||
    (customerId ? "Linked Customer" : "Not linked");

  const summary = useMemo(() => {
    const contacted = leads.filter((lead) => lead.last_contacted_at).length;
    const converted = leads.filter((lead) => lead.converted_order_id).length;
    const delivered = orders.filter((order) =>
      leads.some((lead) => lead.converted_order_id === order.id) &&
      order.status === "delivered"
    );
    const deliveredRevenue = delivered.reduce(
      (total, order) => total + Number(order.total_amount || 0), 0
    );

    return {
      total: leads.length,
      contacted,
      converted,
      delivered: delivered.length,
      dnc: leads.filter((lead) => lead.do_not_contact).length,
      contactToOrder: contacted ? (converted / contacted) * 100 : 0,
      deliveredRevenue,
    };
  }, [leads, orders]);

  const qualitySummary = useMemo(() => ({
    coachingRequired: qualityMetrics.filter((metric) =>
      metric.coaching_flag.startsWith("coach_")
    ).length,
    onTrack: qualityMetrics.filter((metric) => metric.coaching_flag === "on_track").length,
    totalMissedAssignments: qualityMetrics.reduce(
      (total, metric) => total + Number(metric.missed_unaccepted_assignments || 0),
      0
    ),
  }), [qualityMetrics]);

  const automationSummary = useMemo(() => {
    return automationRuns.reduce(
      (totals, run) => ({
        requeued: totals.requeued + Number(run.requeued_count || 0),
        redispatched: totals.redispatched + Number(run.redispatched_count || 0),
        escalated: totals.escalated + Number(run.escalated_count || 0),
      }),
      { requeued: 0, redispatched: 0, escalated: 0 }
    );
  }, [automationRuns]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch =
        !query ||
        lead.customer_name.toLowerCase().includes(query) ||
        lead.phone.toLowerCase().includes(query) ||
        (lead.product_interest || "").toLowerCase().includes(query) ||
        agentName(lead.assigned_agent_id).toLowerCase().includes(query);
      return matchesSearch && (statusFilter === "all" || lead.status === statusFilter);
    });
  }, [leads, search, statusFilter, agents]);

  const selectedActivities = selectedLead
    ? activities.filter((activity) => activity.lead_id === selectedLead.id)
    : [];

  const eligibleOrdersForLead = (lead: Lead) => {
    const alreadyLinked = new Set(
      leads.filter((row) => row.converted_order_id).map((row) => row.converted_order_id)
    );

    return orders.filter((order) => {
      if (!lead.assigned_agent_id || order.agent_id !== lead.assigned_agent_id) return false;
      if (alreadyLinked.has(order.id) && lead.converted_order_id !== order.id) return false;
      if (lead.customer_user_id && order.user_id !== lead.customer_user_id) return false;
      return true;
    });
  };

  const validateLeadForm = () => {
    const name = form.customer_name.trim();
    const phone = form.phone.trim();
    if (name.length < 2 || name.length > 100) return "Customer name must be between 2 and 100 characters.";
    if (phone.length < 7 || phone.length > 30 || !/^[+0-9() -]+$/.test(phone)) return "Enter a valid customer phone number.";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid email address.";
    if (form.call_permission_status === "approved_to_call" && !form.assigned_agent_id) return "Assign an approved agent before authorizing a call.";
    return "";
  };

  const createLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateLeadForm();
    if (validationError) { addToast(validationError, "error"); return; }

    setSaving(true);
    const { data, error } = await supabase.from("sales_leads").insert({
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      source: form.source,
      product_interest: form.product_interest.trim() || null,
      assigned_agent_id: form.assigned_agent_id || null,
      customer_user_id: form.customer_user_id || null,
      call_permission_status: form.call_permission_status,
      status: form.assigned_agent_id ? "assigned" : "new",
    }).select("id").single();

    if (error || !data) {
      addToast("Unable to create lead.", "error");
    } else {
      await supabase.from("lead_activities").insert({
        lead_id: data.id,
        agent_id: form.assigned_agent_id || null,
        activity_type: "assignment",
        notes: form.assigned_agent_id ? `Assigned to ${agentName(form.assigned_agent_id)}.` : "Lead created without assignment.",
      });
      addToast("Lead created.", "success");
      setForm(emptyForm);
      setShowCreate(false);
      await loadPage();
    }
    setSaving(false);
  };

  const updateAssignment = async (lead: Lead, agentId: string) => {
    setSavingLeadId(lead.id);
    const { error } = await supabase.from("sales_leads").update({
      assigned_agent_id: agentId || null,
      status: agentId && lead.status === "new" ? "assigned" : !agentId && lead.status === "assigned" ? "new" : lead.status,
      call_permission_status: agentId ? lead.call_permission_status : "not_confirmed",
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);

    if (error) addToast("Unable to update assignment.", "error");
    else {
      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        agent_id: agentId || null,
        activity_type: "assignment",
        notes: agentId ? `Assigned to ${agentName(agentId)}.` : "Agent assignment removed.",
      });
      addToast("Assignment updated.", "success");
      await loadPage();
    }
    setSavingLeadId(null);
  };

  const setCallPermission = async (lead: Lead, permission: "approved_to_call" | "not_confirmed") => {
    if (!lead.assigned_agent_id && permission === "approved_to_call") {
      addToast("Assign an agent first.", "error"); return;
    }
    if (lead.do_not_contact) { addToast("Do Not Contact leads cannot be authorized.", "error"); return; }

    setSavingLeadId(lead.id);
    const { error } = await supabase.from("sales_leads").update({
      call_permission_status: permission,
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);

    if (error) addToast("Unable to update calling permission.", "error");
    else {
      await supabase.from("lead_activities").insert({
        lead_id: lead.id, agent_id: lead.assigned_agent_id,
        activity_type: "status_change",
        notes: permission === "approved_to_call"
          ? "Admin authorized outbound calling through HelloAirDial."
          : "Admin paused outbound calling.",
      });
      addToast("Calling permission updated.", "success");
      await loadPage();
    }
    setSavingLeadId(null);
  };

  const attachCustomer = async (lead: Lead, customerUserId: string) => {
    if (!customerUserId) return;
    setSavingLeadId(lead.id);
    const { error } = await supabase.rpc("admin_assign_customer_account_to_lead", {
      input_lead_id: lead.id,
      input_customer_user_id: customerUserId,
    });
    if (error) addToast(error.message || "Unable to link customer account.", "error");
    else {
      addToast("Verified customer account linked to lead.", "success");
      setSelectedLead(null);
      await loadPage();
    }
    setSavingLeadId(null);
  };

  const linkOrder = async (lead: Lead, orderId: string) => {
    if (!window.confirm("Link this verified referred order to the lead as a conversion?")) return;
    setSavingLeadId(lead.id);
    const { error } = await supabase.rpc("admin_link_order_to_sales_lead", {
      input_lead_id: lead.id,
      input_order_id: orderId,
    });
    if (error) addToast(error.message || "Unable to link order.", "error");
    else {
      addToast("Order linked. Lead marked converted.", "success");
      setSelectedLead(null);
      await loadPage();
    }
    setSavingLeadId(null);
  };

  const resolveReviewRequest = async (
    request: ReviewRequest,
    status: "resolved" | "rejected"
  ) => {
    const note = window.prompt(
      status === "resolved" ? "Resolution note:" : "Reason for rejecting this request:",
      status === "resolved" ? "Reviewed and resolved by admin." : "Request rejected after review."
    );

    if (note === null) return;

    if (note.trim().length < 5) {
      addToast("Resolution note must be at least 5 characters.", "error");
      return;
    }

    const { error } = await supabase.rpc("resolve_lead_review_request", {
      input_request_id: request.id,
      input_resolution_status: status,
      input_resolution_notes: note.trim(),
    });

    if (error) {
      addToast(error.message || "Unable to resolve review request.", "error");
      return;
    }

    addToast(
      status === "resolved" ? "Review request resolved." : "Review request rejected.",
      "success"
    );
    await loadPage();
  };

  const requeueUnacceptedCallback = async (leadId: string) => {
    const reason = window.prompt(
      "Reason for returning this unaccepted request to the queue:",
      "Agent did not accept the callback assignment within 15 minutes."
    );

    if (reason === null) return;

    if (reason.trim().length < 5) {
      addToast("Provide a reason of at least 5 characters.", "error");
      return;
    }

    setSavingLeadId(leadId);

    const { error } = await supabase.rpc("admin_requeue_unaccepted_callback", {
      input_lead_id: leadId,
      input_reason: reason.trim(),
    });

    if (error) {
      addToast(error.message || "Unable to return request to the queue.", "error");
    } else {
      addToast("Unaccepted request returned to queue for reassignment.", "success");
      setSelectedLead(null);
      await loadPage();
    }

    setSavingLeadId(null);
  };

  const markDoNotContact = async (lead: Lead) => {
    const reason = window.prompt("Reason for Do Not Contact:", "Customer requested no further calls");
    if (reason === null) return;
    setSavingLeadId(lead.id);
    const { error } = await supabase.rpc("mark_sales_lead_do_not_contact", {
      input_lead_id: lead.id,
      input_reason: reason.trim() || "Customer requested no further calls",
    });
    if (error) addToast("Unable to mark Do Not Contact.", "error");
    else { addToast("Lead marked Do Not Contact.", "success"); setSelectedLead(null); await loadPage(); }
    setSavingLeadId(null);
  };

  if (loading) return <AppShell title="Lead Management" toasts={toasts}><LoadingCard /></AppShell>;
  if (!adminProfile) return <AppShell title="Lead Management" toasts={toasts}><AccessCard title="Admin Login" body="Log in as admin to manage leads." href="/login?redirect=/admin/leads" button="Log In as Admin" /></AppShell>;
  if (adminProfile.role !== "admin") return <AppShell title="Lead Management" toasts={toasts}><AccessCard title="Admin Only" body="Only admin accounts can manage customer leads." href="/" button="Back to Shop" danger /></AppShell>;

  return (
    <AppShell title="Lead Management" searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search lead or agent..." toasts={toasts}>
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">HelloAirDial Operations</p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">Lead Conversion</h1>
            <p className="mt-3 max-w-3xl text-[#725f4d] dark:text-gray-400">
              Assign authorized calls, connect leads to verified customer accounts,
              and link referral-attributed orders into measurable conversions.
            </p>
          </div>
          <button type="button" onClick={() => setShowCreate(true)} className="rounded-full bg-[#093459] px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-[#58948f] dark:bg-white dark:text-black">
            Add New Lead
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <StatCard label="Leads" value={summary.total} />
        <StatCard label="Contacted" value={summary.contacted} />
        <StatCard label="Converted" value={summary.converted} highlight />
        <StatCard label="Delivered" value={summary.delivered} />
        <StatCard label="DNC" value={summary.dnc} danger />
        <StatCard label="Order Conversion" value={`${summary.contactToOrder.toFixed(1)}%`} />
        <StatCard label="Delivered Revenue" value={formatUSD(summary.deliveredRevenue)} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[2rem] border border-red-200 bg-white p-6 shadow-sm dark:border-red-400/20 dark:bg-white/[0.04]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">
                Admin Exceptions
              </p>
              <h2 className="mt-2 text-2xl font-black">Operational Alerts</h2>
            </div>
            <span className="rounded-full bg-red-600 px-4 py-2 text-xs font-black text-white">
              {operationalExceptions.length}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {operationalExceptions.length === 0 ? (
              <p className="rounded-2xl bg-green-50 p-5 text-sm text-green-800 dark:bg-green-400/10 dark:text-green-200">
                No operational exceptions require attention.
              </p>
            ) : (
              operationalExceptions.slice(0, 8).map((item) => (
                <div
                  key={item.exception_key}
                  className="rounded-2xl border border-[#eadfd1] p-4 dark:border-white/10"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-black">{item.customer_name}</p>
                      <p className="mt-1 text-xs text-[#725f4d] dark:text-gray-400">
                        {titleCase(item.exception_type)} · {agentName(item.assigned_agent_id)}
                      </p>
                    </div>
                    <span
                      className={`h-fit rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${
                        item.priority === "high" ? "bg-red-600" : "bg-amber-500 text-black"
                      }`}
                    >
                      {item.priority}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[#725f4d] dark:text-gray-300">
                    {item.detail}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const lead = leads.find((row) => row.id === item.lead_id);
                        if (lead) setSelectedLead(lead);
                      }}
                      className="text-xs font-black uppercase tracking-[0.12em] text-[#58948f]"
                    >
                      Open Lead Details
                    </button>

                    {item.exception_type === "assignment_acceptance_overdue" && (
                      <button
                        type="button"
                        disabled={savingLeadId === item.lead_id}
                        onClick={() => requeueUnacceptedCallback(item.lead_id)}
                        className="text-xs font-black uppercase tracking-[0.12em] text-red-600 disabled:opacity-50"
                      >
                        Return to Queue
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-[#58948f]">
                Agent Requests
              </p>
              <h2 className="mt-2 text-2xl font-black">Review Queue</h2>
            </div>
            <span className="rounded-full bg-[#58948f] px-4 py-2 text-xs font-black text-white">
              {reviewRequests.length}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {reviewRequests.length === 0 ? (
              <p className="rounded-2xl bg-[#f8efe4] p-5 text-sm text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400">
                No open agent review requests.
              </p>
            ) : (
              reviewRequests.slice(0, 8).map((request) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-[#eadfd1] p-4 dark:border-white/10"
                >
                  <p className="font-black">
                    {titleCase(request.request_type)}
                  </p>
                  <p className="mt-1 text-xs text-[#725f4d] dark:text-gray-400">
                    Requested by {agentName(request.requested_by)} ·{" "}
                    {new Date(request.created_at).toLocaleString()}
                  </p>
                  <p className="mt-3 text-sm">{request.reason}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => resolveReviewRequest(request, "resolved")}
                      className="rounded-full bg-green-600 px-4 py-2 text-xs font-bold text-white"
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveReviewRequest(request, "rejected")}
                      className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white"
                    >
                      Reject
                    </button>
                    {request.related_lead_id && (
                      <button
                        type="button"
                        onClick={() => {
                          const lead = leads.find((row) => row.id === request.related_lead_id);
                          if (lead) setSelectedLead(lead);
                        }}
                        className="rounded-full border border-[#cdbba7] px-4 py-2 text-xs font-bold"
                      >
                        Open Lead
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#58948f]">
              Automated Operations
            </p>
            <h2 className="mt-2 text-2xl font-black">Callback Recovery History</h2>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
              Safe requeue handles only unaccepted requests. Accepted requests that miss
              the first-contact target are escalated for review, not automatically reassigned.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <StatCard label="Auto Requeued" value={automationSummary.requeued} />
          <StatCard label="Auto Redispatched" value={automationSummary.redispatched} highlight />
          <StatCard label="SLA Escalations" value={automationSummary.escalated} danger />
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#ded0bf] text-xs uppercase tracking-[0.16em] text-[#725f4d] dark:border-white/10 dark:text-gray-400">
                <th className="py-4">Run Type</th>
                <th className="py-4">Run Time</th>
                <th className="py-4">Requeued</th>
                <th className="py-4">Redispatched</th>
                <th className="py-4">Escalated</th>
              </tr>
            </thead>
            <tbody>
              {automationRuns.slice(0, 10).map((run, index) => (
                <tr
                  key={`${run.run_type}-${run.ran_at}-${index}`}
                  className="border-b border-[#eadfd1] dark:border-white/5"
                >
                  <td className="py-4 font-black">{titleCase(run.run_type)}</td>
                  <td className="py-4 text-[#725f4d] dark:text-gray-300">
                    {new Date(run.ran_at).toLocaleString()}
                  </td>
                  <td className="py-4">{run.requeued_count}</td>
                  <td className="py-4">{run.redispatched_count}</td>
                  <td className="py-4">{run.escalated_count}</td>
                </tr>
              ))}
              {automationRuns.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#725f4d] dark:text-gray-400">
                    No automated recovery or escalation actions have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#58948f]">
              Coaching Monitor
            </p>
            <h2 className="mt-2 text-2xl font-black">Agent Quality Signals</h2>
            <p className="mt-1 max-w-3xl text-sm text-[#725f4d] dark:text-gray-400">
              Flags focus on acceptance reliability and callback response time.
              Conversion results are shown for context only and do not independently trigger coaching.
            </p>
          </div>

          <select
            value={qualityDays}
            onChange={(event) => setQualityDays(Number(event.target.value))}
            className="rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm font-bold outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          >
            <option value={30}>Last 30 Days</option>
            <option value={60}>Last 60 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <StatCard label="Needs Coaching Review" value={qualitySummary.coachingRequired} danger />
          <StatCard label="On Track" value={qualitySummary.onTrack} highlight />
          <StatCard label="Missed Assignments" value={qualitySummary.totalMissedAssignments} />
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[1150px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#ded0bf] text-xs uppercase tracking-[0.16em] text-[#725f4d] dark:border-white/10 dark:text-gray-400">
                <th className="py-4">Agent</th>
                <th className="py-4">Auto Assigned</th>
                <th className="py-4">Accepted</th>
                <th className="py-4">Acceptance Rate</th>
                <th className="py-4">First-Contact SLA</th>
                <th className="py-4">Missed</th>
                <th className="py-4">Escalations</th>
                <th className="py-4">Delivered</th>
                <th className="py-4">Coaching Flag</th>
              </tr>
            </thead>
            <tbody>
              {qualityMetrics.map((metric) => (
                <tr key={metric.agent_id} className="border-b border-[#eadfd1] align-top dark:border-white/5">
                  <td className="py-4 font-black">{metric.agent_name}</td>
                  <td className="py-4">{metric.auto_assigned_requests}</td>
                  <td className="py-4">{metric.accepted_requests}</td>
                  <td className="py-4 font-bold">{Number(metric.acceptance_rate_percent || 0).toFixed(1)}%</td>
                  <td className="py-4 font-bold">
                    {metric.sla_eligible_accepted_requests > 0
                      ? `${Number(metric.first_contact_sla_percent || 0).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="py-4">{metric.missed_unaccepted_assignments}</td>
                  <td className="py-4">{metric.accepted_sla_escalations}</td>
                  <td className="py-4">{metric.delivered_conversions}</td>
                  <td className="py-4">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${
                      metric.coaching_flag === "on_track"
                        ? "bg-green-600"
                        : metric.coaching_flag === "insufficient_data"
                          ? "bg-zinc-500"
                          : "bg-red-600"
                    }`}>
                      {titleCase(metric.coaching_flag)}
                    </span>
                    <p className="mt-2 max-w-[260px] text-xs text-[#725f4d] dark:text-gray-400">
                      {metric.coaching_reason}
                    </p>
                  </td>
                </tr>
              ))}
              {qualityMetrics.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#725f4d] dark:text-gray-400">
                    No approved agent quality data available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <h2 className="text-2xl font-black">Agent Conversion Metrics</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead><tr className="border-b border-[#ded0bf] text-xs uppercase tracking-[0.16em] text-[#725f4d] dark:border-white/10 dark:text-gray-400">
              <th className="py-4">Agent</th><th className="py-4">Assigned</th><th className="py-4">Contacted</th><th className="py-4">Orders</th><th className="py-4">Delivered</th><th className="py-4">Order Rate</th><th className="py-4">Delivered Revenue</th>
            </tr></thead>
            <tbody>
              {conversionMetrics.map((metric) => (
                <tr key={metric.agent_id} className="border-b border-[#eadfd1] dark:border-white/5">
                  <td className="py-4 font-black">{metric.agent_name}</td>
                  <td className="py-4">{metric.total_assigned_leads}</td>
                  <td className="py-4">{metric.contacted_leads}</td>
                  <td className="py-4">{metric.placed_order_conversions}</td>
                  <td className="py-4">{metric.delivered_order_conversions}</td>
                  <td className="py-4 font-black text-[#58948f]">{Number(metric.contact_to_order_percent || 0).toFixed(1)}%</td>
                  <td className="py-4 font-black">{formatUSD(metric.delivered_revenue)}</td>
                </tr>
              ))}
              {conversionMetrics.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-[#725f4d] dark:text-gray-400">No approved agent conversion metrics yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><h2 className="text-2xl font-black">Lead Queue</h2><p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">Open Details to link a registered customer or referred order.</p></div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm font-bold outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white">
            {statusOptions.map((status) => <option key={status} value={status}>{status === "all" ? "All Statuses" : titleCase(status)}</option>)}
          </select>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead><tr className="border-b border-[#ded0bf] text-xs uppercase tracking-[0.16em] text-[#725f4d] dark:border-white/10 dark:text-gray-400">
              <th className="py-4">Lead</th><th className="py-4">Agent</th><th className="py-4">Customer Account</th><th className="py-4">Permission</th><th className="py-4">Status</th><th className="py-4">Actions</th>
            </tr></thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-[#eadfd1] dark:border-white/5">
                  <td className="py-4"><p className="font-black">{lead.customer_name}</p><p className="text-xs text-[#725f4d] dark:text-gray-400">{lead.phone} · {lead.product_interest || "No interest noted"}</p></td>
                  <td className="py-4"><select value={lead.assigned_agent_id || ""} disabled={lead.do_not_contact || savingLeadId === lead.id || Boolean(lead.converted_order_id)} onChange={(event) => updateAssignment(lead, event.target.value)} className="rounded-xl border border-[#cdbba7] bg-white px-3 py-2 text-xs font-bold dark:border-white/10 dark:bg-zinc-900 dark:text-white"><option value="">Unassigned</option>{agents.map((agent) => <option key={agent.user_id} value={agent.user_id}>{agent.display_name || "Agent"}</option>)}</select></td>
                  <td className="py-4">{lead.customer_user_id ? <span className="font-bold">{customerName(lead.customer_user_id)}</span> : <span className="text-zinc-400">Not linked</span>}</td>
                  <td className="py-4"><Badge value={lead.call_permission_status} /></td>
                  <td className="py-4"><Badge value={lead.status} /></td>
                  <td className="py-4"><div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setSelectedLead(lead)} className="rounded-full border border-[#cdbba7] px-4 py-2 text-xs font-bold hover:bg-[#093459] hover:text-white dark:border-white/10">Details</button>
                    {!lead.do_not_contact && lead.call_permission_status !== "approved_to_call" && <button type="button" onClick={() => setCallPermission(lead, "approved_to_call")} className="rounded-full bg-green-600 px-4 py-2 text-xs font-bold text-white">Approve Call</button>}
                    {!lead.do_not_contact && lead.call_permission_status === "approved_to_call" && <button type="button" onClick={() => setCallPermission(lead, "not_confirmed")} className="rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-black">Pause Calls</button>}
                    {!lead.do_not_contact && <button type="button" onClick={() => markDoNotContact(lead)} className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white">DNC</button>}
                  </div></td>
                </tr>
              ))}
              {filteredLeads.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-[#725f4d] dark:text-gray-400">No leads found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && <CreateLeadModal form={form} setForm={setForm} agents={agents} customers={customers} saving={saving} onSubmit={createLead} onClose={() => { setForm(emptyForm); setShowCreate(false); }} />}

      {selectedLead && <ConversionModal lead={selectedLead} agentLabel={agentName(selectedLead.assigned_agent_id)} customerLabel={customerName(selectedLead.customer_user_id)} customers={customers} eligibleOrders={eligibleOrdersForLead(selectedLead)} activities={selectedActivities} saving={savingLeadId === selectedLead.id} formatUSD={formatUSD} onAttachCustomer={(id) => attachCustomer(selectedLead, id)} onLinkOrder={(id) => linkOrder(selectedLead, id)} onClose={() => setSelectedLead(null)} />}
    </AppShell>
  );
}

function CreateLeadModal({ form, setForm, agents, customers, saving, onSubmit, onClose }: { form: LeadForm; setForm: React.Dispatch<React.SetStateAction<LeadForm>>; agents: ApprovedAgent[]; customers: CustomerAccount[]; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void; }) {
  return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"><form onSubmit={onSubmit} className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-7 dark:bg-zinc-950">
    <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full bg-[#093459] px-3 py-2 text-white dark:bg-white dark:text-black">✕</button>
    <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">New Lead</p><h2 className="mt-3 text-3xl font-black">Create and Assign</h2>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Field label="Customer Name" value={form.customer_name} onChange={(v) => setForm((p) => ({...p, customer_name:v}))} required />
      <Field label="Phone" value={form.phone} onChange={(v) => setForm((p) => ({...p, phone:v}))} required />
      <Field label="Email" type="email" value={form.email} onChange={(v) => setForm((p) => ({...p, email:v}))} />
      <Field label="Product Interest" value={form.product_interest} onChange={(v) => setForm((p) => ({...p, product_interest:v}))} />
      <Select label="Assigned Agent" value={form.assigned_agent_id} onChange={(v) => setForm((p) => ({...p, assigned_agent_id:v}))} options={[{value:"",label:"Unassigned"}, ...agents.map((a) => ({value:a.user_id,label:a.display_name || "Agent"}))]} />
      <Select label="Verified Customer Account (Optional)" value={form.customer_user_id} onChange={(v) => setForm((p) => ({...p, customer_user_id:v}))} options={[{value:"",label:"Link Later"}, ...customers.map((c) => ({value:c.id,label:c.full_name || c.phone || "Customer"}))]} />
      <Select label="Source" value={form.source} onChange={(v) => setForm((p) => ({...p, source:v}))} options={["admin_entry","website_inquiry","existing_customer","referral","other"].map((v) => ({value:v,label:titleCase(v)}))} />
      <Select label="Calling Permission" value={form.call_permission_status} onChange={(v) => setForm((p) => ({...p, call_permission_status:v}))} options={[{value:"not_confirmed",label:"Not Confirmed - Do Not Call"}, {value:"approved_to_call",label:"Approved to Call"}]} />
    </div>
    <button disabled={saving} className="mt-6 w-full rounded-2xl bg-[#093459] py-4 text-sm font-black uppercase text-white hover:bg-[#58948f] dark:bg-white dark:text-black">{saving ? "Creating..." : "Create Lead"}</button>
  </form></div>;
}

function ConversionModal({ lead, agentLabel, customerLabel, customers, eligibleOrders, activities, saving, formatUSD, onAttachCustomer, onLinkOrder, onClose }: { lead: Lead; agentLabel: string; customerLabel: string; customers: CustomerAccount[]; eligibleOrders: AttributedOrder[]; activities: Activity[]; saving: boolean; formatUSD: (value: number | null | undefined) => string; onAttachCustomer: (id: string) => void; onLinkOrder: (id: string) => void; onClose: () => void; }) {
  return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"><div className="relative max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white p-7 dark:bg-zinc-950">
    <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full bg-[#093459] px-3 py-2 text-white dark:bg-white dark:text-black">✕</button>
    <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">Conversion Details</p><h2 className="mt-3 text-3xl font-black">{lead.customer_name}</h2>
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl bg-[#f8efe4] p-5 dark:bg-white/[0.05]">
        <h3 className="text-xl font-black">Verified Matching</h3>
        <div className="mt-4 space-y-3 text-sm"><Info label="Assigned Agent" value={agentLabel} /><Info label="Customer Account" value={customerLabel} /><Info label="Lead Status" value={titleCase(lead.status)} /><Info label="Converted Order" value={lead.converted_order_id || "Not linked"} /></div>
        {!lead.customer_user_id && !lead.converted_order_id && <div className="mt-5"><p className="mb-2 text-xs font-black uppercase text-[#725f4d]">Link Verified Customer Account</p><select disabled={saving} defaultValue="" onChange={(e) => { if (e.target.value) onAttachCustomer(e.target.value); }} className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 dark:bg-zinc-900 dark:text-white"><option value="">Select verified customer...</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.phone || "Customer"}</option>)}</select></div>}
      </div>
      <div className="rounded-3xl border border-[#ded0bf] p-5 dark:border-white/10">
        <h3 className="text-xl font-black">Eligible Referred Orders</h3>
        <p className="mt-1 text-xs text-[#725f4d] dark:text-gray-400">Link only after verifying this order belongs to this lead.</p>
        <div className="mt-4 space-y-3">
          {eligibleOrders.length === 0 ? <p className="rounded-2xl bg-[#f8efe4] p-4 text-sm dark:bg-white/[0.05]">No eligible referred orders found.</p> : eligibleOrders.slice(0,8).map((order) => <div key={order.id} className="flex justify-between gap-3 rounded-2xl bg-[#f8efe4] p-4 dark:bg-white/[0.05]"><div><p className="font-black">#{order.id.slice(0,8).toUpperCase()}</p><p className="text-xs text-[#725f4d] dark:text-gray-400">{order.full_name || "Customer"} · {order.status}</p></div><div className="text-right"><p className="font-black">{formatUSD(order.total_amount)}</p>{!lead.converted_order_id && <button type="button" disabled={saving} onClick={() => onLinkOrder(order.id)} className="mt-2 rounded-full bg-[#58948f] px-3 py-2 text-xs font-black text-white">Link Order</button>}</div></div>)}
        </div>
      </div>
    </div>
    <section className="mt-6 rounded-3xl border border-[#ded0bf] p-5 dark:border-white/10"><h3 className="text-xl font-black">Activity History</h3><div className="mt-4 space-y-3">{activities.length === 0 ? <p className="text-sm text-[#725f4d]">No activity recorded.</p> : activities.slice(0,10).map((activity) => <div key={activity.id} className="rounded-2xl bg-[#f8efe4] p-4 text-sm dark:bg-white/[0.05]"><p className="font-black">{titleCase(activity.outcome || activity.activity_type)}</p><p className="mt-1 text-xs text-[#725f4d]">{new Date(activity.created_at).toLocaleString()}</p>{activity.notes && <p className="mt-2">{activity.notes}</p>}</div>)}</div></section>
  </div></div>;
}

function titleCase(value: string) { return value.replaceAll("_", " ").split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
function LoadingCard() { return <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#58948f] border-t-transparent" /></div>; }
function StatCard({ label, value, highlight=false, danger=false }: { label:string; value:number|string; highlight?:boolean; danger?:boolean }) { return <div className={`rounded-[2rem] border p-5 ${danger ? "border-red-200 bg-red-50 dark:bg-red-400/10" : highlight ? "border-[#58948f]/30 bg-[#58948f]/10 dark:bg-[#58948f]/10" : "border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]"}`}><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#725f4d] dark:text-gray-400">{label}</p><p className="mt-3 text-2xl font-black">{value}</p></div>; }
function Badge({ value }: { value:string }) { const style = value === "converted" || value === "approved_to_call" ? "bg-green-600" : value === "do_not_contact" || value === "do_not_call" ? "bg-red-600" : value === "interested" || value === "follow_up" ? "bg-[#58948f]" : "bg-zinc-500"; return <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${style}`}>{titleCase(value)}</span>; }
function AccessCard({ title, body, href, button, danger=false }: { title:string; body:string; href:string; button:string; danger?:boolean }) { return <section className="mx-auto max-w-xl rounded-[2rem] border border-[#ded0bf] bg-white p-8 text-center dark:border-white/10 dark:bg-white/[0.04]"><p className={`text-xs font-black uppercase tracking-[0.3em] ${danger ? "text-red-600" : "text-[#58948f]"}`}>{danger ? "Access Denied" : "Login Required"}</p><h1 className="mt-4 text-4xl font-black">{title}</h1><p className="mt-4 text-[#725f4d] dark:text-gray-400">{body}</p><Link href={href} className="mt-6 inline-block rounded-full bg-[#093459] px-6 py-3 text-sm font-black uppercase text-white hover:bg-[#58948f] dark:bg-white dark:text-black">{button}</Link></section>; }
function Field({ label, value, onChange, type="text", required=false }: { label:string; value:string; onChange:(v:string)=>void; type?:string; required?:boolean }) { return <div><label className="mb-2 block text-xs font-black uppercase text-[#725f4d]">{label}</label><input required={required} type={type} value={value} onChange={(e) => onChange(e.target.value)} maxLength={254} className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 dark:bg-zinc-900 dark:text-white" /></div>; }
function Select({ label, value, onChange, options }: { label:string; value:string; onChange:(v:string)=>void; options:{value:string;label:string}[] }) { return <div><label className="mb-2 block text-xs font-black uppercase text-[#725f4d]">{label}</label><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 dark:bg-zinc-900 dark:text-white">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>; }
function Info({ label, value }: { label:string; value:string }) { return <div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#725f4d]">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }