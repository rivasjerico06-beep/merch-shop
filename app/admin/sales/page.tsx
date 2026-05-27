"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Profile, ToastItem } from "@/lib/types";

type RangeFilter = "7" | "30" | "90" | "all";

type RewardProgress = {
  user_id: string;
  full_name: string | null;
  total_delivered_spend: number | null;
  highest_goal: number | null;
  progress_percent: number | null;
  reward_status: string | null;
  next_reward_target: number | null;
};

type CustomerCoupon = {
  id: string;
  user_id: string;
  status: "available" | "used" | "expired" | "cancelled";
  expires_at: string;
};

type SalesProductRelation =
  | { name: string | null }
  | { name: string | null }[]
  | null;

type SalesOrderItem = {
  quantity: number | null;
  price: number | null;
  option_quantity: number | null;
  products: SalesProductRelation;
};

type SalesOrder = {
  id: string;
  user_id: string | null;
  status: string | null;
  total_amount: number | null;
  subtotal: number | null;
  discount_amount: number | null;
  payment_method: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_referral_code: string | null;
  created_at: string;
  order_items: SalesOrderItem[] | null;
};

type TrendRow = { label: string; revenue: number; orders: number };
type NamedValue = { name: string; value: number };
type AgentRow = { name: string; revenue: number; orders: number };
type ProductRow = { name: string; revenue: number; units: number };

// Swapped the first two colors to make #58948f primary
const chartColors = ["#58948f", "#093459", "#f59e0b", "#3b82f6", "#ec4899", "#18181b"];

