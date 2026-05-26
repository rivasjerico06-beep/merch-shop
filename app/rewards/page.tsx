"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { ToastItem } from "@/lib/types";

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
  tier_code: string;
  coupon_code: string;
  discount_percent: number;
  max_discount: number;
  minimum_order_amount: number;
  status: "available" | "used" | "expired" | "cancelled";
  issued_at: string;
  expires_at: string;
  used_at: string | null;
};

export default function RewardsPage() {
  const [userId, setUserId] = useState("");
  const [progress, setProgress] = useState<RewardProgress | null>(null);
  const [tiers, setTiers] = useState<RewardTier[]>([]);
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();
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

  const loadRewards = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserId("");
      setProgress(null);
      setTiers([]);
      setCoupons([]);
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const [progressResult, tiersResult, couponsResult] = await Promise.all([
      supabase
        .from("customer_reward_progress")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("reward_tiers")
        .select(
          "code, name, minimum_spend, discount_percent, max_discount, minimum_order_amount, validity_days, sort_order"
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("customer_coupons")
        .select(
          "id, tier_code, coupon_code, discount_percent, max_discount, minimum_order_amount, status, issued_at, expires_at, used_at"
        )
        .eq("user_id", user.id)
        .order("issued_at", { ascending: false }),
    ]);

    if (progressResult.error) {
      addToast("Unable to load reward progress", "error");
      console.error("Reward progress load error:", progressResult.error);
    } else {
      setProgress((progressResult.data as RewardProgress | null) || null);
    }

    if (tiersResult.error) {
      addToast("Unable to load reward tiers", "error");
      console.error("Reward tiers load error:", tiersResult.error);
    } else {
      setTiers((tiersResult.data || []) as RewardTier[]);
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
    loadRewards();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadRewards();
    });

    return () => subscription.unsubscribe();
  }, []);

  const availableCoupons = useMemo(
    () =>
      coupons.filter(
        (coupon) =>
          coupon.status === "available" &&
          new Date(coupon.expires_at).getTime() > Date.now()
      ),
    [coupons]
  );

  const topGoal = Number(
    progress?.highest_goal || tiers[tiers.length - 1]?.minimum_spend || 0
  );

  const totalSpent = Number(progress?.total_delivered_spend || 0);
  const progressPercent = Math.min(
    100,
    Number(progress?.progress_percent || (topGoal ? (totalSpent / topGoal) * 100 : 0))
  );

  const nextTarget =
    progress?.next_reward_target ??
    tiers.find((tier) => totalSpent < Number(tier.minimum_spend))?.minimum_spend ??
    null;

  const amountToNext =
    nextTarget === null ? 0 : Math.max(0, Number(nextTarget) - totalSpent);

  const copyCoupon = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      addToast("Coupon code copied", "success");
    } catch {
      addToast("Unable to copy coupon code", "error");
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppShell title="Rewards" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#58948f]/30 bg-[#58948f]/5 dark:border-[#58948f]/20 dark:bg-[#093459]/10">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#58948f] border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  // ── Not logged in ────────────────────────────────────────────────────────
  if (!userId) {
    return (
      <AppShell title="Rewards" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-[#58948f]/30 bg-[#58948f]/5 p-8 text-center shadow-sm dark:border-[#58948f]/20 dark:bg-[#093459]/20">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
            Login required
          </p>
          <h1 className="mt-4 text-4xl font-black">Your Rewards</h1>
          <p className="mt-4 text-[#725f4d] dark:text-[#6fb0aa]">
            Log in to view your spending progress and earned coupons.
          </p>
          <Link
            href="/login?redirect=/rewards"
            className="mt-6 inline-block rounded-full bg-[#093459] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#58948f] dark:bg-[#58948f] dark:text-white dark:hover:bg-[#093459]"
          >
            Log In
          </Link>
        </section>
      </AppShell>
    );
  }

  // ── Main page ────────────────────────────────────────────────────────────
  return (
    <AppShell title="Rewards" toasts={toasts}>

      {/* ── HERO HEADER ── */}
      <section className="rounded-[2.5rem] border border-[#58948f]/30 bg-[#58948f]/5 p-6 dark:border-[#58948f]/20 dark:bg-[#093459]/10 md:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
              Loyalty Rewards
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Purchase Milestones
            </h1>
            <p className="mt-3 max-w-2xl text-[#725f4d] dark:text-[#6fb0aa]/80">
              Rewards are based on your delivered purchase total. Earn one-time
              discount coupons as you reach each milestone.
            </p>
          </div>

          {/* Reward status pill */}
          <div className="rounded-3xl border border-[#58948f]/30 bg-[#58948f]/10 p-5 dark:border-[#58948f]/25 dark:bg-[#093459]/30">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#58948f]">
              Reward Status
            </p>
            <p className="mt-2 text-xl font-black">
              {progress?.reward_status || "Building Rewards"}
            </p>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-[#6fb0aa]/80">
              {availableCoupons.length} coupon(s) available
            </p>
          </div>
        </div>
      </section>

      {/* ── STAT CARDS ── */}
      <section className="mt-6 grid gap-5 md:grid-cols-3">
        <StatCard label="Delivered Spending" value={formatUSD(totalSpent)} />
        <StatCard label="VIP Progress" value={`${progressPercent.toFixed(0)}%`} />
        <StatCard
          label="Next Reward"
          value={nextTarget === null ? "Completed" : `${formatUSD(amountToNext)} away`}
        />
      </section>

      {/* ── PROGRESS BAR ── */}
      <section className="mt-6 rounded-[2rem] border border-[#58948f]/30 bg-[#58948f]/5 p-6 dark:border-[#58948f]/20 dark:bg-[#093459]/10">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-black">Your Progress</h2>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-[#6fb0aa]/80">
              Your highest reward milestone is {formatUSD(topGoal)} in delivered orders.
            </p>
          </div>
          <p className="text-3xl font-black text-[#58948f]">
            {progressPercent.toFixed(0)}%
          </p>
        </div>

        {/* Progress track */}
        <div className="mt-6 h-4 overflow-hidden rounded-full bg-[#093459]/15 dark:bg-[#58948f]/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#093459] to-[#58948f] transition-all duration-700"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Tier cards */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {tiers.map((tier) => {
            const reached = totalSpent >= Number(tier.minimum_spend);

            return (
              <div
                key={tier.code}
                className={`rounded-3xl border p-5 transition-colors ${
                  reached
                    /* reached: teal-tinted in both modes */
                    ? "border-[#58948f]/40 bg-[#58948f]/10 dark:border-[#58948f]/35 dark:bg-[#58948f]/15"
                    /* locked: navy-tinted in both modes */
                    : "border-[#093459]/20 bg-[#093459]/5 dark:border-[#58948f]/15 dark:bg-[#093459]/20"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black">{tier.name}</p>
                    <p className="mt-1 text-sm text-[#725f4d] dark:text-[#6fb0aa]/80">
                      Spend {formatUSD(tier.minimum_spend)} in delivered orders
                    </p>
                  </div>

                  {/* Status badge */}
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${
                      reached
                        ? "bg-[#58948f]"          /* teal = earned */
                        : "bg-[#093459]"          /* navy = locked */
                    }`}
                  >
                    {reached ? "Earned" : "Locked"}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <DetailLine
                    label="Discount"
                    value={`${Number(tier.discount_percent).toFixed(0)}% off`}
                  />
                  <DetailLine
                    label="Minimum Order"
                    value={formatUSD(tier.minimum_order_amount)}
                  />
                  <DetailLine
                    label="Maximum Discount"
                    value={formatUSD(tier.max_discount)}
                  />
                  <DetailLine
                    label="Validity"
                    value={`${tier.validity_days} days after issue`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── COUPONS ── */}
      <section className="mt-6 rounded-[2rem] border border-[#58948f]/30 bg-[#58948f]/5 p-6 dark:border-[#58948f]/20 dark:bg-[#093459]/10">
        <div>
          <h2 className="text-2xl font-black">Your Coupons</h2>
          <p className="mt-1 text-sm text-[#725f4d] dark:text-[#6fb0aa]/80">
            Coupons are issued once you reach a delivered-purchase milestone.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {coupons.length === 0 ? (
            /* Empty state */
            <div className="rounded-3xl border border-[#58948f]/20 bg-[#093459]/8 p-6 text-center dark:border-[#58948f]/15 dark:bg-[#093459]/25">
              <p className="font-black">No earned coupons yet</p>
              <p className="mt-2 text-sm text-[#725f4d] dark:text-[#6fb0aa]/80">
                Continue shopping and complete delivered orders to unlock rewards.
              </p>
            </div>
          ) : (
            coupons.map((coupon) => {
              const expiredByDate =
                coupon.status === "available" &&
                new Date(coupon.expires_at).getTime() <= Date.now();
              const displayStatus = expiredByDate ? "expired" : coupon.status;
              const usable = displayStatus === "available";

              return (
                <div
                  key={coupon.id}
                  className={`flex flex-col justify-between gap-4 rounded-3xl border p-5 transition-colors md:flex-row md:items-center ${
                    usable
                      /* active coupon: teal accent */
                      ? "border-[#58948f]/40 bg-[#58948f]/8 dark:border-[#58948f]/30 dark:bg-[#58948f]/10"
                      /* used / expired: muted navy */
                      : "border-[#093459]/20 bg-[#093459]/5 dark:border-[#58948f]/15 dark:bg-[#093459]/20"
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-black">
                        {Number(coupon.discount_percent).toFixed(0)}% OFF
                      </p>
                      {/* Status badge */}
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${
                          usable
                            ? "bg-[#58948f]"       /* teal = available */
                            : displayStatus === "used"
                              ? "bg-[#093459]"     /* navy = used */
                              : "bg-red-500"       /* red = expired/cancelled */
                        }`}
                      >
                        {displayStatus}
                      </span>
                    </div>

                    <p className="mt-2 font-mono text-sm font-bold text-[#58948f]">
                      {coupon.coupon_code}
                    </p>

                    <p className="mt-2 text-sm text-[#725f4d] dark:text-[#6fb0aa]/80">
                      Minimum order: {formatUSD(coupon.minimum_order_amount)} ·
                      Maximum discount: {formatUSD(coupon.max_discount)} ·
                      Expires: {new Date(coupon.expires_at).toLocaleDateString()}
                    </p>
                  </div>

                  {usable && (
                    <button
                      type="button"
                      onClick={() => copyCoupon(coupon.coupon_code)}
                      className="rounded-full bg-[#093459] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#58948f] dark:bg-[#58948f] dark:text-white dark:hover:bg-[#093459]"
                    >
                      Copy Code
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-[#725f4d] dark:text-[#6fb0aa]/70">
        Coupon application during checkout will be enabled in the next setup step.
      </p>
    </AppShell>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[2rem] border border-[#58948f]/30 bg-[#58948f]/5 p-6 dark:border-[#58948f]/20 dark:bg-[#093459]/15">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#58948f]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#725f4d] dark:text-[#6fb0aa]/80">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}