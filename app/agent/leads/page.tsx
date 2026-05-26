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
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [callForm, setCallForm] = useState<CallForm>(emptyCallForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [savingCall, setSavingCall] = useState(false);
  const [agentApproved, setAgentApproved] = useState(false);
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
      setAgentApproved(false);
      setLeads([]);
      setActivities([]);
      setLoading(false);
      return;
    }

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

    const [leadResult, activityResult] = await Promise.all([
      supabase
        .from("sales_leads")
        .select(
          "id, customer_name, phone, email, source, status, call_permission_status, do_not_contact, product_interest, next_follow_up_at, last_contacted_at, created_at"
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
    ]);

    if (leadResult.error) {
      addToast("Unable to load assigned leads.", "error");
      console.error("Assigned leads error:", leadResult.error);
    } else {
      setLeads((leadResult.data || []) as Lead[]);
    }

    if (activityResult.error) {
      addToast("Unable to load call activity history.", "error");
      console.error("Lead activities error:", activityResult.error);
    } else {
      setActivities((activityResult.data || []) as Activity[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadLeads();
  }, []);

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
        return date <= endOfDay && date <= today || date <= endOfDay;
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

  const copyPhoneAndOpenDialer = async (lead: Lead) => {
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

    const { error } = await supabase.rpc("record_agent_helloairdial_call", {
      input_lead_id: selectedLead.id,
      input_outcome: callForm.outcome,
      input_notes: callForm.notes.trim() || null,
      input_follow_up_at: callForm.follow_up_at
        ? new Date(callForm.follow_up_at).toISOString()
        : null,
      input_external_call_id: callForm.external_call_id.trim() || null,
      input_call_duration_seconds: duration,
      input_actual_call_cost: cost,
      input_caller_id_used: callForm.caller_id_used.trim() || null,
    });

    if (error) {
      addToast(error.message || "Unable to record call result.", "error");
      console.error("Record HelloAirDial result error:", error);
      setSavingCall(false);
      return;
    }

    addToast("HelloAirDial call result recorded.", "success");
    setCallForm(emptyCallForm);
    await loadLeads();

    const refreshed = leads.find((lead) => lead.id === selectedLead.id);
    if (refreshed) setSelectedLead(refreshed);

    setSavingCall(false);
  };

  const markDoNotContact = async (lead: Lead) => {
    const reason = window.prompt(
      "Reason for Do Not Contact status:",
      "Customer requested no further calls"
    );

    if (reason === null) return;

    const { error } = await supabase.rpc("mark_sales_lead_do_not_contact", {
      input_lead_id: lead.id,
      input_reason: reason.trim() || "Customer requested no further calls",
    });

    if (error) {
      addToast(error.message || "Unable to mark Do Not Contact.", "error");
      return;
    }

    addToast("Lead placed on Do Not Contact list.", "success");
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
        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
          HelloAirDial Workflow
        </p>
        <h1 className="mt-3 text-4xl font-black md:text-6xl">My Leads</h1>
        <p className="mt-3 max-w-3xl text-[#725f4d] dark:text-gray-400">
          Call only authorized assigned leads using HelloAirDial, then record
          the call result and required follow-up in this portal.
        </p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Assigned Leads" value={summary.assigned} />
        <StatCard label="Ready to Call" value={summary.readyToCall} highlight />
        <StatCard label="Follow-ups Due" value={summary.followUpsDue} />
        <StatCard label="Interested" value={summary.interested} />
        <StatCard label="Converted" value={summary.converted} />
        <StatCard label="Do Not Contact" value={summary.doNotContact} danger />
      </section>

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
                    <StatusBadge value={lead.status} />
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

      {selectedLead && (
        <LeadCallModal
          lead={selectedLead}
          activities={leadActivities}
          callForm={callForm}
          setCallForm={setCallForm}
          savingCall={savingCall}
          onClose={() => setSelectedLead(null)}
          onOpenDialer={() => copyPhoneAndOpenDialer(selectedLead)}
          onSubmit={recordCallResult}
          onDoNotContact={() => markDoNotContact(selectedLead)}
        />
      )}
    </AppShell>
  );
}

function LeadCallModal({
  lead,
  activities,
  callForm,
  setCallForm,
  savingCall,
  onClose,
  onOpenDialer,
  onSubmit,
  onDoNotContact,
}: {
  lead: Lead;
  activities: Activity[];
  callForm: CallForm;
  setCallForm: React.Dispatch<React.SetStateAction<CallForm>>;
  savingCall: boolean;
  onClose: () => void;
  onOpenDialer: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onDoNotContact: () => void;
}) {
  const allowed =
    !lead.do_not_contact && lead.call_permission_status === "approved_to_call";

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

              <button
                type="button"
                onClick={onOpenDialer}
                disabled={!allowed}
                className="mt-5 w-full rounded-2xl bg-violet-600 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Copy Number & Open HelloAirDial
              </button>

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
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled: boolean;
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