export default function AdminSalesPage() {
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [rewardProgress, setRewardProgress] = useState<RewardProgress[]>([]);
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [range, setRange] = useState<RangeFilter>("30");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const formatUSD = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));

  const loadSales = async () => {
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

    const [ordersResult, progressResult, couponsResult] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, user_id, status, total_amount, subtotal, discount_amount, payment_method, agent_id, agent_name, agent_referral_code, created_at, order_items(quantity, price, option_quantity, products(name))"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("customer_reward_progress")
        .select("*")
        .order("progress_percent", { ascending: false }),
      supabase
        .from("customer_coupons")
        .select("id, user_id, status, expires_at")
        .order("expires_at", { ascending: true }),
    ]);

    if (ordersResult.error) {
      addToast("Unable to load sales orders", "error");
      console.error("Sales orders load error:", ordersResult.error);
    } else {
      setOrders((ordersResult.data || []) as unknown as SalesOrder[]);
    }

    if (progressResult.error) {
      addToast("Unable to load reward progress", "error");
      console.error("Reward progress load error:", progressResult.error);
    } else {
      setRewardProgress((progressResult.data || []) as RewardProgress[]);
    }

    if (couponsResult.error) {
      addToast("Unable to load coupons", "error");
      console.error("Coupons load error:", couponsResult.error);
    } else {
      setCoupons((couponsResult.data || []) as CustomerCoupon[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadSales();
  }, []);

  const filteredOrders = useMemo(() => {
    if (range === "all") return orders;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (Number(range) - 1));

    return orders.filter((order) => new Date(order.created_at) >= start);
  }, [orders, range]);

  const deliveredOrders = useMemo(
    () => filteredOrders.filter((order) => order.status === "delivered"),
    [filteredOrders]
  );

  const completedRevenue = useMemo(
    () =>
      deliveredOrders.reduce(
        (total, order) => total + Number(order.total_amount || 0),
        0
      ),
    [deliveredOrders]
  );

  const grossBeforeDiscount = useMemo(
    () =>
      deliveredOrders.reduce(
        (total, order) =>
          total + Number(order.subtotal ?? order.total_amount ?? 0),
        0
      ),
    [deliveredOrders]
  );

  const discountsGranted = useMemo(
    () =>
      deliveredOrders.reduce(
        (total, order) => total + Number(order.discount_amount || 0),
        0
      ),
    [deliveredOrders]
  );

  const agentAttributedRevenue = useMemo(
    () =>
      deliveredOrders
        .filter((order) => order.agent_id)
        .reduce((total, order) => total + Number(order.total_amount || 0), 0),
    [deliveredOrders]
  );

  const averageOrderValue =
    deliveredOrders.length > 0 ? completedRevenue / deliveredOrders.length : 0;

  const agentRevenuePercent =
    completedRevenue > 0 ? (agentAttributedRevenue / completedRevenue) * 100 : 0;

  const dailyTrend = useMemo<TrendRow[]>(() => {
    const days = range === "7" ? 7 : range === "30" ? 30 : range === "90" ? 90 : 30;
    const includeAll = range === "all";
    const start = new Date();

    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const grouped = new Map<string, TrendRow>();

    if (!includeAll) {
      for (let index = 0; index < days; index += 1) {
        const day = new Date(start);
        day.setDate(start.getDate() + index);
        const key = day.toISOString().slice(0, 10);

        grouped.set(key, {
          label: day.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          revenue: 0,
          orders: 0,
        });
      }
    }

    deliveredOrders.forEach((order) => {
      const date = new Date(order.created_at);
      const key = date.toISOString().slice(0, 10);
      const current =
        grouped.get(key) || {
          label: date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          revenue: 0,
          orders: 0,
        };

      current.revenue += Number(order.total_amount || 0);
      current.orders += 1;
      grouped.set(key, current);
    });

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => ({
        ...value,
        revenue: Number(value.revenue.toFixed(2)),
      }));
  }, [deliveredOrders, range]);

  const statusData = useMemo<NamedValue[]>(() => {
    const grouped = new Map<string, number>();

    filteredOrders.forEach((order) => {
      const status = order.status || "unknown";
      grouped.set(status, (grouped.get(status) || 0) + 1);
    });

    return Array.from(grouped.entries()).map(([name, value]) => ({
      name: titleCase(name),
      value,
    }));
  }, [filteredOrders]);

  const paymentData = useMemo<NamedValue[]>(() => {
    const grouped = new Map<string, number>();

    deliveredOrders.forEach((order) => {
      const method = order.payment_method || "Unspecified";
      grouped.set(method, (grouped.get(method) || 0) + Number(order.total_amount || 0));
    });

    return Array.from(grouped.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((left, right) => right.value - left.value);
  }, [deliveredOrders]);

  const topAgents = useMemo<AgentRow[]>(() => {
    const grouped = new Map<string, AgentRow>();

    deliveredOrders
      .filter((order) => order.agent_id)
      .forEach((order) => {
        const key = order.agent_id as string;
        const current = grouped.get(key) || {
          name: order.agent_name || "Agent",
          revenue: 0,
          orders: 0,
        };

        current.revenue += Number(order.total_amount || 0);
        current.orders += 1;
        grouped.set(key, current);
      });

    return Array.from(grouped.values())
      .map((agent) => ({
        ...agent,
        revenue: Number(agent.revenue.toFixed(2)),
      }))
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 6);
  }, [deliveredOrders]);

  const topProducts = useMemo<ProductRow[]>(() => {
    const grouped = new Map<string, ProductRow>();

    deliveredOrders.forEach((order) => {
      (order.order_items || []).forEach((item) => {
        const relation = item.products;
        const product = Array.isArray(relation) ? relation[0] : relation;
        const name = product?.name || "Product";
        const units = Number(item.quantity || 0) * Number(item.option_quantity || 1);
        const revenue = Number(item.quantity || 0) * Number(item.price || 0);
        const current = grouped.get(name) || { name, units: 0, revenue: 0 };

        current.units += units;
        current.revenue += revenue;
        grouped.set(name, current);
      });
    });

    return Array.from(grouped.values())
      .map((product) => ({
        ...product,
        revenue: Number(product.revenue.toFixed(2)),
      }))
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 6);
  }, [deliveredOrders]);

  const vipCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rewardProgress
      .filter((row) => Number(row.progress_percent || 0) >= 100)
      .filter(
        (row) => !query || (row.full_name || "").toLowerCase().includes(query)
      )
      .slice(0, 10);
  }, [rewardProgress, search]);

  const availableCoupons = coupons.filter(
    (coupon) =>
      coupon.status === "available" &&
      new Date(coupon.expires_at).getTime() > Date.now()
  ).length;

  if (loading) {
    return (
      <AppShell title="Sales Analytics" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#58948f] border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!adminProfile) {
    return (
      <AppShell title="Sales Analytics" toasts={toasts}>
        <AccessCard
          label="Login required"
          title="Admin Login"
          body="Please log in with your admin account to view sales analytics."
          href="/login?redirect=/admin/sales"
          button="Login as Admin"
        />
      </AppShell>
    );
  }

  if (adminProfile.role !== "admin") {
    return (
      <AppShell title="Sales Analytics" toasts={toasts}>
        <AccessCard
          label="Access denied"
          title="Admin Only"
          body={`This dashboard is restricted to admin accounts. Current account: ${
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
      title="Sales Analytics"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search VIP customer..."
      toasts={toasts}
    >
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
              Admin Intelligence
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Sales Analytics
            </h1>
            <p className="mt-3 max-w-3xl text-[#725f4d] dark:text-gray-400">
              Delivered revenue, customer rewards, attributed agent sales, product
              performance, payment mix, and order workflow monitoring.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["7", "30", "90", "all"] as RangeFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                className={`rounded-full px-4 py-3 text-xs font-black uppercase tracking-[0.15em] transition ${
                  range === value
                    ? "bg-[#58948f] text-white"
                    : "border border-[#cdbba7] bg-white hover:bg-[#58948f] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white dark:hover:text-black"
                }`}
              >
                {value === "all" ? "All Time" : `${value} Days`}
              </button>
            ))}

            <button
              type="button"
              onClick={loadSales}
              className="rounded-full bg-zinc-950 px-5 py-3 text-xs font-black uppercase tracking-[0.15em] text-white transition hover:bg-[#58948f] dark:bg-white dark:text-black"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Delivered Revenue" value={formatUSD(completedRevenue)} highlight />
        <StatCard label="Delivered Orders" value={deliveredOrders.length.toString()} />
        <StatCard label="Average Order" value={formatUSD(averageOrderValue)} />
        <StatCard label="Discounts Granted" value={formatUSD(discountsGranted)} />
        <StatCard label="Agent Revenue" value={formatUSD(agentAttributedRevenue)} />
        <StatCard label="Available Coupons" value={availableCoupons.toString()} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
        <ChartCard
          title="Revenue Trend"
          subtitle="Delivered sales revenue for the selected period."
        >
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={dailyTrend} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7ded2" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tickFormatter={(value) => `$${value}`} tick={{ fontSize: 11 }} width={68} />
              <Tooltip formatter={(value) => formatUSD(Number(value))} />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#58948f"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Order Status"
          subtitle={`${filteredOrders.length} total order(s) in this period.`}
        >
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={290}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={100}
                  paddingAngle={3}
                >
                  {statusData.map((row, index) => (
                    <Cell key={row.name} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
          <LegendRows data={statusData} valueFormatter={(value) => `${value} order(s)`} />
        </ChartCard>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-3">
        <ChartCard title="Top Products" subtitle="Revenue from delivered orders.">
          {topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7ded2" />
                <XAxis type="number" tickFormatter={(value) => `$${value}`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatUSD(Number(value))} />
                <Bar dataKey="revenue" name="Revenue" fill="#58948f" radius={[0, 10, 10, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard
          title="Payment Methods"
          subtitle="Delivered revenue distribution."
        >
          {paymentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={215}>
              <PieChart>
                <Pie
                  data={paymentData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={82}
                >
                  {paymentData.map((row, index) => (
                    <Cell key={row.name} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatUSD(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart small />
          )}
          <LegendRows data={paymentData} valueFormatter={formatUSD} />
        </ChartCard>

        <ChartCard title="Agent-Attributed Sales" subtitle={`${agentRevenuePercent.toFixed(1)}% of delivered revenue.`}>
          {topAgents.length > 0 ? (
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={topAgents} margin={{ left: 0, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7ded2" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `$${value}`} tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(value) => formatUSD(Number(value))} />
                <Bar dataKey="revenue" name="Revenue" fill="#58948f" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">Revenue Summary</h2>
          <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
            Delivered-order financial view for the selected period.
          </p>

          <div className="mt-6 space-y-4">
            <DetailRow label="Gross before rewards" value={formatUSD(grossBeforeDiscount)} />
            <DetailRow label="Coupon discounts granted" value={`- ${formatUSD(discountsGranted)}`} />
            <DetailRow label="Net delivered revenue" value={formatUSD(completedRevenue)} strong />
            <DetailRow label="Agent-attributed revenue" value={formatUSD(agentAttributedRevenue)} />
            <DetailRow label="Direct revenue" value={formatUSD(completedRevenue - agentAttributedRevenue)} />
          </div>

          <div className="mt-6 rounded-3xl bg-[#f8efe4] p-5 text-sm dark:bg-white/[0.05]">
            <p className="font-black">Interpretation</p>
            <p className="mt-2 text-[#725f4d] dark:text-gray-400">
              Revenue metrics use delivered orders only, so pending or cancelled
              orders do not overstate completed sales performance.
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-2xl font-black">100% VIP Customers</h2>
              <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
                Customers who reached the highest reward milestone.
              </p>
            </div>
            <Link
              href="/admin/customers"
              className="text-xs font-black uppercase tracking-[0.15em] text-[#58948f]"
            >
              View Customers
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {vipCustomers.length === 0 ? (
              <p className="rounded-3xl bg-[#f8efe4] p-6 text-center text-sm text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400">
                No customers have reached the VIP milestone yet.
              </p>
            ) : (
              vipCustomers.map((customer) => (
                <div
                  key={customer.user_id}
                  className="flex flex-col justify-between gap-3 rounded-3xl border border-[#58948f]/30 bg-[#58948f]/5 p-4 dark:border-[#58948f]/20 dark:bg-[#58948f]/10 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="font-black">{customer.full_name || "Unnamed Customer"}</p>
                    <p className="text-xs font-black uppercase tracking-[0.15em] text-[#58948f]">
                      {customer.reward_status || "VIP Reward Reached"}
                    </p>
                  </div>
                  <p className="font-black">{formatUSD(Number(customer.total_delivered_spend || 0))}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
          ? "border-[#58948f]/30 bg-[#58948f]/5 dark:border-[#58948f]/20 dark:bg-[#58948f]/10"
          : "border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]"
      }`}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#725f4d] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-black">{value}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <h2 className="text-2xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-y border-[#ded0bf] py-4 dark:border-white/10" : ""}`}>
      <p className="text-sm text-[#725f4d] dark:text-gray-400">{label}</p>
      <p className={`${strong ? "text-lg" : "text-sm"} font-black`}>{value}</p>
    </div>
  );
}

function LegendRows({
  data,
  valueFormatter,
}: {
  data: NamedValue[];
  valueFormatter: (value: number) => string;
}) {
  return (
    <div className="mt-2 space-y-2">
      {data.slice(0, 6).map((row, index) => (
        <div key={row.name} className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: chartColors[index % chartColors.length] }}
            />
            <span className="font-bold">{row.name}</span>
          </div>
          <span className="text-[#725f4d] dark:text-gray-400">
            {valueFormatter(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-3xl bg-[#f8efe4] text-sm text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400 ${
        small ? "h-[215px]" : "h-[270px]"
      }`}
    >
      No delivered sales data yet.
    </div>
  );
}

function AccessCard({
  label,
  title,
  body,
  href,
  button,
  danger = false,
}: {
  label: string;
  title: string;
  body: string;
  href: string;
  button: string;
  danger?: boolean;
}) {
  return (
    <section className="mx-auto max-w-xl rounded-[2rem] border border-[#ded0bf] bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <p className={`text-xs font-black uppercase tracking-[0.3em] ${danger ? "text-red-600" : "text-[#58948f]"}`}>
        {label}
      </p>
      <h1 className="mt-4 text-4xl font-black">{title}</h1>
      <p className="mt-4 text-[#725f4d] dark:text-gray-400">{body}</p>
      <Link
        href={href}
        className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#093459] dark:bg-white dark:text-black"
      >
        {button}
      </Link>
    </section>
  );
}