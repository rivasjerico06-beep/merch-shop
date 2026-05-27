"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { ToastItem } from "@/lib/types";

type LeadStatus =
  | "new"
  | "assigned"
  | "attempted"
  | "interested"
  | "follow_up"
  | "converted"
  | "not_interested"
  | "do_not_contact";

type Lead = {
  id: string;
  customer_name: string;
  phone: string;
  email: string | null;
  source: string;
  status: LeadStatus;
  call_permission_status: "not_confirmed" | "approved_to_call" | "do_not_call";
  do_not_contact: boolean;
  product_interest: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
  contact_basis?: string | null;
  contact_basis_details?: string | null;
  created_via?: string | null;
  agent_acknowledged_at?: string | null;
  assignment_acceptance_due_at?: string | null;
  first_contact_due_at?: string | null;
};

type ReviewRequest = {
  id: string;
  related_lead_id: string | null;
  request_type: string;
  reason: string;
  status: string;
  resolution_notes: string | null;
  created_at: string;
};

type ReviewRequestForm = {
  request_type: string;
  phone: string;
  reason: string;
  related_lead_id: string;
};

const emptyReviewRequestForm: ReviewRequestForm = {
  request_type: "reassignment_or_duplicate",
  phone: "",
  reason: "",
  related_lead_id: "",
};

type Activity = {
  id: string;
  lead_id: string;
  activity_type: string;
  outcome: string | null;
  notes: string | null;
  follow_up_at: string | null;
  call_provider: string | null;
  external_call_id: string | null;
  caller_id_used: string | null;
  call_duration_seconds: number | null;
  actual_call_cost: number | null;
  created_at: string;
};

type CallForm = {
  outcome: string;
  notes: string;
  follow_up_at: string;
  external_call_id: string;
  call_duration_seconds: string;
  actual_call_cost: string;
  caller_id_used: string;
};

const emptyCallForm: CallForm = {
  outcome: "no_answer",
  notes: "",
  follow_up_at: "",
  external_call_id: "",
  call_duration_seconds: "",
  actual_call_cost: "",
  caller_id_used: "",
};

type NewLeadForm = {
  customer_name: string;
  phone: string;
  email: string;
  product_interest: string;
  contact_basis: string;
  contact_basis_details: string;
  consent_reference: string;
  consent_recorded_at: string;
};

const emptyNewLeadForm: NewLeadForm = {
  customer_name: "",
  phone: "",
  email: "",
  product_interest: "",
  contact_basis: "customer_requested_call",
  contact_basis_details: "",
  consent_reference: "",
  consent_recorded_at: "",
};

const contactBasisOptions = [
  { value: "customer_requested_call", label: "Customer requested a call" },
  { value: "customer_messaged_business", label: "Customer messaged the business" },
  {
    value: "existing_customer_requested_assistance",
    label: "Existing customer requested assistance",
  },
  { value: "documented_consent", label: "Documented consent to be contacted" },
];

const outcomeOptions = [
  { value: "no_answer", label: "No Answer" },
  { value: "interested", label: "Interested" },
  { value: "follow_up", label: "Follow Up Needed" },
  { value: "not_interested", label: "Not Interested" },
  { value: "completed_no_sale", label: "Call Completed - No Sale Yet" },
  { value: "do_not_contact", label: "Do Not Contact Requested" },
];

