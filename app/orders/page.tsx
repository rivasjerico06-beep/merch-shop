"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Order, ToastItem } from "@/lib/types";
import {
  calculateOrderTotal,
  formatOrderDate,
  formatOrderDateTime,
  formatPrice,
  getOrderItemProduct,
  getStatusBadgeClass,
  getTrackingStepIndex,
  orderTrackingSteps,
} from "@/lib/utils";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now();

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const formatItemPrice = (item: NonNullable<Order["order_items"]>[number], value: number) => {
    const product = getOrderItemProduct(item);
    const currency = product?.currency || "USD";

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(value || 0));
  };

  const fetchOrders = async (currentUserId?: string) => {
    const id = currentUserId || userId;

    if (!id) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, user_id, status, total_amount, payment_method, full_name, phone, address, city, province, postal_code, agent_id, agent_name, agent_referral_code, created_at, order_items(id, order_id, product_id, size, quantity, price, option_id, option_label, option_price_delta, option_quantity, created_at, products(name, category, price, currency))"
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      addToast("Failed to load orders", "error");
      console.error(error);
    } else {
      setOrders((data || []) as Order[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    const loadPage = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id || "");
      await fetchOrders(user?.id || "");
    };

    loadPage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || "";
      setUserId(id);
      fetchOrders(id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const lifetimeValue = useMemo(() => {
    return orders.reduce(
      (total, order) => total + Number(order.total_amount || 0),
      0
    );
  }, [orders]);

  const pendingCount = orders.filter((order) => order.status === "pending").length;
  const deliveredCount = orders.filter(
    (order) => order.status === "delivered"
  ).length;

  return (
    <AppShell title="Orders" toasts={toasts}>
      <section className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
              Order Tracking
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              My Orders
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-gray-400">
              Track your orders, delivery progress, ordered items, payment
              method, and receipt details.
            </p>
          </div>

          <button
            onClick={() => fetchOrders()}
            className="rounded-full border border-black/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
          >
            Refresh
          </button>
        </div>
      </section>

      {!userId && (
        <section className="mt-6 rounded-[2rem] border border-red-500/30 bg-red-500/10 p-6">
          <h2 className="text-xl font-black text-red-600">Login required</h2>
          <p className="mt-2 text-sm text-red-500">
            Please login to view your orders. You will return to this page after logging in.
          </p>
          <Link
            href="/login?redirect=/orders"
            className="mt-4 inline-block rounded-full bg-red-600 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white"
          >
            Go to Login
          </Link>
        </section>
      )}

      {userId && (
        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard label="Total Orders" value={orders.length.toString()} />
          <StatCard label="Pending" value={pendingCount.toString()} />
          <StatCard label="Delivered" value={deliveredCount.toString()} />
        </section>
      )}

      {userId && (
        <section className="mt-6 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black">Order History</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                Lifetime order value: {formatPrice(lifetimeValue)}
              </p>
            </div>

            <Link
              href="/products"
              className="rounded-full bg-zinc-950 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black dark:hover:bg-violet-400"
            >
              Shop More
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {loading ? (
              <div className="flex h-64 items-center justify-center rounded-[2rem] border border-black/10 dark:border-white/10">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-[2rem] border border-black/10 p-10 text-center dark:border-white/10">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-violet-600 text-3xl text-white">
                  📦
                </div>
                <h3 className="text-2xl font-black">No orders yet</h3>
                <p className="mt-2 text-zinc-600 dark:text-gray-400">
                  Your completed checkouts will appear here.
                </p>
              </div>
            ) : (
              orders.map((order) => {
                const items = order.order_items || [];
                const activeStepIndex = getTrackingStepIndex(order.status);
                const isCancelled = order.status === "cancelled";
                const isExpanded = expandedOrderId === order.id;
                const computedTotal = calculateOrderTotal(items);
                const itemCount = items.reduce(
                  (total, item) => total + Number(item.quantity || 0),
                  0
                );

                return (
                  <div
                    key={order.id}
                    className="rounded-[2rem] border border-black/10 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-black">
                            Order #{order.id.slice(0, 8).toUpperCase()}
                          </h3>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getStatusBadgeClass(
                              order.status
                            )}`}
                          >
                            {order.status || "pending"}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-zinc-600 dark:text-gray-400">
                          Ordered on {formatOrderDate(order.created_at)} ·{" "}
                          {order.payment_method || "COD"} · {itemCount} item(s)
                        </p>

                        <p className="mt-1 text-xs text-zinc-500 dark:text-gray-400">
                          Receiver: {order.full_name || "No receiver name"} ·{" "}
                          {order.phone || "No phone"}
                        </p>

                        {order.agent_referral_code && (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200">
                            Assisted by {order.agent_name || "Agent"} · {order.agent_referral_code}
                          </div>
                        )}
                      </div>

                      <div className="text-left md:text-right">
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-gray-400">
                          Total
                        </p>
                        <p className="mt-1 text-xl font-black">
                          {formatPrice(
                            Number(order.total_amount || computedTotal || 0)
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5">
                      {isCancelled ? (
                        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                          <p className="text-sm font-bold text-red-500">
                            This order has been cancelled.
                          </p>
                        </div>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-5">
                          {orderTrackingSteps.map((step, index) => {
                            const isDone = index <= activeStepIndex;

                            return (
                              <div
                                key={step}
                                className={`rounded-2xl border p-3 ${
                                  isDone
                                    ? "border-violet-500 bg-violet-600 text-white"
                                    : "border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.03]"
                                }`}
                              >
                                <div
                                  className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                                    isDone
                                      ? "bg-white text-violet-700"
                                      : "bg-black/10 dark:bg-white/10"
                                  }`}
                                >
                                  {index + 1}
                                </div>
                                <p className="text-xs font-black uppercase">
                                  {step}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() =>
                        setExpandedOrderId(isExpanded ? null : order.id)
                      }
                      className="mt-5 rounded-full border border-black/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
                    >
                      {isExpanded ? "Hide Details" : "View Details"}
                    </button>

                    {isExpanded && (
                      <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                        <div className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
                          <h4 className="text-lg font-black">
                            Delivery Details
                          </h4>

                          <div className="mt-4 space-y-3 text-sm">
                            <InfoRow
                              label="Customer"
                              value={order.full_name || "Customer"}
                            />
                            <InfoRow
                              label="Phone"
                              value={order.phone || "N/A"}
                            />
                            <InfoRow
                              label="Address"
                              value={[
                                order.address,
                                order.city,
                                order.province,
                                order.postal_code,
                              ]
                                .filter(Boolean)
                                .join(", ") || "N/A"}
                            />
                            <InfoRow
                              label="Payment"
                              value={order.payment_method || "COD"}
                            />
                            {order.agent_referral_code && (
                              <>
                                <InfoRow
                                  label="Assisted By"
                                  value={order.agent_name || "Agent"}
                                />
                                <InfoRow
                                  label="Referral Code"
                                  value={order.agent_referral_code}
                                />
                              </>
                            )}
                            <InfoRow
                              label="Date"
                              value={formatOrderDateTime(order.created_at)}
                            />
                          </div>
                        </div>

                        <div className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
                          <h4 className="text-lg font-black">Items Ordered</h4>

                          <div className="mt-4 space-y-3">
                            {items.length === 0 ? (
                              <p className="text-sm text-zinc-500 dark:text-gray-400">
                                No items found.
                              </p>
                            ) : (
                              items.map((item) => {
                                const product = getOrderItemProduct(item);

                                return (
                                  <div
                                    key={item.id}
                                    className="flex flex-col justify-between gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10 md:flex-row md:items-center"
                                  >
                                    <div>
                                      <p className="font-black">
                                        {product?.name || "Product"}
                                      </p>
                                      <p className="text-xs text-zinc-600 dark:text-gray-400">
                                        {product?.category || "Merch"} ·{" "}
                                        {item.option_label || `Size: ${item.size || "N/A"}`} · Cart Qty:{" "}
                                        {item.quantity || 1} · Bundle Units: {item.option_quantity || 1}
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
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </AppShell>
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