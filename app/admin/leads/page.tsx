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

    const [agentsResult, customersResult, leadsResult, activitiesResult, ordersResult, metricResult] =
      await Promise.all([
        supabase.from("agent_profiles")
          .select("user_id, display_name, referral_code")
          .eq("status", "approved").order("display_name"),
        supabase.from("profiles")
          .select("id, full_name, phone")
          .eq("role", "customer").order("full_name"),
        supabase.from("sales_leads")
          .select("id, assigned_agent_id, customer_user_id, converted_order_id, converted_at, customer_name, phone, email, source, status, call_permission_status, do_not_contact, do_not_contact_reason, product_interest, next_follow_up_at, last_contacted_at, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("lead_activities")
          .select("id, lead_id, activity_type, outcome, notes, related_order_id, recorded_by_system, call_provider, call_duration_seconds, actual_call_cost, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("orders")
          .select("id, user_id, agent_id, agent_name, agent_referral_code, full_name, total_amount, status, created_at")
          .not("agent_id", "is", null)
          .order("created_at", { ascending: false }),
        supabase.rpc("get_admin_agent_lead_conversion_metrics"),
      ]);

    if (agentsResult.error || customersResult.error || leadsResult.error || activitiesResult.error || ordersResult.error || metricResult.error) {
      addToast("Some lead-management information could not be loaded.", "error");
      console.error({ agentsResult, customersResult, leadsResult, activitiesResult, ordersResult, metricResult });
    }

    setAgents((agentsResult.data || []) as ApprovedAgent[]);
    setCustomers((customersResult.data || []) as CustomerAccount[]);
    setLeads((leadsResult.data || []) as Lead[]);
    setActivities((activitiesResult.data || []) as Activity[]);
    setOrders((ordersResult.data || []) as AttributedOrder[]);
    setConversionMetrics((metricResult.data || []) as ConversionMetric[]);
    setLoading(false);
  };

  useEffect(() => { loadPage(); }, []);

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
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">HelloAirDial Operations</p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">Lead Conversion</h1>
            <p className="mt-3 max-w-3xl text-[#725f4d] dark:text-gray-400">
              Assign authorized calls, connect leads to verified customer accounts,
              and link referral-attributed orders into measurable conversions.
            </p>
          </div>
          <button type="button" onClick={() => setShowCreate(true)} className="rounded-full bg-zinc-950 px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-violet-700 dark:bg-white dark:text-black">
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
                  <td className="py-4 font-black text-violet-600">{Number(metric.contact_to_order_percent || 0).toFixed(1)}%</td>
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
                    <button type="button" onClick={() => setSelectedLead(lead)} className="rounded-full border border-[#cdbba7] px-4 py-2 text-xs font-bold hover:bg-zinc-950 hover:text-white dark:border-white/10">Details</button>
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
    <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-2 text-white dark:bg-white dark:text-black">✕</button>
    <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">New Lead</p><h2 className="mt-3 text-3xl font-black">Create and Assign</h2>
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
    <button disabled={saving} className="mt-6 w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase text-white dark:bg-white dark:text-black">{saving ? "Creating..." : "Create Lead"}</button>
  </form></div>;
}