export default function AgentLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [reviewRequests, setReviewRequests] = useState<ReviewRequest[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [callForm, setCallForm] = useState<CallForm>(emptyCallForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState<NewLeadForm>(emptyNewLeadForm);
  const [creatingLead, setCreatingLead] = useState(false);
  const [showReviewRequest, setShowReviewRequest] = useState(false);
  const [reviewRequestForm, setReviewRequestForm] =
    useState<ReviewRequestForm>(emptyReviewRequestForm);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingCall, setSavingCall] = useState(false);
  const [agentApproved, setAgentApproved] = useState(false);
  const [currentAgentId, setCurrentAgentId] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
      3500
    );
  };

  const loadLeads = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setCurrentAgentId("");
      setAgentApproved(false);
      setLeads([]);
      setActivities([]);
      setReviewRequests([]);
      setLoading(false);
      return;
    }

    setCurrentAgentId(user.id);

    const { data: agentProfile } = await supabase
      .from("agent_profiles")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    const approved = agentProfile?.status === "approved";
    setAgentApproved(approved);

    if (!approved) {
      setLoading(false);
      return;
    }

    const [leadResult, activityResult, reviewResult] = await Promise.all([
      supabase
        .from("sales_leads")
        .select(
          "id, customer_name, phone, email, source, status, call_permission_status, do_not_contact, product_interest, next_follow_up_at, last_contacted_at, created_at, contact_basis, contact_basis_details, created_via, agent_acknowledged_at, assignment_acceptance_due_at, first_contact_due_at"
        )
        .eq("assigned_agent_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_activities")
        .select(
          "id, lead_id, activity_type, outcome, notes, follow_up_at, call_provider, external_call_id, caller_id_used, call_duration_seconds, actual_call_cost, created_at"
        )
        .eq("agent_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_review_requests")
        .select("id, related_lead_id, request_type, reason, status, resolution_notes, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (leadResult.error) {
      addToast("Unable to load assigned leads.", "error");
      console.error("Assigned leads error:", leadResult.error);
    } else {
      setLeads((leadResult.data || []) as Lead[]);
    }

    if (activityResult.error) {
      addToast("Unable to load call activity history.", "error");
      console.warn("Lead activities error:", activityResult.error);
    } else {
      setActivities((activityResult.data || []) as Activity[]);
    }

    if (reviewResult.error) {
      addToast("Unable to load admin review requests.", "error");
      console.warn("Review requests error:", reviewResult.error);
    } else {
      setReviewRequests((reviewResult.data || []) as ReviewRequest[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    if (!currentAgentId || !agentApproved) return;

    let refreshTimer: number | undefined;

    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void loadLeads();
      }, 150);
    };

    const channel = supabase
      .channel(`agent-lead-queue-${currentAgentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sales_leads",
          filter: `assigned_agent_id=eq.${currentAgentId}`,
        },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_activities",
          filter: `agent_id=eq.${currentAgentId}`,
        },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_review_requests",
          filter: `requested_by=eq.${currentAgentId}`,
        },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
    // Subscribe only after approved agent identity is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgentId, agentApproved]);

  const summary = useMemo(() => {
    const today = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return {
      assigned: leads.length,
      readyToCall: leads.filter(
        (lead) =>
          lead.call_permission_status === "approved_to_call" &&
          !lead.do_not_contact &&
          !["converted", "not_interested"].includes(lead.status)
      ).length,
      followUpsDue: leads.filter((lead) => {
        if (!lead.next_follow_up_at || lead.do_not_contact) return false;
        const date = new Date(lead.next_follow_up_at);
        return date <= endOfDay;
      }).length,
      interested: leads.filter((lead) => lead.status === "interested").length,
      converted: leads.filter((lead) => lead.status === "converted").length,
      doNotContact: leads.filter((lead) => lead.do_not_contact).length,
    };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();

    return leads.filter((lead) => {
      const matchesQuery =
        !query ||
        lead.customer_name.toLowerCase().includes(query) ||
        lead.phone.toLowerCase().includes(query) ||
        (lead.product_interest || "").toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" || lead.status === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  const leadActivities = useMemo(
    () =>
      selectedLead
        ? activities.filter((activity) => activity.lead_id === selectedLead.id)
        : [],
    [activities, selectedLead]
  );

  const selectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setCallForm(emptyCallForm);
  };

  const createOwnLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = newLeadForm.customer_name.trim();
    const phone = newLeadForm.phone.trim();
    const email = newLeadForm.email.trim();
    const details = newLeadForm.contact_basis_details.trim();

    if (name.length < 2 || name.length > 100) {
      addToast("Customer name must be between 2 and 100 characters.", "error");
      return;
    }

    if (phone.length < 7 || phone.length > 30 || !/^[+0-9() -]+$/.test(phone)) {
      addToast("Enter a valid customer phone number.", "error");
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addToast("Enter a valid email address or leave it blank.", "error");
      return;
    }

    if (details.length < 5 || details.length > 500) {
      addToast("Record how the customer requested or authorized contact.", "error");
      return;
    }

    if (
      newLeadForm.contact_basis === "documented_consent" &&
      (!newLeadForm.consent_reference.trim() || !newLeadForm.consent_recorded_at)
    ) {
      addToast("Documented consent requires a reference and recorded date.", "error");
      return;
    }

    setCreatingLead(true);

    const { error } = await supabase.rpc("create_my_sales_lead", {
      input_customer_name: name,
      input_phone: phone,
      input_email: email || null,
      input_product_interest: newLeadForm.product_interest.trim() || null,
      input_contact_basis: newLeadForm.contact_basis,
      input_contact_basis_details: details,
      input_consent_reference:
        newLeadForm.contact_basis === "documented_consent"
          ? newLeadForm.consent_reference.trim()
          : null,
      input_consent_recorded_at:
        newLeadForm.contact_basis === "documented_consent" &&
        newLeadForm.consent_recorded_at
          ? new Date(newLeadForm.consent_recorded_at).toISOString()
          : null,
    });

    if (error) {
      addToast(error.message || "Unable to create lead.", "error");
      console.error("Create my sales lead error:", error);
      setCreatingLead(false);
      return;
    }

    addToast("Lead created and ready for your assisted workflow.", "success");
    setNewLeadForm(emptyNewLeadForm);
    setShowCreateLead(false);
    await loadLeads();
    setCreatingLead(false);
  };

  const submitReviewRequest = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (reviewRequestForm.reason.trim().length < 10) {
      addToast("Explain the issue using at least 10 characters.", "error");
      return;
    }

    setSubmittingReview(true);

    const { error } = await supabase.rpc("submit_my_lead_review_request", {
      input_request_type: reviewRequestForm.request_type,
      input_reason: reviewRequestForm.reason.trim(),
      input_phone: reviewRequestForm.phone.trim() || null,
      input_related_lead_id: reviewRequestForm.related_lead_id || null,
    });

    if (error) {
      addToast(error.message || "Unable to send admin review request.", "error");
      setSubmittingReview(false);
      return;
    }

    addToast("Admin review request submitted.", "success");
    setReviewRequestForm(emptyReviewRequestForm);
    setShowReviewRequest(false);
    await loadLeads();
    setSubmittingReview(false);
  };

  const requiresInboundAcceptance = (lead: Lead) =>
    lead.created_via === "website_request" && !lead.agent_acknowledged_at;

  const acceptInboundCallback = async (lead: Lead) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      addToast("Your session expired. Please log in again.", "error");
      return;
    }

    const response = await fetch("/api/agent/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: "accept_callback",
        lead_id: lead.id,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      if (response.status === 429 || payload.error === "RATE_LIMITED") {
        addToast("Too many lead actions. Please try again shortly.", "error");
      } else {
        addToast(payload.message || "Unable to accept this callback request.", "error");
      }
      return;
    }

    addToast(
      payload.message || "Callback request accepted. You may now contact the customer.",
      "success"
    );

    await loadLeads();

    setSelectedLead((previous) =>
      previous?.id === lead.id
        ? {
            ...previous,
            agent_acknowledged_at: new Date().toISOString(),
            first_contact_due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          }
        : previous
    );
  };
  
  const copyAssistedShoppingLink = async (lead: Lead) => {
    if (requiresInboundAcceptance(lead)) {
      addToast(
        "Accept this customer callback request before sending a shopping link.",
        "error"
      );
      return;
    }

    if (
      lead.do_not_contact ||
      lead.call_permission_status !== "approved_to_call" ||
      lead.status === "converted"
    ) {
      addToast("This lead is not eligible for an assisted shopping link.", "error");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      addToast("Your session expired. Please log in again.", "error");
      return;
    }

    const response = await fetch("/api/agent/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: "create_assisted_link",
        lead_id: lead.id,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      assist_token?: string;
      expires_at?: string;
      message?: string;
      error?: string;
    };

    if (!response.ok || !payload.assist_token) {
      if (response.status === 429 || payload.error === "RATE_LIMITED") {
        addToast("Too many lead actions. Please try again shortly.", "error");
      } else {
        addToast(
          payload.message || "Unable to create assisted shopping link.",
          "error"
        );
      }
      return;
    }

    const link = `${window.location.origin}/products?assist=${encodeURIComponent(
      payload.assist_token
    )}`;

    try {
      await navigator.clipboard.writeText(link);
      addToast("Single-use assisted shopping link copied.", "success");
    } catch {
      addToast("Link created, but could not be copied. Please try again.", "error");
    }
  };

  const copyPhoneAndOpenDialer = async (lead: Lead) => {
    if (requiresInboundAcceptance(lead)) {
      addToast("Accept this customer callback request before placing a call.", "error");
      return;
    }

    if (
      lead.do_not_contact ||
      lead.call_permission_status !== "approved_to_call"
    ) {
      addToast("Calling is not authorized for this lead.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(lead.phone);
      addToast("Phone number copied. Paste it into HelloAirDial.", "success");
    } catch {
      addToast("Open HelloAirDial and manually enter the approved phone number.", "info");
    }

    window.open("https://www.helloairdial.com/dial", "_blank", "noopener,noreferrer");
  };

 const recordCallResult = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedLead) return;

    if (requiresInboundAcceptance(selectedLead)) {
      addToast("Accept this customer callback request before recording a call.", "error");
      return;
    }

    if (callForm.outcome === "follow_up" && !callForm.follow_up_at) {
      addToast("Set a follow-up date and time.", "error");
      return;
    }

    if (callForm.notes.length > 2000) {
      addToast("Notes must be 2,000 characters or fewer.", "error");
      return;
    }

    const duration =
      callForm.call_duration_seconds.trim() === ""
        ? null
        : Number(callForm.call_duration_seconds);

    const cost =
      callForm.actual_call_cost.trim() === ""
        ? null
        : Number(callForm.actual_call_cost);

    if (duration !== null && (!Number.isFinite(duration) || duration < 0)) {
      addToast("Enter a valid duration in seconds.", "error");
      return;
    }

    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      addToast("Enter a valid call cost.", "error");
      return;
    }

    setSavingCall(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      addToast("Your session expired. Please log in again.", "error");
      setSavingCall(false);
      return;
    }

    const response = await fetch("/api/agent/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: "record_call",
        lead_id: selectedLead.id,
        outcome: callForm.outcome,
        notes: callForm.notes.trim() || null,
        follow_up_at: callForm.follow_up_at
          ? new Date(callForm.follow_up_at).toISOString()
          : null,
        external_call_id: callForm.external_call_id.trim() || null,
        call_duration_seconds: duration,
        actual_call_cost: cost,
        caller_id_used: callForm.caller_id_used.trim() || null,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      if (response.status === 429 || payload.error === "RATE_LIMITED") {
        addToast("Too many lead actions. Please try again shortly.", "error");
      } else {
        addToast(payload.message || "Unable to record call result.", "error");
      }
      setSavingCall(false);
      return;
    }

    addToast(payload.message || "HelloAirDial call result recorded.", "success");
    setCallForm(emptyCallForm);
    setSelectedLead(null);
    await loadLeads();
    setSavingCall(false);
  };

  const markDoNotContact = async (lead: Lead) => {
    const reason = window.prompt(
      "Reason for Do Not Contact status:",
      "Customer requested no further calls"
    );

    if (reason === null) return;

    const finalReason = reason.trim() || "Customer requested no further calls";

    if (finalReason.length < 3 || finalReason.length > 500) {
      addToast("Provide a Do Not Contact reason between 3 and 500 characters.", "error");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      addToast("Your session expired. Please log in again.", "error");
      return;
    }

    const response = await fetch("/api/agent/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: "mark_do_not_contact",
        lead_id: lead.id,
        notes: finalReason,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      if (response.status === 429 || payload.error === "RATE_LIMITED") {
        addToast("Too many lead actions. Please try again shortly.", "error");
      } else {
        addToast(payload.message || "Unable to mark Do Not Contact.", "error");
      }
      return;
    }

    addToast(payload.message || "Lead placed on Do Not Contact list.", "success");
    setSelectedLead(null);
    await loadLeads();
  };

  if (loading) {
    return (
      <AppShell title="My Leads" toasts={toasts}>
        <LoadingCard />
      </AppShell>
    );
  }

  if (!agentApproved) {
    return (
      <AppShell title="My Leads" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-[#ded0bf] bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
            Agent Portal
          </p>
          <h1 className="mt-4 text-4xl font-black">Approved Access Required</h1>
          <p className="mt-4 text-[#725f4d] dark:text-gray-400">
            Only approved agents can access assigned leads and call logging.
          </p>
          <Link
            href="/agent"
            className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white dark:bg-white dark:text-black"
          >
            Agent Status
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="My Leads"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search assigned leads..."
      toasts={toasts}
    >
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
              HelloAirDial Workflow
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">My Leads</h1>
            <p className="mt-3 max-w-3xl text-[#725f4d] dark:text-gray-400">
              Create legitimate customer-assistance leads, call through HelloAirDial,
              record outcomes, and send single-use shopping links when customers are interested.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowReviewRequest(true)}
              className="rounded-full border border-[#cdbba7] bg-white px-6 py-4 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:bg-transparent"
            >
              Request Admin Review
            </button>

            <button
              type="button"
              onClick={() => setShowCreateLead(true)}
              className="rounded-full bg-zinc-950 px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black"
            >
              New Lead
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Assigned Leads" value={summary.assigned} />
        <StatCard label="Ready to Call" value={summary.readyToCall} highlight />
        <StatCard label="Follow-ups Due" value={summary.followUpsDue} />
        <StatCard label="Interested" value={summary.interested} />
        <StatCard label="Converted" value={summary.converted} />
        <StatCard label="Do Not Contact" value={summary.doNotContact} danger />
      </section>

      <section className="mt-6 rounded-[2rem] border border-green-200 bg-green-50 p-5 text-sm text-green-950 dark:border-green-400/20 dark:bg-green-400/10 dark:text-green-100">
        <p className="font-black">Self-service lead creation is controlled</p>
        <p className="mt-2">
          You may create a callable lead only when the customer requested contact,
          messaged the business, requested assistance as an existing customer, or gave
          documented consent. Duplicate active contacts and Do Not Contact records are blocked.
        </p>
      </section>

      {reviewRequests.length > 0 && (
        <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">My Admin Review Requests</h2>
          <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
            Use this for duplicate contact reassignment, DNC concerns, or conversion disputes.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {reviewRequests.slice(0, 6).map((request) => (
              <div
                key={request.id}
                className="rounded-2xl border border-[#eadfd1] p-4 dark:border-white/10"
              >
                <div className="flex justify-between gap-3">
                  <p className="font-black">{titleCase(request.request_type)}</p>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${
                    request.status === "open"
                      ? "bg-amber-500 text-black"
                      : request.status === "resolved"
                        ? "bg-green-600"
                        : "bg-red-600"
                  }`}>
                    {request.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#725f4d] dark:text-gray-300">
                  {request.reason}
                </p>
                {request.resolution_notes && (
                  <p className="mt-3 rounded-xl bg-green-50 p-3 text-xs text-green-900 dark:bg-green-400/10 dark:text-green-100">
                    Admin response: {request.resolution_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-black">Assigned Call Queue</h2>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
              Only leads marked approved to call may be dialed.
            </p>
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm font-bold outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="assigned">Assigned</option>
            <option value="attempted">Attempted</option>
            <option value="interested">Interested</option>
            <option value="follow_up">Follow Up</option>
            <option value="converted">Converted</option>
            <option value="not_interested">Not Interested</option>
            <option value="do_not_contact">Do Not Contact</option>
          </select>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#ded0bf] text-xs uppercase tracking-[0.16em] text-[#725f4d] dark:border-white/10 dark:text-gray-400">
                <th className="py-4">Lead</th>
                <th className="py-4">Interest</th>
                <th className="py-4">Permission</th>
                <th className="py-4">Status</th>
                <th className="py-4">Follow-up</th>
                <th className="py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-[#eadfd1] dark:border-white/5"
                >
                  <td className="py-4">
                    <p className="font-black">{lead.customer_name}</p>
                    <p className="text-xs text-[#725f4d] dark:text-gray-400">
                      {lead.phone}
                    </p>
                  </td>
                  <td className="py-4">
                    {lead.product_interest || "Not specified"}
                  </td>
                  <td className="py-4">
                    <PermissionBadge value={lead.call_permission_status} />
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col items-start gap-2">
                      <StatusBadge value={lead.status} />
                      {requiresInboundAcceptance(lead) && (
                        <span className="rounded-full bg-amber-500 px-3 py-1 text-[10px] font-black uppercase text-black">
                          Accept Required
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4">
                    {lead.next_follow_up_at
                      ? new Date(lead.next_follow_up_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="py-4">
                    <button
                      type="button"
                      onClick={() => selectLead(lead)}
                      className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-black text-white transition hover:bg-violet-700 dark:bg-white dark:text-black"
                    >
                      View / Call
                    </button>
                  </td>
                </tr>
              ))}

              {filteredLeads.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-[#725f4d] dark:text-gray-400"
                  >
                    No assigned leads found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showReviewRequest && (
        <ReviewRequestModal
          form={reviewRequestForm}
          setForm={setReviewRequestForm}
          leads={leads}
          saving={submittingReview}
          onSubmit={submitReviewRequest}
          onClose={() => {
            setReviewRequestForm(emptyReviewRequestForm);
            setShowReviewRequest(false);
          }}
        />
      )}

      {showCreateLead && (
        <CreateLeadModal
          form={newLeadForm}
          setForm={setNewLeadForm}
          saving={creatingLead}
          onSubmit={createOwnLead}
          onClose={() => {
            setNewLeadForm(emptyNewLeadForm);
            setShowCreateLead(false);
          }}
        />
      )}

      {selectedLead && (
        <LeadCallModal
          lead={selectedLead}
          activities={leadActivities}
          callForm={callForm}
          setCallForm={setCallForm}
          savingCall={savingCall}
          onClose={() => setSelectedLead(null)}
          onAccept={() => acceptInboundCallback(selectedLead)}
          onOpenDialer={() => copyPhoneAndOpenDialer(selectedLead)}
          onCopyAssistedLink={() => copyAssistedShoppingLink(selectedLead)}
          onSubmit={recordCallResult}
          onDoNotContact={() => markDoNotContact(selectedLead)}
        />
      )}
    </AppShell>
  );
}

function ReviewRequestModal({
  form,
  setForm,
  leads,
  saving,
  onSubmit,
  onClose,
}: {
  form: ReviewRequestForm;
  setForm: React.Dispatch<React.SetStateAction<ReviewRequestForm>>;
  leads: Lead[];
  saving: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-2xl rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-2 text-sm font-black text-white dark:bg-white dark:text-black"
        >
          ✕
        </button>

        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
          Exception Request
        </p>
        <h2 className="mt-3 text-3xl font-black">Request Admin Review</h2>

        <div className="mt-6 space-y-4">
          <SelectField
            label="Request Type"
            value={form.request_type}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, request_type: value }))
            }
            options={[
              { value: "reassignment_or_duplicate", label: "Duplicate Contact / Reassignment" },
              { value: "do_not_contact_review", label: "Do Not Contact Review" },
              { value: "conversion_dispute", label: "Conversion Dispute" },
              { value: "compliance_question", label: "Compliance Question" },
              { value: "other", label: "Other" },
            ]}
            disabled={saving}
          />

          <SelectField
            label="Related Lead (Optional)"
            value={form.related_lead_id}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, related_lead_id: value }))
            }
            options={[
              { value: "", label: "No related assigned lead" },
              ...leads.map((lead) => ({
                value: lead.id,
                label: `${lead.customer_name} - ${lead.phone}`,
              })),
            ]}
            disabled={saving}
          />

          <Field
            label="Phone Number Involved (Optional)"
            value={form.phone}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, phone: value }))
            }
            disabled={saving}
            maxLength={30}
          />

          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
              Reason / Details
            </label>
            <textarea
              rows={5}
              maxLength={1000}
              disabled={saving}
              value={form.reason}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, reason: event.target.value }))
              }
              placeholder="Explain what admin needs to review and what action may be needed."
              className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm outline-none focus:border-violet-600 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-6 w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {saving ? "Submitting..." : "Submit Review Request"}
        </button>
      </form>
    </div>
  );
}

