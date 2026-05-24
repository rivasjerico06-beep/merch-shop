"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Profile, ToastItem } from "@/lib/types";

type RewardProgress = {
  user_id: string;
  full_name: string | null;
  total_delivered_spend: number;
  highest_goal: number | null;
  progress_percent: number;
  reward_status: string;
  next_reward_target: number | null;
};

type RewardTier = {
  code: string;
  name: string;
  minimum_spend: number;
  discount_percent: number;
  max_discount: number;
  minimum_order_amount: number;
  validity_days: number;
  sort_order: number;
};

type CustomerCoupon = {
  id: string;
  user_id: string;
  tier_code: string;
  status: "available" | "used" | "expired" | "cancelled";
  discount_percent: number;
  expires_at: string;
};

type CustomerRewardRow = RewardProgress & {
  total_coupons: number;
  available_coupons: number;
};

export default function AdminSalesRewardsPage() {
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [progressRows, setProgressRows] = useState<RewardProgress[]>([]);
  const [tiers, setTiers] = useState<RewardTier[]>([]);
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [search, setSearch] = useState("");
  const [progressFilter, setProgressFilter] = useState<
    "all" | "vip" | "qualified" | "building"
  >("all");
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const formatUSD = (value: number | null | undefined) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));

  const loadSalesRewards = async () => {
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

    const [progressResult, tiersResult, couponsResult] = await Promise.all([
      supabase
        .from("customer_reward_progress")
        .select("*")
        .order("progress_percent", { ascending: false })
        .order("total_delivered_spend", { ascending: false }),
      supabase
        .from("reward_tiers")
        .select(
          "code, name, minimum_spend, discount_percent, max_discount, minimum_order_amount, validity_days, sort_order"
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("customer_coupons")
        .select("id, user_id, tier_code, status, discount_percent, expires_at")
        .order("issued_at", { ascending: false }),
    ]);

    if (progressResult.error) {
      addToast("Unable to load customer reward progress", "error");
      console.error(progressResult.error);
    } else {
      setProgressRows((progressResult.data || []) as RewardProgress[]);
    }

    if (tiersResult.error) {
      addToast("Unable to load reward tiers", "error");
      console.error(tiersResult.error);
    } else {
      setTiers((tiersResult.data || []) as RewardTier[]);
    }

    if (couponsResult.error) {
      addToast("Unable to load customer coupons", "error");
      console.error(couponsResult.error);
    } else {
      setCoupons((couponsResult.data || []) as CustomerCoupon[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadSalesRewards();
  }, []);

  const highestGoal = Number(tiers[tiers.length - 1]?.minimum_spend || 2000);
  const firstRewardGoal = Number(tiers[0]?.minimum_spend || 1000);

  const rewardRows = useMemo<CustomerRewardRow[]>(() => {
    return progressRows.map((row) => {
      const customerCoupons = coupons.filter(
        (coupon) => coupon.user_id === row.user_id
      );

      const availableCoupons = customerCoupons.filter(
        (coupon) =>
          coupon.status === "available" &&
          new Date(coupon.expires_at).getTime() > Date.now()
      ).length;

      return {
        ...row,
        total_coupons: customerCoupons.length,
        available_coupons: availableCoupons,
      };
    });
  }, [progressRows, coupons]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rewardRows.filter((customer) => {
      const matchesSearch =
        !query ||
        (customer.full_name || "").toLowerCase().includes(query) ||
        customer.reward_status.toLowerCase().includes(query);

      const spending = Number(customer.total_delivered_spend || 0);
      const progress = Number(customer.progress_percent || 0);

      const matchesFilter =
        progressFilter === "all" ||
        (progressFilter === "vip" && progress >= 100) ||
        (progressFilter === "qualified" &&
          spending >= firstRewardGoal &&
          progress < 100) ||
        (progressFilter === "building" && spending < firstRewardGoal);

      return matchesSearch && matchesFilter;
    });
  }, [rewardRows, search, progressFilter, firstRewardGoal]);

  const summary = useMemo(() => {
    const deliveredRevenue = rewardRows.reduce(
      (total, customer) =>
        total + Number(customer.total_delivered_spend || 0),
      0
    );

    const vipCustomers = rewardRows.filter(
      (customer) => Number(customer.progress_percent || 0) >= 100
    ).length;

    const qualifiedCustomers = rewardRows.filter(
      (customer) =>
        Number(customer.total_delivered_spend || 0) >= firstRewardGoal
    ).length;

    const availableCoupons = coupons.filter(
      (coupon) =>
        coupon.status === "available" &&
        new Date(coupon.expires_at).getTime() > Date.now()
    ).length;

    return {
      customers: rewardRows.length,
      deliveredRevenue,
      vipCustomers,
      qualifiedCustomers,
      availableCoupons,
    };
  }, [rewardRows, coupons, firstRewardGoal]);

  const segments = useMemo(() => {
    const building = rewardRows.filter(
      (customer) => Number(customer.total_delivered_spend || 0) < firstRewardGoal
    ).length;
    const reward30 = rewardRows.filter(
      (customer) =>
        Number(customer.total_delivered_spend || 0) >= firstRewardGoal &&
        Number(customer.progress_percent || 0) < 100
    ).length;
    const vip = rewardRows.filter(
      (customer) => Number(customer.progress_percent || 0) >= 100
    ).length;
    const max = Math.max(building, reward30, vip, 1);

    return [
      { label: "Building Rewards", value: building, width: (building / max) * 100 },
      { label: "30% Qualified", value: reward30, width: (reward30 / max) * 100 },
      { label: "VIP / 100%", value: vip, width: (vip / max) * 100 },
    ];
  }, [rewardRows, firstRewardGoal]);

  if (loading) {
    return (
      <AppShell title="Sales Rewards" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!adminProfile) {
    return (
      <AppShell title="Sales Rewards" toasts={toasts}>
        <AccessCard
          label="Login required"
          title="Admin Login"
          body="Please log in with your admin account to view sales rewards."
          href="/login?redirect=/admin/sales"
          button="Login as Admin"
        />
      </AppShell>
    );
  }

  if (adminProfile.role !== "admin") {
    return (
      <AppShell title="Sales Rewards" toasts={toasts}>
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
      title="Sales Rewards"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search customer or reward status..."
      toasts={toasts}
    >
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
              Sales Analytics
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Customer Rewards
            </h1>
            <p className="mt-3 max-w-2xl text-[#725f4d] dark:text-gray-400">
              Track delivered customer spending, coupon eligibility, and customers
              who have reached the 100% VIP milestone.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadSalesRewards}
              className="rounded-full border border-[#cdbba7] bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white dark:hover:text-black"
            >
              Refresh
            </button>
            <Link
              href="/admin/orders"
              className="rounded-full bg-zinc-950 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black dark:hover:bg-violet-400"
            >
              View Orders
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Reward Customers" value={summary.customers.toString()} />
        <StatCard label="Delivered Revenue" value={formatUSD(summary.deliveredRevenue)} />
        <StatCard label="Reward Qualified" value={summary.qualifiedCustomers.toString()} />
        <StatCard label="VIP / 100%" value={summary.vipCustomers.toString()} highlight />
        <StatCard label="Available Coupons" value={summary.availableCoupons.toString()} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">Customer Segments</h2>
          <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
            Customers grouped by delivered-spending progress.
          </p>

          <div className="mt-7 space-y-5">
            {segments.map((segment) => (
              <div key={segment.label}>
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <p className="font-bold">{segment.label}</p>
                  <p className="font-black">{segment.value}</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[#eee2d4] dark:bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-violet-600"
                    style={{ width: `${segment.width}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 rounded-3xl bg-[#f8efe4] p-5 text-sm dark:bg-white/[0.05]">
            <p className="font-black">Reward thresholds</p>
            <p className="mt-2 text-[#725f4d] dark:text-gray-400">
              30% coupon at {formatUSD(firstRewardGoal)} delivered spend. VIP / 100%
              reached at {formatUSD(highestGoal)}.
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-2xl font-black">100% VIP Customers</h2>
              <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
                Customers who reached the highest spending milestone.
              </p>
            </div>
            <span className="rounded-full bg-violet-600 px-4 py-2 text-xs font-black uppercase text-white">
              {summary.vipCustomers} VIP
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {rewardRows
              .filter((customer) => Number(customer.progress_percent || 0) >= 100)
              .slice(0, 6)
              .map((customer) => (
                <div
                  key={customer.user_id}
                  className="flex flex-col justify-between gap-3 rounded-3xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-400/20 dark:bg-violet-400/10 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="font-black">
                      {customer.full_name || "Unnamed Customer"}
                    </p>
                    <p className="text-sm text-[#725f4d] dark:text-gray-300">
                      {customer.available_coupons} available coupon(s)
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-black">{formatUSD(customer.total_delivered_spend)}</p>
                    <p className="text-xs font-black uppercase text-violet-600 dark:text-violet-300">
                      100% Reached
                    </p>
                  </div>
                </div>
              ))}

            {summary.vipCustomers === 0 && (
              <p className="rounded-3xl bg-[#f8efe4] p-6 text-center text-sm text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400">
                No customers have reached the VIP milestone yet.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-black">Reward Customer Table</h2>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
              Delivered-spending progress and issued coupons.
            </p>
          </div>

          <select
            value={progressFilter}
            onChange={(e) =>
              setProgressFilter(
                e.target.value as "all" | "vip" | "qualified" | "building"
              )
            }
            className="rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm font-bold text-zinc-950 outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          >
            <option value="all">All Customers</option>
            <option value="vip">VIP / 100%</option>
            <option value="qualified">30% Qualified</option>
            <option value="building">Building Rewards</option>
          </select>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#ded0bf] text-xs uppercase tracking-[0.2em] text-[#725f4d] dark:border-white/10 dark:text-gray-400">
                <th className="py-4">Customer</th>
                <th className="py-4">Delivered Spend</th>
                <th className="py-4">Progress</th>
                <th className="py-4">Status</th>
                <th className="py-4">Coupons</th>
                <th className="py-4">Next Target</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((customer) => (
                <tr
                  key={customer.user_id}
                  className="border-b border-[#eadfd1] dark:border-white/5"
                >
                  <td className="py-4 font-black">
                    {customer.full_name || "Unnamed Customer"}
                  </td>
                  <td className="py-4 font-black">
                    {formatUSD(customer.total_delivered_spend)}
                  </td>
                  <td className="py-4">
                    <div className="w-36">
                      <div className="flex justify-between text-xs font-bold">
                        <span>{Number(customer.progress_percent || 0).toFixed(0)}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eee2d4] dark:bg-white/[0.08]">
                        <div
                          className="h-full rounded-full bg-violet-600"
                          style={{
                            width: `${Math.min(
                              100,
                              Number(customer.progress_percent || 0)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-4">
                    <RewardBadge
                      status={customer.reward_status}
                      percent={Number(customer.progress_percent || 0)}
                    />
                  </td>
                  <td className="py-4">
                    <p className="font-bold">{customer.total_coupons} issued</p>
                    <p className="text-xs text-[#725f4d] dark:text-gray-400">
                      {customer.available_coupons} available
                    </p>
                  </td>
                  <td className="py-4">
                    {customer.next_reward_target
                      ? formatUSD(customer.next_reward_target)
                      : "Completed"}
                  </td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-[#725f4d] dark:text-gray-400"
                  >
                    No customers found for this reward segment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
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
      className={`rounded-[2rem] border p-6 shadow-sm ${
        highlight
          ? "border-violet-200 bg-violet-50 dark:border-violet-400/20 dark:bg-violet-400/10"
          : "border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]"
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#725f4d] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}

function RewardBadge({ status, percent }: { status: string; percent: number }) {
  const style =
    percent >= 100
      ? "bg-violet-600"
      : status.includes("Earned")
        ? "bg-green-600"
        : "bg-zinc-500";

  return (
    <span
      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${style}`}
    >
      {status}
    </span>
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
      <p
        className={`text-xs font-black uppercase tracking-[0.3em] ${
          danger ? "text-red-600" : "text-violet-600"
        }`}
      >
        {label}
      </p>
      <h1 className="mt-4 text-4xl font-black">{title}</h1>
      <p className="mt-4 text-[#725f4d] dark:text-gray-400">{body}</p>
      <Link
        href={href}
        className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black"
      >
        {button}
      </Link>
    </section>
  );
}