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
  status: string;
};

type Lead = {
  id: string;
  assigned_agent_id: string | null;
  customer_name: string;
  phone: string;
  email: string | null;
  source: string;
  status: string;
  call_permission_status: string;
  do_not_contact: boolean;
  do_not_contact_at: string | null;
  do_not_contact_reason: string | null;
  product_interest: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
};

type Activity = {
  id: string;
  lead_id: string;
  agent_id: string | null;
  activity_type: string;
  outcome: string | null;
  notes: string | null;
  follow_up_at: string | null;
  call_provider: string | null;
  external_call_id: string | null;
  call_duration_seconds: number | null;
  actual_call_cost: number | null;
  created_at: string;
};

type LeadForm = {
  customer_name: string;
  phone: string;
  email: string;
  source: string;
  product_interest: string;
  assigned_agent_id: string;
  call_permission_status: string;
};

const emptyForm: LeadForm = {
  customer_name: "",
  phone: "",
  email: "",
  source: "admin_entry",
  product_interest: "",
  assigned_agent_id: "",
  call_permission_status: "not_confirmed",
};

const statusOptions = [
  "all",
  "new",
  "assigned",
  "attempted",
  "interested",
  "follow_up",
  "converted",
  "not_interested",
  "do_not_contact",
];

export default function AdminLeadsPage() {
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [agents, setAgents] = useState<ApprovedAgent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
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
    const id = Date.now();
    setToasts((previous) => [...previous, { id, message, type }]);
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 3500);
  };

  const formatUSD = (value: number | null | undefined) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));

  const loadPage = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAdminProfile(null);
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

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

    const [agentsResult, leadsResult, activitiesResult] = await Promise.all([
      supabase
        .from("agent_profiles")
        .select("user_id, display_name, referral_code, status")
        .eq("status", "approved")
        .order("display_name", { ascending: true }),
      supabase
        .from("sales_leads")
        .select(
          "id, assigned_agent_id, customer_name, phone, email, source, status, call_permission_status, do_not_contact, do_not_contact_at, do_not_contact_reason, product_interest, next_follow_up_at, last_contacted_at, created_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_activities")
        .select(
          "id, lead_id, agent_id, activity_type, outcome, notes, follow_up_at, call_provider, external_call_id, call_duration_seconds, actual_call_cost, created_at"
        )
        .order("created_at", { ascending: false }),
    ]);

    if (agentsResult.error) {
      addToast("Unable to load approved agents.", "error");
      console.error("Approved agents load error:", agentsResult.error);
    } else {
      setAgents((agentsResult.data || []) as ApprovedAgent[]);
    }

    if (leadsResult.error) {
      addToast("Unable to load leads.", "error");
      console.error("Sales leads load error:", leadsResult.error);
    } else {
      setLeads((leadsResult.data || []) as Lead[]);
    }

    if (activitiesResult.error) {
      addToast("Unable to load lead activities.", "error");
      console.error("Lead activity load error:", activitiesResult.error);
    } else {
      setActivities((activitiesResult.data || []) as Activity[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadPage();
  }, []);

  const agentName = (agentId: string | null) =>
    agents.find((agent) => agent.user_id === agentId)?.display_name ||
    (agentId ? "Approved Agent" : "Unassigned");

  const summary = useMemo(() => {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const contacted = leads.filter((lead) => lead.last_contacted_at).length;
    const converted = leads.filter((lead) => lead.status === "converted").length;

    return {
      total: leads.length,
      readyToCall: leads.filter(
        (lead) =>
          lead.call_permission_status === "approved_to_call" &&
          !lead.do_not_contact &&
          !["converted", "not_interested"].includes(lead.status)
      ).length,
      followUpsDue: leads.filter(
        (lead) =>
          Boolean(lead.next_follow_up_at) &&
          !lead.do_not_contact &&
          new Date(lead.next_follow_up_at as string) <= todayEnd
      ).length,
      interested: leads.filter((lead) => lead.status === "interested").length,
      converted,
      doNotContact: leads.filter((lead) => lead.do_not_contact).length,
      conversionRate: contacted > 0 ? (converted / contacted) * 100 : 0,
    };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();

    return leads.filter((lead) => {
      const matchesSearch =
        !query ||
        lead.customer_name.toLowerCase().includes(query) ||
        lead.phone.toLowerCase().includes(query) ||
        (lead.email || "").toLowerCase().includes(query) ||
        (lead.product_interest || "").toLowerCase().includes(query) ||
        agentName(lead.assigned_agent_id).toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" || lead.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter, agents]);

  const selectedActivities = useMemo(
    () =>
      selectedLead
        ? activities.filter((activity) => activity.lead_id === selectedLead.id)
        : [],
    [activities, selectedLead]
  );

  const validateLeadForm = () => {
    const name = form.customer_name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    const interest = form.product_interest.trim();

    if (name.length < 2 || name.length > 100) {
      return "Customer name must be between 2 and 100 characters.";
    }

    if (phone.length < 7 || phone.length > 30 || !/^[+0-9() -]+$/.test(phone)) {
      return "Enter a valid customer phone number.";
    }

    if (
      email &&
      (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      return "Enter a valid email address or leave it blank.";
    }

    if (interest.length > 200) {
      return "Product interest must be 200 characters or fewer.";
    }

    if (
      form.call_permission_status === "approved_to_call" &&
      !form.assigned_agent_id
    ) {
      return "Assign an approved agent before authorizing a call.";
    }

    return "";
  };

  const createLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validateLeadForm();

    if (validationError) {
      addToast(validationError, "error");
      return;
    }

    setSaving(true);

    const status = form.assigned_agent_id ? "assigned" : "new";

    const { data, error } = await supabase
      .from("sales_leads")
      .insert({
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        source: form.source,
        product_interest: form.product_interest.trim() || null,
        assigned_agent_id: form.assigned_agent_id || null,
        call_permission_status: form.call_permission_status,
        status,
      })
      .select("id")
      .single();

    if (error || !data) {
      addToast("Unable to create lead.", "error");
      console.error("Create lead error:", error);
      setSaving(false);
      return;
    }

    const { error: activityError } = await supabase.from("lead_activities").insert({
      lead_id: data.id,
      agent_id: form.assigned_agent_id || null,
      activity_type: "assignment",
      notes: form.assigned_agent_id
        ? `Assigned to ${agentName(form.assigned_agent_id)}.`
        : "Lead created without agent assignment.",
    });

    if (activityError) {
      console.error("Assignment history insert error:", activityError);
    }

    addToast("Lead created successfully.", "success");
    setForm(emptyForm);
    setShowCreate(false);
    await loadPage();
    setSaving(false);
  };

  const updateAssignment = async (lead: Lead, assignedAgentId: string) => {
    setSavingLeadId(lead.id);

    const updates = {
      assigned_agent_id: assignedAgentId || null,
      status:
        assignedAgentId && lead.status === "new"
          ? "assigned"
          : !assignedAgentId && lead.status === "assigned"
            ? "new"
            : lead.status,
      call_permission_status: assignedAgentId
        ? lead.call_permission_status
        : "not_confirmed",
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("sales_leads")
      .update(updates)
      .eq("id", lead.id);

    if (error) {
      addToast("Unable to update lead assignment.", "error");
      console.error(error);
    } else {
      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        agent_id: assignedAgentId || null,
        activity_type: "assignment",
        notes: assignedAgentId
          ? `Assigned to ${agentName(assignedAgentId)}.`
          : "Agent assignment removed.",
      });
      addToast("Lead assignment updated.", "success");
      await loadPage();
    }

    setSavingLeadId(null);
  };

  const setCallPermission = async (
    lead: Lead,
    permission: "approved_to_call" | "not_confirmed"
  ) => {
    if (!lead.assigned_agent_id && permission === "approved_to_call") {
      addToast("Assign an agent before approving the lead for calling.", "error");
      return;
    }

    if (lead.do_not_contact) {
      addToast("Do Not Contact leads cannot be reauthorized here.", "error");
      return;
    }

    setSavingLeadId(lead.id);

    const { error } = await supabase
      .from("sales_leads")
      .update({
        call_permission_status: permission,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    if (error) {
      addToast("Unable to update calling permission.", "error");
      console.error(error);
    } else {
      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        agent_id: lead.assigned_agent_id,
        activity_type: "status_change",
        notes:
          permission === "approved_to_call"
            ? "Admin authorized outbound calling through HelloAirDial."
            : "Admin removed calling authorization.",
      });
      addToast(
        permission === "approved_to_call"
          ? "Lead approved for HelloAirDial calling."
          : "Calling authorization removed.",
        "success"
      );
      await loadPage();
    }

    setSavingLeadId(null);
  };

  const markDoNotContact = async (lead: Lead) => {
    const reason = window.prompt(
      "Reason for Do Not Contact status:",
      "Customer requested no further calls"
    );

    if (reason === null) return;

    setSavingLeadId(lead.id);

    const { error } = await supabase.rpc("mark_sales_lead_do_not_contact", {
      input_lead_id: lead.id,
      input_reason: reason.trim() || "Customer requested no further calls",
    });

    if (error) {
      addToast("Unable to mark Do Not Contact.", "error");
      console.error(error);
    } else {
      addToast("Lead marked Do Not Contact.", "success");
      setSelectedLead(null);
      await loadPage();
    }

    setSavingLeadId(null);
  };

  if (loading) {
    return (
      <AppShell title="Lead Management" toasts={toasts}>
        <LoadingCard />
      </AppShell>
    );
  }

  if (!adminProfile) {
    return (
      <AppShell title="Lead Management" toasts={toasts}>
        <AccessCard
          title="Admin Login"
          body="Log in as admin to manage leads and HelloAirDial assignments."
          href="/login?redirect=/admin/leads"
          button="Log In as Admin"
        />
      </AppShell>
    );
  }

  if (adminProfile.role !== "admin") {
    return (
      <AppShell title="Lead Management" toasts={toasts}>
        <AccessCard
          title="Admin Only"
          body="Only admin accounts can create and assign customer leads."
          href="/"
          button="Back to Shop"
          danger
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Lead Management"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search customer, phone, product, or agent..."
      toasts={toasts}
    >
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
              HelloAirDial Operations
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Lead Management
            </h1>
            <p className="mt-3 max-w-3xl text-[#725f4d] dark:text-gray-400">
              Create leads, assign approved agents, authorize outbound calls,
              and monitor follow-up outcomes recorded from HelloAirDial.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-full bg-zinc-950 px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black"
          >
            Add New Lead
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <StatCard label="All Leads" value={summary.total} />
        <StatCard label="Ready to Call" value={summary.readyToCall} highlight />
        <StatCard label="Follow-ups Due" value={summary.followUpsDue} />
        <StatCard label="Interested" value={summary.interested} />
        <StatCard label="Converted" value={summary.converted} />
        <StatCard label="Do Not Contact" value={summary.doNotContact} danger />
        <StatCard label="Conversion" value={`${summary.conversionRate.toFixed(1)}%`} />
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-black">Lead Queue</h2>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
              Calling permission must be approved before an agent can log a call.
            </p>
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm font-bold outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All Statuses" : titleCase(status)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#ded0bf] text-xs uppercase tracking-[0.16em] text-[#725f4d] dark:border-white/10 dark:text-gray-400">
                <th className="py-4">Lead</th>
                <th className="py-4">Product Interest</th>
                <th className="py-4">Assigned Agent</th>
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
                    <p className="mt-1 text-xs text-[#725f4d] dark:text-gray-400">
                      {lead.phone}
                    </p>
                  </td>
                  <td className="py-4">
                    {lead.product_interest || "Not specified"}
                  </td>
                  <td className="py-4">
                    <select
                      value={lead.assigned_agent_id || ""}
                      disabled={Boolean(lead.do_not_contact) || savingLeadId === lead.id}
                      onChange={(event) =>
                        updateAssignment(lead, event.target.value)
                      }
                      className="max-w-[180px] rounded-xl border border-[#cdbba7] bg-white px-3 py-2 text-xs font-bold outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.user_id} value={agent.user_id}>
                          {agent.display_name || "Unnamed Agent"}
                        </option>
                      ))}
                    </select>
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
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedLead(lead)}
                        className="rounded-full border border-[#cdbba7] px-4 py-2 text-xs font-bold transition hover:bg-zinc-950 hover:text-white dark:border-white/10"
                      >
                        Details
                      </button>

                      {!lead.do_not_contact &&
                        lead.call_permission_status !== "approved_to_call" && (
                          <button
                            type="button"
                            disabled={savingLeadId === lead.id}
                            onClick={() =>
                              setCallPermission(lead, "approved_to_call")
                            }
                            className="rounded-full bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            Approve Call
                          </button>
                        )}

                      {!lead.do_not_contact &&
                        lead.call_permission_status === "approved_to_call" && (
                          <button
                            type="button"
                            disabled={savingLeadId === lead.id}
                            onClick={() =>
                              setCallPermission(lead, "not_confirmed")
                            }
                            className="rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-black hover:bg-amber-600 disabled:opacity-50"
                          >
                            Pause Calls
                          </button>
                        )}

                      {!lead.do_not_contact && (
                        <button
                          type="button"
                          disabled={savingLeadId === lead.id}
                          onClick={() => markDoNotContact(lead)}
                          className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          DNC
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredLeads.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 text-center text-[#725f4d] dark:text-gray-400"
                  >
                    No leads found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && (
        <CreateLeadModal
          form={form}
          setForm={setForm}
          agents={agents}
          saving={saving}
          onSubmit={createLead}
          onClose={() => {
            setForm(emptyForm);
            setShowCreate(false);
          }}
        />
      )}

      {selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          assignedAgent={agentName(selectedLead.assigned_agent_id)}
          activities={selectedActivities}
          formatUSD={formatUSD}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </AppShell>
  );
}

function CreateLeadModal({
  form,
  setForm,
  agents,
  saving,
  onSubmit,
  onClose,
}: {
  form: LeadForm;
  setForm: React.Dispatch<React.SetStateAction<LeadForm>>;
  agents: ApprovedAgent[];
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-2 text-sm font-black text-white dark:bg-white dark:text-black"
        >
          ✕
        </button>

        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
          New Lead
        </p>
        <h2 className="mt-3 text-3xl font-black">Create and Assign</h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field
            label="Customer Name"
            value={form.customer_name}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, customer_name: value }))
            }
            maxLength={100}
            required
          />
          <Field
            label="Phone Number"
            value={form.phone}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, phone: value }))
            }
            maxLength={30}
            required
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
            label="Product Interest"
            value={form.product_interest}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, product_interest: value }))
            }
            maxLength={200}
          />

          <SelectField
            label="Source"
            value={form.source}
            onChange={(value) =>
              setForm((previous) => ({ ...previous, source: value }))
            }
            options={[
              { value: "admin_entry", label: "Admin Entry" },
              { value: "website_inquiry", label: "Website Inquiry" },
              { value: "existing_customer", label: "Existing Customer" },
              { value: "referral", label: "Referral" },
              { value: "other", label: "Other" },
            ]}
          />

          <SelectField
            label="Assign Agent"
            value={form.assigned_agent_id}
            onChange={(value) =>
              setForm((previous) => ({
                ...previous,
                assigned_agent_id: value,
                call_permission_status: value
                  ? previous.call_permission_status
                  : "not_confirmed",
              }))
            }
            options={[
              { value: "", label: "Unassigned" },
              ...agents.map((agent) => ({
                value: agent.user_id,
                label: agent.display_name || "Unnamed Agent",
              })),
            ]}
          />

          <div className="sm:col-span-2">
            <SelectField
              label="Calling Permission"
              value={form.call_permission_status}
              onChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  call_permission_status: value,
                }))
              }
              options={[
                { value: "not_confirmed", label: "Not Confirmed - Do Not Call Yet" },
                { value: "approved_to_call", label: "Approved to Call via HelloAirDial" },
              ]}
            />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          Only authorize outbound calling when it is appropriate to contact the
          customer. Agents cannot log calls until permission is approved.
        </div>

        <button
          disabled={saving}
          className="mt-6 w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {saving ? "Creating..." : "Create Lead"}
        </button>
      </form>
    </div>
  );
}

