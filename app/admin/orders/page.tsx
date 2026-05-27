"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Order, OrderItem, Profile, ToastItem } from "@/lib/types";
import { orderStatusSchema, getValidationMessage } from "@/lib/validation";
import {
  calculateOrderTotal,
  formatOrderDateTime,
  formatPrice,
  getOrderItemProduct,
  getStatusBadgeClass,
  getTrackingStepIndex,
  orderTrackingSteps,
} from "@/lib/utils";

const orderStatuses = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
];

export default function AdminOrdersPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const fetchOrdersPage = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProfile(null);
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
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(profileData as Profile);

    if (profileData.role !== "admin") {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, user_id, status, total_amount, payment_method, full_name, phone, address, city, province, postal_code, agent_id, agent_name, agent_referral_code, created_at, order_items(id, order_id, product_id, size, quantity, price, option_id, option_label, option_price_delta, option_quantity, created_at, products(name, category, price, currency))"
      )
      .order("created_at", { ascending: false });

    if (error) {
      addToast("Failed to load orders", "error");
      console.error(error);
    } else {
      setOrders((data || []) as Order[]);
    }

    loading && setLoading(false);
  };

  useEffect(() => {
    fetchOrdersPage();
  }, []);

  const updateOrderStatus = async (orderId: string, status: string) => {
    setSavingOrderId(orderId);

    let parsed;

    try {
      parsed = orderStatusSchema.parse({ status });
    } catch (error) {
      addToast(getValidationMessage(error), "error");
      setSavingOrderId(null);
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({ status: parsed.status })
      .eq("id", orderId);

    if (error) {
      addToast("Failed to update order status", "error");
      console.error(error);
    } else {
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId ? { ...order, status: parsed.status } : order
        )
      );

      setSelectedOrder((prev) =>
        prev && prev.id === orderId ? { ...prev, status: parsed.status } : prev
      );

      addToast("Order status updated", "success");
    }

    setSavingOrderId(null);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const q = search.toLowerCase();

      const matchesSearch =
        !q ||
        order.id.toLowerCase().includes(q) ||
        (order.full_name || "").toLowerCase().includes(q) ||
        (order.phone || "").toLowerCase().includes(q) ||
        (order.city || "").toLowerCase().includes(q) ||
        (order.province || "").toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const stats = useMemo(() => {
    const totalRevenue = filteredOrders.reduce(
      (sum, order) => sum + Number(order.total_amount || 0),
      0
    );

    return {
      total: filteredOrders.length,
      pending: filteredOrders.filter((order) => order.status === "pending")
        .length,
      delivered: filteredOrders.filter((order) => order.status === "delivered")
        .length,
      revenue: totalRevenue,
    };
  }, [filteredOrders]);

  if (loading) {
    return (
      <AppShell title="Admin Orders" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#58948f] border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Admin Orders" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
            Login required
          </p>
          <h1 className="mt-4 text-4xl font-black">Admin Login</h1>
          <p className="mt-4 text-zinc-600 dark:text-gray-400">
            Please login with your admin account to manage orders.
          </p>

          <Link
            href="/login?redirect=/admin/orders"
            className="mt-6 inline-block rounded-full bg-[#58948f] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#093459]"
          >
            Login as Admin
          </Link>
        </section>
      </AppShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <AppShell title="Admin Orders" toasts={toasts}>
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
              <b>Detected role:</b> {profile.role || "No role"}
            </p>
          </div>

          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-[#58948f] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#093459]"
          >
            Back to Shop
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Admin Orders"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search order ID, customer, phone, or location..."
      toasts={toasts}
    >
      <section className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
              Order Management
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Manage Orders
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-gray-400">
              View customer orders, inspect items, verify delivery details, and
              update fulfillment status.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchOrdersPage}
              className="rounded-full border border-black/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-[#58948f] hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
            >
              Refresh
            </button>

            <Link
              href="/admin/products"
              className="rounded-full bg-[#58948f] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#093459]"
            >
              Products
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <StatCard label="Orders" value={stats.total.toString()} />
        <StatCard label="Pending" value={stats.pending.toString()} />
        <StatCard label="Delivered" value={stats.delivered.toString()} />
        <StatCard label="Revenue" value={formatPrice(stats.revenue)} />
      </section>

      <section className="mt-6 rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-[#58948f] dark:border-white/10 dark:bg-zinc-900 dark:text-white md:max-w-xs"
            >
              <option className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white" value="all">
                All Statuses
              </option>
              {orderStatuses.map((status) => (
                <option
                  className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white"
                  key={status}
                  value={status}
                >
                  {status}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
            }}
            className="rounded-2xl border border-black/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-[#58948f] hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-black">Order List</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
              Showing {filteredOrders.length} of {orders.length} orders.
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1060px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-[0.2em] text-zinc-500 dark:border-white/10 dark:text-gray-400">
                <th className="py-4">Date</th>
                <th className="py-4">Order</th>
                <th className="py-4">Customer</th>
                <th className="py-4">Contact</th>
                <th className="py-4">Location</th>
                <th className="py-4">Payment</th>
                <th className="py-4">Assisted By</th>
                <th className="py-4">Total</th>
                <th className="py-4">Status</th>
                <th className="py-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-black/5 dark:border-white/5"
                >
                  <td className="py-4">
                    {formatOrderDateTime(order.created_at)}
                  </td>
                  <td className="py-4 font-black">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="py-4 font-bold">
                    {order.full_name || "Customer"}
                  </td>
                  <td className="py-4 text-zinc-600 dark:text-gray-400">
                    {order.phone || "N/A"}
                  </td>
                  <td className="py-4 text-zinc-600 dark:text-gray-400">
                    {[order.city, order.province].filter(Boolean).join(", ") ||
                      "N/A"}
                  </td>
                  <td className="py-4">{order.payment_method || "COD"}</td>
                  <td className="py-4">
                    {order.agent_referral_code ? (
                      <div>
                        <p className="font-bold">{order.agent_name || "Agent"}</p>
                        <p className="text-xs text-[#58948f]">{order.agent_referral_code}</p>
                      </div>
                    ) : (
                      <span className="text-zinc-400">Direct</span>
                    )}
                  </td>
                  <td className="py-4 font-black">
                    {formatPrice(Number(order.total_amount || 0))}
                  </td>
                  <td className="py-4">
                    <select
                      value={order.status || "pending"}
                      disabled={savingOrderId === order.id}
                      onChange={(e) =>
                        updateOrderStatus(order.id, e.target.value)
                      }
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-zinc-950 outline-none focus:border-[#58948f] dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    >
                      {orderStatuses.map((status) => (
                        <option
                          className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white"
                          key={status}
                          value={status}
                        >
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-4">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="rounded-full border border-black/10 px-4 py-2 text-xs font-bold transition hover:bg-[#58948f] hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}

              {filteredOrders.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="py-10 text-center text-zinc-500 dark:text-gray-400"
                  >
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          updateOrderStatus={updateOrderStatus}
          savingOrderId={savingOrderId}
        />
      )}
    </AppShell>
  );
}

function OrderDetailsModal({
  order,
  onClose,
  updateOrderStatus,
  savingOrderId,
}: {
  order: Order;
  onClose: () => void;
  updateOrderStatus: (orderId: string, status: string) => void;
  savingOrderId: string | null;
}) {
  const items = order.order_items || [];

  const formatItemPrice = (item: OrderItem, value: number) => {
    const product = getOrderItemProduct(item);
    const currency = product?.currency || "USD";

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(value || 0));
  };

  const computedTotal = calculateOrderTotal(items);
  const itemCount = items.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  );
  const trackingIndex = getTrackingStepIndex(order.status);
  const isCancelled = order.status === "cancelled";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xl">
      <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:p-8">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-2 text-sm font-bold text-white dark:bg-white dark:text-black hover:bg-[#093459] dark:hover:bg-[#093459]"
        >
          ✕
        </button>

        <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
          Order Details
        </p>

        <div className="mt-4 flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <h2 className="text-3xl font-black">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-gray-400">
              Created on {formatOrderDateTime(order.created_at)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 md:justify-end">
            <span
              className={`rounded-full px-4 py-2 text-xs font-black uppercase ${getStatusBadgeClass(
                order.status
              )}`}
            >
              {order.status || "pending"}
            </span>

            <select
              value={order.status || "pending"}
              disabled={savingOrderId === order.id}
              onChange={(e) => updateOrderStatus(order.id, e.target.value)}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-bold text-zinc-950 outline-none focus:border-[#58948f] dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            >
              {orderStatuses.map((status) => (
                <option
                  className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white"
                  key={status}
                  value={status}
                >
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <DetailStat
            label="Total"
            value={formatPrice(Number(order.total_amount || computedTotal || 0))}
          />
          <DetailStat label="Items" value={itemCount.toString()} />
          <DetailStat label="Payment" value={order.payment_method || "COD"} />
          <DetailStat label="Order ID" value={order.id} small />
        </div>

        {order.agent_referral_code && (
          <div className="mt-6 rounded-3xl border border-[#58948f]/20 bg-[#58948f]/5 p-5 dark:border-[#58948f]/20 dark:bg-[#58948f]/10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#58948f] dark:text-[#58948f]/90">
              Agent Attribution
            </p>
            <div className="mt-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <p className="text-lg font-black">
                  Assisted by {order.agent_name || "Agent"}
                </p>
                <p className="text-sm text-zinc-600 dark:text-gray-300">
                  Referral Code: {order.agent_referral_code}
                </p>
              </div>
              <span className="rounded-full bg-[#58948f] px-4 py-2 text-xs font-black uppercase text-white">
                Agent Guided Sale
              </span>
            </div>
          </div>
        )}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[2rem] border border-black/10 bg-black/[0.03] p-5 dark:border-white/10 dark:bg-white/[0.05]">
            <h3 className="text-xl font-black">Customer & Delivery</h3>

            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Customer" value={order.full_name || "Customer"} />
              <InfoRow label="Phone" value={order.phone || "N/A"} />
              <InfoRow
                label="Address"
                value={
                  [
                    order.address,
                    order.city,
                    order.province,
                    order.postal_code,
                  ]
                    .filter(Boolean)
                    .join(", ") || "N/A"
                }
              />
              {order.agent_referral_code && (
                <>
                  <InfoRow label="Assisted By" value={order.agent_name || "Agent"} />
                  <InfoRow label="Referral Code" value={order.agent_referral_code} />
                </>
              )}
            </div>

            <div className="mt-6">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-gray-400">
                Tracking
              </h4>

              {isCancelled ? (
                <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-sm font-bold text-red-500">
                    This order has been cancelled.
                  </p>
                </div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {orderTrackingSteps.map((step, index) => {
                    const isDone = index <= trackingIndex;

                    return (
                      <div
                        key={step}
                        className={`flex items-center gap-3 rounded-2xl border p-3 ${
                          isDone
                            ? "border-[#58948f] bg-[#58948f] text-white"
                            : "border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.03]"
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                            isDone
                              ? "bg-white text-[#58948f]"
                              : "bg-black/10 dark:bg-white/10"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span className="text-xs font-black uppercase tracking-[0.15em]">
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-black/[0.03] p-5 dark:border-white/10 dark:bg-white/[0.05]">
            <h3 className="text-xl font-black">Items Ordered</h3>

            <div className="mt-4 space-y-3">
              {items.length === 0 ? (
                <p className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400">
                  No order items found for this order.
                </p>
              ) : (
                items.map((item) => {
                  const product = getOrderItemProduct(item);

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                        <div>
                          <p className="font-black">
                            {product?.name || "Product"}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-gray-400">
                            {product?.category || "Merch"} ·{" "}
                            {item.option_label || `Size: ${item.size || "N/A"}`} · Cart Qty: {item.quantity || 1} · Bundle Units: {item.option_quantity || 1}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-gray-400">
                            Total units: {Number(item.quantity || 1) * Number(item.option_quantity || 1)}
                          </p>
                        </div>

                        <div className="text-left md:text-right">
                          <p className="text-xs text-zinc-600 dark:text-gray-400">
                            {formatItemPrice(item, Number(item.price || 0))} each
                          </p>
                          <p className="font-black">
                            {formatItemPrice(
                              item,
                              Number(item.price || 0) *
                                Number(item.quantity || 1)
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-2xl border border-black/10 py-4 text-sm font-black uppercase tracking-[0.2em] transition hover:bg-[#58948f] hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
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

function DetailStat({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-black/[0.03] p-5 dark:border-white/10 dark:bg-white/[0.05]">
      <p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className={
          small
            ? "mt-2 break-all text-xs font-bold"
            : "mt-2 text-xl font-black"
        }
      >
        {value}
      </p>
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