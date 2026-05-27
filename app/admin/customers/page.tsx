"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Order, Profile, ToastItem } from "@/lib/types";
import { formatOrderDate, formatPrice } from "@/lib/utils";

type CustomerSummary = Profile & {
  email?: string;
  order_count: number;
  total_spent: number;
  latest_order?: string | null;
};

export default function AdminCustomersPage() {
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userEmail, setUserEmail] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const fetchCustomersPage = async () => {
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

    const [profilesResult, ordersResult] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", {
        ascending: false,
      }),
      supabase
        .from("orders")
        .select(
          "id, user_id, status, total_amount, payment_method, full_name, phone, address, city, province, postal_code, created_at"
        )
        .order("created_at", { ascending: false }),
    ]);

    if (profilesResult.error) {
      addToast("Failed to load customers", "error");
      console.error(profilesResult.error);
    } else {
      setProfiles((profilesResult.data || []) as Profile[]);
    }

    if (ordersResult.error) {
      addToast("Failed to load customer orders", "error");
      console.error(ordersResult.error);
    } else {
      setOrders((ordersResult.data || []) as Order[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchCustomersPage();
  }, []);

  const customers = useMemo<CustomerSummary[]>(() => {
    return profiles.map((profile) => {
      const customerOrders = orders.filter((order) => order.user_id === profile.id);

      const totalSpent = customerOrders.reduce(
        (sum, order) => sum + Number(order.total_amount || 0),
        0
      );

      return {
        ...profile,
        order_count: customerOrders.length,
        total_spent: totalSpent,
        latest_order: customerOrders[0]?.created_at || null,
      };
    });
  }, [profiles, orders]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const q = search.toLowerCase();

      const matchesSearch =
        !q ||
        (customer.full_name || "").toLowerCase().includes(q) ||
        (customer.phone || "").toLowerCase().includes(q) ||
        (customer.city || "").toLowerCase().includes(q) ||
        (customer.province || "").toLowerCase().includes(q) ||
        customer.id.toLowerCase().includes(q);

      const matchesRole =
        roleFilter === "all" || (customer.role || "customer") === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [customers, search, roleFilter]);

  const stats = useMemo(() => {
    const totalSpent = customers.reduce(
      (sum, customer) => sum + customer.total_spent,
      0
    );

    const admins = customers.filter((customer) => customer.role === "admin").length;
    const customersOnly = customers.filter(
      (customer) => customer.role !== "admin"
    ).length;

    return {
      total: customers.length,
      admins,
      customersOnly,
      totalSpent,
    };
  }, [customers]);

  const customerOrders = selectedCustomer
    ? orders.filter((order) => order.user_id === selectedCustomer.id)
    : [];

  if (loading) {
    return (
      <AppShell title="Admin Customers" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: '#58948f', borderTopColor: 'transparent' }} />
        </div>
      </AppShell>
    );
  }

  if (!adminProfile) {
    return (
      <AppShell title="Admin Customers" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: '#58948f' }}>
            Login required
          </p>
          <h1 className="mt-4 text-4xl font-black">Admin Login</h1>
          <p className="mt-4 text-zinc-600 dark:text-gray-400">
            Please login with your admin account to view customer data.
          </p>

          <Link
            href="/login?redirect=/admin/customers"
            className="mt-6 inline-block rounded-full px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white"
            style={{ backgroundColor: '#093459' }}
          >
            Login as Admin
          </Link>
        </section>
      </AppShell>
    );
  }

  if (adminProfile.role !== "admin") {
    return (
      <AppShell title="Admin Customers" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-red-600">
            Access Denied
          </p>
          <h1 className="mt-4 text-4xl font-black">Admin Only</h1>
          <p className="mt-4 text-zinc-600 dark:text-gray-400">
            This page is only for accounts with <b>role = admin</b>.
          </p>

          <div className="mt-6 rounded-2xl bg-black/[0.03] p-4 text-left text-sm dark:bg-white/[0.05]">
            <p>
              <b>Email:</b> {userEmail || "Not logged in"}
            </p>
            <p>
              <b>Detected role:</b> {adminProfile.role || "No role"}
            </p>
          </div>

          <Link
            href="/"
            className="mt-6 inline-block rounded-full px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white"
            style={{ backgroundColor: '#093459' }}
          >
            Back to Shop
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Admin Customers"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search customers, phone, city, province, or ID..."
      toasts={toasts}
    >
      <section className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: '#58948f' }}>
              Customer Management
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Customers
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-gray-400">
              View customer profiles, saved delivery details, order activity,
              and total spending.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
           <button
           onClick={fetchCustomersPage}
             className="rounded-full border border-black/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-colors duration-200 dark:border-white/10"
            style={{ color: 'inherit' }}
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
           href="/admin/orders"
           className="rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition-colors duration-200"
           style={{ backgroundColor: '#58948f' }}
           onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#093459'}
           onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#58948f'}
           >
           View Orders
          </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <StatCard label="Total Profiles" value={stats.total.toString()} />
        <StatCard label="Customers" value={stats.customersOnly.toString()} />
        <StatCard label="Admins" value={stats.admins.toString()} />
        <StatCard label="Total Spent" value={formatPrice(stats.totalSpent)} />
      </section>

      <section className="mt-6 rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
              Role Filter
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white md:max-w-xs"
            >
              <option className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white" value="all">
                All Roles
              </option>
              <option className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white" value="customer">
                Customers
              </option>
              <option className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white" value="admin">
                Admins
              </option>
            </select>
          </div>
           <button
              onClick={() => {
               setSearch("");
                setRoleFilter("all");
           }}
             className="rounded-2xl border border-black/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-colors duration-200 dark:border-white/10"
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
            Reset
         </button>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div>
          <h2 className="text-2xl font-black">Customer List</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
            Showing {filteredCustomers.length} of {customers.length} profiles.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-[0.2em] text-zinc-500 dark:border-white/10 dark:text-gray-400">
                <th className="py-4">Customer</th>
                <th className="py-4">Contact</th>
                <th className="py-4">Location</th>
                <th className="py-4">Role</th>
                <th className="py-4">Orders</th>
                <th className="py-4">Total Spent</th>
                <th className="py-4">Latest Order</th>
                <th className="py-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-black/5 dark:border-white/5"
                >
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      {customer.profile_photo_url ? (
                        <img
                          src={customer.profile_photo_url}
                          alt={customer.full_name || "Customer"}
                          className="h-12 w-12 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl font-black text-white" style={{ backgroundColor: '#58948f' }}>
                          {customer.full_name?.[0]?.toUpperCase() || "U"}
                        </div>
                      )}

                      <div>
                        <p className="font-black">
                          {customer.full_name || "No name"}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-gray-400">
                          {customer.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 text-zinc-600 dark:text-gray-400">
                    {customer.phone || "N/A"}
                  </td>
                  <td className="py-4 text-zinc-600 dark:text-gray-400">
                    {[customer.city, customer.province]
                      .filter(Boolean)
                      .join(", ") || "N/A"}
                  </td>
                  <td className="py-4">
                    <span
                      className="rounded-full px-3 py-1 text-xs font-black uppercase text-white"
                      style={{ backgroundColor: customer.role === "admin" ? '#58948f' : '#093459' }}
                    >
                      {customer.role || "customer"}
                    </span>
                  </td>
                  <td className="py-4 font-bold">{customer.order_count}</td>
                  <td className="py-4 font-black">
                    {formatPrice(customer.total_spent)}
                  </td>
                  <td className="py-4 text-zinc-600 dark:text-gray-400">
                    {customer.latest_order
                      ? formatOrderDate(customer.latest_order)
                      : "None"}
                  </td>
                  <td className="py-4">
                    <button
                 onClick={() => setSelectedCustomer(customer)}
                 className="rounded-full border border-black/10 px-4 py-2 text-xs font-bold transition-colors duration-200 dark:border-white/10"
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
                  </td>
                </tr>
              ))}

              {filteredCustomers.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-zinc-500 dark:text-gray-400"
                  >
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedCustomer && (
        <CustomerDetailsModal
          customer={selectedCustomer}
          orders={customerOrders}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </AppShell>
  );
}