function LeadDetailsModal({
  lead,
  assignedAgent,
  activities,
  formatUSD,
  onClose,
}: {
  lead: Lead;
  assignedAgent: string;
  activities: Activity[];
  formatUSD: (value: number | null | undefined) => string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-2 text-sm font-black text-white dark:bg-white dark:text-black"
        >
          ✕
        </button>

        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
          Lead Details
        </p>
        <h2 className="mt-3 text-3xl font-black">{lead.customer_name}</h2>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl bg-[#f8efe4] p-5 dark:bg-white/[0.05]">
            <h3 className="text-xl font-black">Profile</h3>
            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Phone" value={lead.phone} />
              <InfoRow label="Email" value={lead.email || "Not provided"} />
              <InfoRow label="Product Interest" value={lead.product_interest || "Not specified"} />
              <InfoRow label="Assigned Agent" value={assignedAgent} />
              <InfoRow label="Status" value={titleCase(lead.status)} />
              <InfoRow label="Permission" value={titleCase(lead.call_permission_status)} />
              {lead.do_not_contact_reason && (
                <InfoRow label="DNC Reason" value={lead.do_not_contact_reason} />
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[#ded0bf] p-5 dark:border-white/10">
            <h3 className="text-xl font-black">HelloAirDial History</h3>
            <div className="mt-4 space-y-3">
              {activities.length === 0 ? (
                <p className="text-sm text-[#725f4d] dark:text-gray-400">
                  No activity recorded.
                </p>
              ) : (
                activities.slice(0, 12).map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-2xl bg-[#f8efe4] p-4 text-sm dark:bg-white/[0.05]"
                  >
                    <div className="flex justify-between gap-3">
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
                    {(activity.call_duration_seconds !== null ||
                      activity.actual_call_cost !== null) && (
                      <p className="mt-2 text-xs text-[#725f4d] dark:text-gray-400">
                        {activity.call_duration_seconds !== null
                          ? `${activity.call_duration_seconds}s`
                          : ""}
                        {activity.call_duration_seconds !== null &&
                        activity.actual_call_cost !== null
                          ? " · "
                          : ""}
                        {activity.actual_call_cost !== null
                          ? formatUSD(activity.actual_call_cost)
                          : ""}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
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
  value: number | string;
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
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#725f4d] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}

function PermissionBadge({ value }: { value: string }) {
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
      <p className={`text-xs font-black uppercase tracking-[0.3em] ${danger ? "text-red-600" : "text-violet-600"}`}>
        {danger ? "Access Denied" : "Login Required"}
      </p>
      <h1 className="mt-4 text-4xl font-black">{title}</h1>
      <p className="mt-4 text-[#725f4d] dark:text-gray-400">{body}</p>
      <Link
        href={href}
        className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-white dark:bg-white dark:text-black"
      >
        {button}
      </Link>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
        {label}
      </label>
      <input
        required={required}
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm outline-none focus:border-violet-600 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm outline-none focus:border-violet-600 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
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