function CreateLeadModal({
  form,
  setForm,
  saving,
  onSubmit,
  onClose,
}: {
  form: NewLeadForm;
  setForm: React.Dispatch<React.SetStateAction<NewLeadForm>>;
  saving: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="relative max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-2 text-sm font-black text-white dark:bg-white dark:text-black"
        >
          ✕
        </button>

        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
          Self-Service Lead
        </p>
        <h2 className="mt-3 text-3xl font-black">Create Customer Lead</h2>
        <p className="mt-3 max-w-2xl text-sm text-[#725f4d] dark:text-gray-400">
          Create a lead only for a customer you are permitted to contact. Cold contacts
          without an authorized basis must be sent for admin review instead.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field
            label="Customer Name"
            value={form.customer_name}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, customer_name: value }))
            }
            disabled={saving}
            maxLength={100}
          />

          <Field
            label="Phone Number"
            value={form.phone}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, phone: value }))
            }
            disabled={saving}
            maxLength={30}
          />

          <Field
            label="Email (Optional)"
            value={form.email}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, email: value }))
            }
            disabled={saving}
            maxLength={254}
          />

          <Field
            label="Product Interest (Optional)"
            value={form.product_interest}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, product_interest: value }))
            }
            disabled={saving}
            maxLength={200}
          />

          <div className="sm:col-span-2">
            <SelectField
              label="Contact Basis"
              value={form.contact_basis}
              onChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  contact_basis: value,
                  consent_reference:
                    value === "documented_consent"
                      ? previous.consent_reference
                      : "",
                  consent_recorded_at:
                    value === "documented_consent"
                      ? previous.consent_recorded_at
                      : "",
                }))
              }
              options={contactBasisOptions}
              disabled={saving}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
            Contact Basis Details
          </label>
          <textarea
            rows={3}
            maxLength={500}
            disabled={saving}
            value={form.contact_basis_details}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                contact_basis_details: event.target.value,
              }))
            }
            placeholder="Example: Customer requested a call about the Bitcoin Diamond item in Messenger on May 26, 2026."
            className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm outline-none focus:border-violet-600 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          />
        </div>

        {form.contact_basis === "documented_consent" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Consent Reference"
              value={form.consent_reference}
              onChange={(value) =>
                setForm((previous) => ({ ...previous, consent_reference: value }))
              }
              disabled={saving}
              maxLength={300}
            />

            <Field
              label="Consent Recorded Date/Time"
              type="datetime-local"
              value={form.consent_recorded_at}
              onChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  consent_recorded_at: value,
                }))
              }
              disabled={saving}
            />
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          Do not add contacts who did not request assistance or authorize contact.
          A customer who requests no further calls must be marked Do Not Contact immediately.
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-6 w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {saving ? "Creating..." : "Create Ready-to-Call Lead"}
        </button>
      </form>
    </div>
  );
}