function CustomerDetailsModal({
  customer,
  orders,
  onClose,
}: {
  customer: CustomerSummary;
  orders: Order[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xl">
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:p-8">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full px-3 py-2 text-sm font-bold text-white"
          style={{ backgroundColor: '#093459' }}
        >
          ✕
        </button>

        <p className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: '#58948f' }}>
          Customer Details
        </p>

        <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-start">
          {customer.profile_photo_url ? (
            <img
              src={customer.profile_photo_url}
              alt={customer.full_name || "Customer"}
              className="h-28 w-28 rounded-[2rem] object-cover"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] text-4xl font-black text-white" style={{ backgroundColor: '#58948f' }}>
              {customer.full_name?.[0]?.toUpperCase() || "U"}
            </div>
          )}

          <div>
            <h2 className="text-3xl font-black">
              {customer.full_name || "No name"}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-gray-400">
              Profile ID: {customer.id}
            </p>
            <span
              className="mt-3 inline-block rounded-full px-4 py-2 text-xs font-black uppercase text-white"
              style={{ backgroundColor: customer.role === "admin" ? '#58948f' : '#093459' }}
            >
              {customer.role || "customer"}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <DetailStat label="Orders" value={customer.order_count.toString()} />
          <DetailStat label="Total Spent" value={formatPrice(customer.total_spent)} />
          <DetailStat label="Phone" value={customer.phone || "N/A"} />
          <DetailStat
            label="Latest Order"
            value={customer.latest_order ? formatOrderDate(customer.latest_order) : "None"}
          />
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[2rem] border border-black/10 bg-black/[0.03] p-5 dark:border-white/10 dark:bg-white/[0.05]">
            <h3 className="text-xl font-black">Saved Delivery Details</h3>

            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Full Name" value={customer.full_name || "N/A"} />
              <InfoRow label="Phone" value={customer.phone || "N/A"} />
              <InfoRow label="Address" value={customer.address || "N/A"} />
              <InfoRow label="City" value={customer.city || "N/A"} />
              <InfoRow label="Province" value={customer.province || "N/A"} />
              <InfoRow
                label="Postal Code"
                value={customer.postal_code || "N/A"}
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-black/[0.03] p-5 dark:border-white/10 dark:bg-white/[0.05]">
            <h3 className="text-xl font-black">Recent Orders</h3>

            <div className="mt-4 space-y-3">
              {orders.length === 0 ? (
                <p className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400">
                  No orders yet.
                </p>
              ) : (
                orders.slice(0, 5).map((order) => (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                      <div>
                        <p className="font-black">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </p>
                        <p className="text-xs text-zinc-600 dark:text-gray-400">
                          {formatOrderDate(order.created_at)} ·{" "}
                          {order.payment_method || "COD"} ·{" "}
                          {order.status || "pending"}
                        </p>
                      </div>

                      <p className="font-black">
                        {formatPrice(Number(order.total_amount || 0))}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-2xl border border-black/10 py-4 text-sm font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
        >
          Close Details
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-black/[0.03] p-5 dark:border-white/10 dark:bg-white/[0.05]">
      <p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-black">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}