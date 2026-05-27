"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Order, OrderItem, Product, Profile, ToastItem } from "@/lib/types";
import { getOrderItemProduct } from "@/lib/utils";

type DashboardOrder = Order & {
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
};

const orderStatuses = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
];

const formatUSD = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export default function AdminDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const fetchAdminData = async () => {
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
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
      addToast("Unable to load account role", "error");
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(profileData as Profile);

    if (profileData.role !== "admin") {
      setLoading(false);
      return;
    }

    const [ordersResult, orderItemsResult, productsResult] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, user_id, status, total_amount, subtotal, discount_amount, payment_method, full_name, phone, address, city, province, postal_code, created_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("order_items")
        .select(
          "id, order_id, product_id, size, quantity, price, created_at, products(name, category, price)"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (ordersResult.error) {
      addToast("Failed to load orders", "error");
      console.error(ordersResult.error);
    } else {
      setOrders((ordersResult.data || []) as DashboardOrder[]);
    }

    if (orderItemsResult.error) {
      addToast("Failed to load order items", "error");
      console.error(orderItemsResult.error);
    } else {
      setOrderItems((orderItemsResult.data || []) as OrderItem[]);
    }

    if (productsResult.error) {
      addToast("Failed to load products", "error");
      console.error(productsResult.error);
    } else {
      setProducts((productsResult.data || []) as Product[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const getOrderAmount = (order: DashboardOrder) => {
    const total = Number(order.total_amount ?? 0);
    const subtotal = Number(order.subtotal ?? 0);

    return total > 0 ? total : subtotal > 0 ? subtotal : 0;
  };

  const stats = useMemo(() => {
    const totalRevenue = orders.reduce(
      (sum, order) => sum + getOrderAmount(order),
      0
    );

    const deliveredRevenue = orders
      .filter((order) => order.status === "delivered")
      .reduce((sum, order) => sum + getOrderAmount(order), 0);

    const pendingOrders = orders.filter(
      (order) => order.status === "pending"
    ).length;

    const activeProducts = products.filter(
      (product) => product.is_active !== false
    ).length;

    const lowStockProducts = products.filter(
      (product) => Number(product.stock || 0) <= 5
    ).length;

    const averageOrderValue =
      orders.length > 0 ? totalRevenue / orders.length : 0;

    return {
      totalRevenue,
      deliveredRevenue,
      pendingOrders,
      activeProducts,
      lowStockProducts,
      averageOrderValue,
      totalOrders: orders.length,
      totalProducts: products.length,
    };
  }, [orders, products]);

  const hourlySales = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: new Date(2026, 0, 1, hour).toLocaleTimeString("en-US", {
        hour: "numeric",
        hour12: true,
      }),
      orders: 0,
      sales: 0,
    }));

    orders.forEach((order) => {
      const date = new Date(order.created_at);

      if (Number.isNaN(date.getTime())) return;

      const hour = date.getHours();
      hours[hour].orders += 1;
      hours[hour].sales += getOrderAmount(order);
    });

    return hours;
  }, [orders]);

  const hasHourlyRevenue = hourlySales.some((item) => item.sales > 0);
  const getHourlyMetric = (item: { sales: number; orders: number }) =>
    hasHourlyRevenue ? item.sales : item.orders;

  const maxHourlyMetric = Math.max(
    ...hourlySales.map((item) => getHourlyMetric(item)),
    1
  );

  const peakHour = hourlySales.reduce((best, current) => {
    return getHourlyMetric(current) > getHourlyMetric(best) ? current : best;
  }, hourlySales[0]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};

    orderStatuses.forEach((status) => {
      counts[status] = 0;
    });

    orders.forEach((order) => {
      const status = order.status || "pending";
      counts[status] = (counts[status] || 0) + 1;
    });

    return Object.entries(counts).map(([status, count]) => ({
      label: status,
      value: count,
    }));
  }, [orders]);

  const paymentBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};

    orders.forEach((order) => {
      const method = order.payment_method || "COD";
      counts[method] = (counts[method] || 0) + 1;
    });

    return Object.entries(counts).map(([method, count]) => ({
      label: method,
      value: count,
    }));
  }, [orders]);

  const topProducts = useMemo(() => {
    const productMap: Record<
      string,
      {
        name: string;
        category: string;
        quantity: number;
        revenue: number;
      }
    > = {};

    orderItems.forEach((item) => {
      const product = getOrderItemProduct(item);
      const key = item.product_id || item.id;

      if (!productMap[key]) {
        productMap[key] = {
          name: product?.name || "Unknown Product",
          category: product?.category || "Merch",
          quantity: 0,
          revenue: 0,
        };
      }

      productMap[key].quantity += Number(item.quantity || 0);
      productMap[key].revenue +=
        Number(item.quantity || 0) * Number(item.price || 0);
    });

    return Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [orderItems]);

  const lowStockProducts = products
    .filter((product) => Number(product.stock || 0) <= 5)
    .slice(0, 6);

  if (loading) {
    return (
      <AppShell title="Admin Dashboard" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Admin Dashboard" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
            Login required
          </p>
          <h1 className="mt-4 text-4xl font-black">Admin Login</h1>
          <p className="mt-4 text-zinc-600 dark:text-gray-400">
            Please login with your admin account to access the dashboard.
          </p>

          <Link
            href="/login?redirect=/admin"
            className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white dark:bg-white dark:text-black"
          >
            Login as Admin
          </Link>
        </section>
      </AppShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <AppShell title="Admin Dashboard" toasts={toasts}>
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
            className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white dark:bg-white dark:text-black"
          >
            Back to Shop
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin Dashboard" toasts={toasts}>
      <section className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
              Admin Overview
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Sales Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-gray-400">
              Monitor revenue, peak sales hours, order status, payment methods,
              top products, and stock warnings.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchAdminData}
              className="rounded-full border border-black/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
            >
              Refresh
            </button>

            <Link
              href="/admin/products"
              className="rounded-full bg-zinc-950 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black dark:hover:bg-violet-400"
            >
              Manage Products
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={formatUSD(stats.totalRevenue)}
          helper="All recorded orders"
        />
        <StatCard
          label="Delivered Revenue"
          value={formatUSD(stats.deliveredRevenue)}
          helper="Orders marked delivered"
        />
        <StatCard
          label="Total Orders"
          value={stats.totalOrders.toString()}
          helper={`${stats.pendingOrders} pending`}
        />
        <StatCard
          label="Average Order"
          value={formatUSD(stats.averageOrderValue)}
          helper={`${stats.activeProducts} active products`}
        />
      </section>

      <section className="mt-6 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="min-w-0 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-2xl font-black">Peak Sale Hours</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                {stats.totalOrders === 0 ? (
                  "No recorded orders yet."
                ) : (
                  <>
                    Peak hour:{" "}
                    <b>
                      {peakHour.label} ·{" "}
                      {hasHourlyRevenue
                        ? `${formatUSD(peakHour.sales)} from ${peakHour.orders} order(s)`
                        : `${peakHour.orders} order(s)`}
                    </b>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="mt-8 overflow-x-auto rounded-3xl bg-black/[0.03] p-4 dark:bg-white/[0.05]">
            <div className="flex min-w-[920px] gap-2">
              {hourlySales.map((item) => {
                const metric = getHourlyMetric(item);
                const height =
                  metric > 0 ? Math.max((metric / maxHourlyMetric) * 100, 10) : 0;

                return (
                  <div
                    key={item.hour}
                    className="flex min-w-9 flex-1 flex-col items-center gap-2"
                  >
                    <div className="flex h-56 w-full items-end">
                      <div
                        title={`${item.label}: ${formatUSD(item.sales)} from ${
                          item.orders
                        } order(s)`}
                        className={`w-full rounded-t-xl transition ${
                          metric > 0
                            ? "bg-[#58948f] hover:bg-[#093459]"
                            : "bg-black/[0.04] dark:bg-white/[0.06]"
                        }`}
                        style={{ height: `${metric > 0 ? height : 1}%` }}
                      />
                    </div>
                    <div className="whitespace-nowrap text-[10px] font-bold text-zinc-500 dark:text-gray-400">
                      {item.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-xs text-zinc-500 dark:text-gray-400">
            {hasHourlyRevenue
              ? "Bar height is based on USD sales amount per hour. Hover a bar to view sales and order count."
              : "Sales amount is unavailable or zero for these records, so bar height is based on order count. Hover a bar for details."}
          </p>
        </div>

        <div className="grid min-w-0 gap-6">
          <BreakdownCard
            title="Order Status"
            subtitle="Current fulfillment pipeline"
            items={statusBreakdown}
            max={stats.totalOrders || 1}
          />

          <BreakdownCard
            title="Payment Methods"
            subtitle="Customer payment choices"
            items={paymentBreakdown}
            max={stats.totalOrders || 1}
          />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">Top Products</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
            Based on order item revenue.
          </p>

          <div className="mt-5 space-y-3">
            {topProducts.length === 0 ? (
              <EmptyBlock text="No product sales yet." />
            ) : (
              topProducts.map((product, index) => (
                <div
                  key={`${product.name}-${index}`}
                  className="rounded-3xl bg-black/[0.03] p-5 dark:bg-white/[0.05]"
                >
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-black">
                        {index + 1}. {product.name}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                        {product.category} · {product.quantity} sold
                      </p>
                    </div>
                    <p className="font-black">{formatUSD(product.revenue)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">Inventory Alerts</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
            {stats.totalProducts} total products · {stats.lowStockProducts} low
            stock
          </p>

          <div className="mt-5 space-y-3">
            {lowStockProducts.length === 0 ? (
              <EmptyBlock text="No low stock products." />
            ) : (
              lowStockProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-3xl bg-black/[0.03] p-5 dark:bg-white/[0.05]"
                >
                  <div className="flex items-center gap-3">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-12 w-12 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white">
                        🛍️
                      </div>
                    )}

                    <div>
                      <p className="font-black">{product.name}</p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                        {product.category}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-black text-white">
                    {product.stock || 0} left
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black">{value}</p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-gray-400">{helper}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  subtitle,
  items,
  max,
}: {
  title: string;
  subtitle: string;
  items: { label: string; value: number }[];
  max: number;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="min-w-0 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h2 className="text-2xl font-black">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
            {subtitle}
          </p>
        </div>

        <div className="rounded-2xl bg-black/[0.03] px-4 py-3 text-right dark:bg-white/[0.05]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-gray-400">
            Total
          </p>
          <p className="text-xl font-black">{total}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {items.length === 0 ? (
          <EmptyBlock text="No data yet." />
        ) : (
          items.map((item) => {
            const width = Math.max((item.value / max) * 100, item.value === 0 ? 0 : 6);
            const percentage = max > 0 ? Math.round((item.value / max) * 100) : 0;

            return (
              <div
                key={item.label}
                className="rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="break-words font-black capitalize">
                      {item.label}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-gray-400">
                      {percentage}% of orders
                    </p>
                  </div>

                  <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black text-white">
                    {item.value}
                  </span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-violet-600"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <p className="rounded-3xl bg-black/[0.03] p-5 text-sm text-zinc-500 dark:bg-white/[0.05] dark:text-gray-400">
      {text}
    </p>
  );
}