function LeadCallModal({
  lead,
  activities,
  callForm,
  setCallForm,
  savingCall,
  onClose,
  onAccept,
  onOpenDialer,
  onCopyAssistedLink,
  onSubmit,
  onDoNotContact,
}: {
  lead: Lead;
  activities: Activity[];
  callForm: CallForm;
  setCallForm: React.Dispatch<React.SetStateAction<CallForm>>;
  savingCall: boolean;
  onClose: () => void;
  onAccept: () => void;
  onOpenDialer: () => void;
  onCopyAssistedLink: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onDoNotContact: () => void;
}) {
  const needsAcceptance =
    lead.created_via === "website_request" && !lead.agent_acknowledged_at;

  const allowed =
    !needsAcceptance &&
    !lead.do_not_contact &&
    lead.call_permission_status === "approved_to_call";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-2 text-sm font-black text-white dark:bg-white dark:text-black"
        >
          ✕
        </button>

        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
          Assigned Lead
        </p>
        <h2 className="mt-3 text-3xl font-black">{lead.customer_name}</h2>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <div className="rounded-3xl bg-[#f8efe4] p-5 dark:bg-white/[0.05]">
              <h3 className="text-xl font-black">Contact Details</h3>
              <div className="mt-4 space-y-3 text-sm">
                <InfoRow label="Phone" value={lead.phone} />
                <InfoRow label="Email" value={lead.email || "Not provided"} />
                <InfoRow label="Product Interest" value={lead.product_interest || "Not specified"} />
                <InfoRow label="Status" value={titleCase(lead.status)} />
                <InfoRow label="Permission" value={titleCase(lead.call_permission_status)} />
              </div>

              {needsAcceptance && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                  <p className="font-black">Acceptance required before calling</p>
                  <p className="mt-2">
                    This customer requested a callback through the website. Accept
                    the assignment first so response tracking starts correctly.
                  </p>
                  {lead.assignment_acceptance_due_at && (
                    <p className="mt-2 text-xs font-bold">
                      Accept by: {new Date(lead.assignment_acceptance_due_at).toLocaleString()}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={onAccept}
                    className="mt-4 w-full rounded-2xl bg-green-600 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-green-700"
                  >
                    Accept Request
                  </button>
                </div>
              )}

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={onOpenDialer}
                  disabled={!allowed}
                  className="w-full rounded-2xl bg-violet-600 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy Number & Open HelloAirDial
                </button>

                <button
                  type="button"
                  onClick={onCopyAssistedLink}
                  disabled={!allowed || lead.status === "converted"}
                  className="w-full rounded-2xl border border-violet-200 bg-white py-4 text-xs font-black uppercase tracking-[0.18em] text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-400/20 dark:bg-transparent dark:text-violet-200"
                >
                  Copy Single-Use Shopping Link
                </button>
              </div>

              {allowed && lead.status !== "converted" && (
                <p className="mt-3 text-xs text-[#725f4d] dark:text-gray-400">
                  Send this link only to this customer. The first completed attributed order converts this lead and consumes the link.
                </p>
              )}

              {!allowed && (
                <p className="mt-3 text-sm font-bold text-red-600 dark:text-red-300">
                  Calling is blocked until admin approves calling permission, or
                  because this lead is Do Not Contact.
                </p>
              )}
            </div>

            <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
              <p className="font-black">Before calling</p>
              <p className="mt-2">
                Use HelloAirDial outside this app. After the call, return here
                to record the result. Never store payment information in notes.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="rounded-3xl border border-[#ded0bf] p-5 dark:border-white/10">
            <h3 className="text-xl font-black">Record Call Outcome</h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Outcome"
                value={callForm.outcome}
                onChange={(value) =>
                  setCallForm((prev) => ({ ...prev, outcome: value }))
                }
                options={outcomeOptions}
                disabled={!allowed}
              />

              <Field
                label="Follow-up Date/Time"
                type="datetime-local"
                value={callForm.follow_up_at}
                onChange={(value) =>
                  setCallForm((prev) => ({ ...prev, follow_up_at: value }))
                }
                disabled={!allowed || callForm.outcome !== "follow_up"}
              />

              <Field
                label="HelloAirDial Call ID (optional)"
                value={callForm.external_call_id}
                onChange={(value) =>
                  setCallForm((prev) => ({ ...prev, external_call_id: value }))
                }
                disabled={!allowed}
                maxLength={150}
              />

              <Field
                label="Caller ID Used (optional)"
                value={callForm.caller_id_used}
                onChange={(value) =>
                  setCallForm((prev) => ({ ...prev, caller_id_used: value }))
                }
                disabled={!allowed}
                maxLength={30}
              />

              <Field
                label="Duration in Seconds (optional)"
                type="number"
                value={callForm.call_duration_seconds}
                onChange={(value) =>
                  setCallForm((prev) => ({
                    ...prev,
                    call_duration_seconds: value,
                  }))
                }
                disabled={!allowed}
              />

              <Field
                label="Actual Call Cost (optional)"
                type="number"
                value={callForm.actual_call_cost}
                onChange={(value) =>
                  setCallForm((prev) => ({ ...prev, actual_call_cost: value }))
                }
                disabled={!allowed}
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
                Notes
              </label>
              <textarea
                rows={4}
                maxLength={2000}
                disabled={!allowed}
                value={callForm.notes}
                onChange={(event) =>
                  setCallForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm outline-none focus:border-violet-600 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                placeholder="Call result, product discussed, customer request..."
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={!allowed || savingCall}
                className="flex-1 rounded-2xl bg-zinc-950 py-4 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-violet-700 disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {savingCall ? "Saving..." : "Save Call Result"}
              </button>

              {!lead.do_not_contact && (
                <button
                  type="button"
                  onClick={onDoNotContact}
                  className="rounded-2xl bg-red-600 px-5 py-4 text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-red-700"
                >
                  Do Not Contact
                </button>
              )}
            </div>
          </form>
        </div>

        <section className="mt-6 rounded-3xl border border-[#ded0bf] p-5 dark:border-white/10">
          <h3 className="text-xl font-black">Activity History</h3>
          <div className="mt-4 space-y-3">
            {activities.length === 0 ? (
              <p className="rounded-2xl bg-[#f8efe4] p-4 text-sm text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400">
                No recorded activity for this lead.
              </p>
            ) : (
              activities.slice(0, 10).map((activity) => (
                <div
                  key={activity.id}
                  className="rounded-2xl bg-[#f8efe4] p-4 text-sm dark:bg-white/[0.05]"
                >
                  <div className="flex flex-col justify-between gap-2 sm:flex-row">
                    <p className="font-black">
                      {titleCase(activity.outcome || activity.activity_type)}
                    </p>
                    <p className="text-xs text-[#725f4d] dark:text-gray-400">
                      {new Date(activity.created_at).toLocaleString()}
                    </p>
                  </div>
                  {activity.notes && (
                    <p className="mt-2 text-[#725f4d] dark:text-gray-300">
                      {activity.notes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
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
  danger = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-[2rem] border p-5 shadow-sm ${
        danger
          ? "border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-400/10"
          : highlight
            ? "border-violet-200 bg-violet-50 dark:border-violet-400/20 dark:bg-violet-400/10"
            : "border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]"
      }`}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#725f4d] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}

function PermissionBadge({ value }: { value: Lead["call_permission_status"] }) {
  const className =
    value === "approved_to_call"
      ? "bg-green-600"
      : value === "do_not_call"
        ? "bg-red-600"
        : "bg-amber-500 text-black";

  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${className}`}>
      {titleCase(value)}
    </span>
  );
}

function StatusBadge({ value }: { value: string }) {
  const className =
    value === "converted"
      ? "bg-green-600"
      : value === "do_not_contact"
        ? "bg-red-600"
        : value === "interested" || value === "follow_up"
          ? "bg-violet-600"
          : "bg-zinc-500";

  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${className}`}>
      {titleCase(value)}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
        {label}
      </label>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "any" : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm outline-none focus:border-violet-600 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
        {label}
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm outline-none focus:border-violet-600 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}