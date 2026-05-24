"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AuthGuardProps = {
  children: React.ReactNode;
  adminOnly?: boolean;
  fallbackTitle?: string;
  fallbackMessage?: string;
};

export default function AuthGuard({
  children,
  adminOnly = false,
  fallbackTitle = "Login required",
  fallbackMessage = "Please login to continue.",
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const checkAccess = async () => {
      setChecking(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setAllowed(false);
        setReason("not-authenticated");
        setChecking(false);
        return;
      }

      if (adminOnly) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profile?.role !== "admin") {
          setAllowed(false);
          setReason("not-admin");
          setChecking(false);
          return;
        }
      }

      setAllowed(true);
      setReason("");
      setChecking(false);
    };

    checkAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkAccess();
    });

    return () => subscription.unsubscribe();
  }, [adminOnly]);

  useEffect(() => {
    if (!checking && reason === "not-authenticated") {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [checking, reason, pathname, router]);

  if (checking) {
    return (
      <div className="flex h-72 items-center justify-center rounded-[2rem] border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.04]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  if (allowed) {
    return <>{children}</>;
  }

  if (reason === "not-admin") {
    return (
      <section className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-red-600">
          Access denied
        </p>
        <h1 className="mt-4 text-4xl font-black">Admin Only</h1>
        <p className="mt-4 text-zinc-600 dark:text-gray-400">
          This page is only available to accounts with an admin role.
        </p>

        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white dark:bg-white dark:text-black"
        >
          Back to Shop
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
        Account required
      </p>
      <h1 className="mt-4 text-4xl font-black">{fallbackTitle}</h1>
      <p className="mt-4 text-zinc-600 dark:text-gray-400">
        {fallbackMessage}
      </p>

      <Link
        href={`/login?redirect=${encodeURIComponent(pathname)}`}
        className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white dark:bg-white dark:text-black"
      >
        Go to Login
      </Link>
    </section>
  );
}