function ConversionModal({ lead, agentLabel, customerLabel, customers, eligibleOrders, activities, saving, formatUSD, onAttachCustomer, onLinkOrder, onClose }: { lead: Lead; agentLabel: string; customerLabel: string; customers: CustomerAccount[]; eligibleOrders: AttributedOrder[]; activities: Activity[]; saving: boolean; formatUSD: (value: number | null | undefined) => string; onAttachCustomer: (id: string) => void; onLinkOrder: (id: string) => void; onClose: () => void; }) {
  return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"><div className="relative max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white p-7 dark:bg-zinc-950">
    <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-2 text-white dark:bg-white dark:text-black">✕</button>
    <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Conversion Details</p><h2 className="mt-3 text-3xl font-black">{lead.customer_name}</h2>
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
          {eligibleOrders.length === 0 ? <p className="rounded-2xl bg-[#f8efe4] p-4 text-sm dark:bg-white/[0.05]">No eligible referred orders found.</p> : eligibleOrders.slice(0,8).map((order) => <div key={order.id} className="flex justify-between gap-3 rounded-2xl bg-[#f8efe4] p-4 dark:bg-white/[0.05]"><div><p className="font-black">#{order.id.slice(0,8).toUpperCase()}</p><p className="text-xs text-[#725f4d] dark:text-gray-400">{order.full_name || "Customer"} · {order.status}</p></div><div className="text-right"><p className="font-black">{formatUSD(order.total_amount)}</p>{!lead.converted_order_id && <button type="button" disabled={saving} onClick={() => onLinkOrder(order.id)} className="mt-2 rounded-full bg-violet-600 px-3 py-2 text-xs font-black text-white">Link Order</button>}</div></div>)}
        </div>
      </div>
    </div>
    <section className="mt-6 rounded-3xl border border-[#ded0bf] p-5 dark:border-white/10"><h3 className="text-xl font-black">Activity History</h3><div className="mt-4 space-y-3">{activities.length === 0 ? <p className="text-sm text-[#725f4d]">No activity recorded.</p> : activities.slice(0,10).map((activity) => <div key={activity.id} className="rounded-2xl bg-[#f8efe4] p-4 text-sm dark:bg-white/[0.05]"><p className="font-black">{titleCase(activity.outcome || activity.activity_type)}</p><p className="mt-1 text-xs text-[#725f4d]">{new Date(activity.created_at).toLocaleString()}</p>{activity.notes && <p className="mt-2">{activity.notes}</p>}</div>)}</div></section>
  </div></div>;
}

function titleCase(value: string) { return value.replaceAll("_", " ").split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
function LoadingCard() { return <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]"><div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" /></div>; }
function StatCard({ label, value, highlight=false, danger=false }: { label:string; value:number|string; highlight?:boolean; danger?:boolean }) { return <div className={`rounded-[2rem] border p-5 ${danger ? "border-red-200 bg-red-50 dark:bg-red-400/10" : highlight ? "border-violet-200 bg-violet-50 dark:bg-violet-400/10" : "border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]"}`}><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#725f4d] dark:text-gray-400">{label}</p><p className="mt-3 text-2xl font-black">{value}</p></div>; }
function Badge({ value }: { value:string }) { const style = value === "converted" || value === "approved_to_call" ? "bg-green-600" : value === "do_not_contact" || value === "do_not_call" ? "bg-red-600" : value === "interested" || value === "follow_up" ? "bg-violet-600" : "bg-zinc-500"; return <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${style}`}>{titleCase(value)}</span>; }
function AccessCard({ title, body, href, button, danger=false }: { title:string; body:string; href:string; button:string; danger?:boolean }) { return <section className="mx-auto max-w-xl rounded-[2rem] border border-[#ded0bf] bg-white p-8 text-center dark:border-white/10 dark:bg-white/[0.04]"><p className={`text-xs font-black uppercase tracking-[0.3em] ${danger ? "text-red-600" : "text-violet-600"}`}>{danger ? "Access Denied" : "Login Required"}</p><h1 className="mt-4 text-4xl font-black">{title}</h1><p className="mt-4 text-[#725f4d] dark:text-gray-400">{body}</p><Link href={href} className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase text-white dark:bg-white dark:text-black">{button}</Link></section>; }
function Field({ label, value, onChange, type="text", required=false }: { label:string; value:string; onChange:(v:string)=>void; type?:string; required?:boolean }) { return <div><label className="mb-2 block text-xs font-black uppercase text-[#725f4d]">{label}</label><input required={required} type={type} value={value} onChange={(e) => onChange(e.target.value)} maxLength={254} className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 dark:bg-zinc-900 dark:text-white" /></div>; }
function Select({ label, value, onChange, options }: { label:string; value:string; onChange:(v:string)=>void; options:{value:string;label:string}[] }) { return <div><label className="mb-2 block text-xs font-black uppercase text-[#725f4d]">{label}</label><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 dark:bg-zinc-900 dark:text-white">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>; }
function Info({ label, value }: { label:string; value:string }) { return <div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#725f4d]">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }