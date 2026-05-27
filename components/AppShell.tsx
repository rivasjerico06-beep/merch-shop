"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import ToastContainer from "@/components/ToastContainer";
import ReferralTracker from "@/components/ReferralTracker";
import type { ToastItem } from "@/lib/types";

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  profile_photo_url?: string | null;
};

type AgentAccess = {
  status: string | null;
  referral_code: string | null;
};

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  toasts?: ToastItem[];
};

export default function AppShell({
  children,
  title = "MERCHSHOP",
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search products...",
  toasts = [],
}: AppShellProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [agentAccess, setAgentAccess] = useState<AgentAccess | null>(null);
  const [accessMode, setAccessMode] = useState<"customer" | "agent">("customer");
  const [userEmail, setUserEmail] = useState("");
  const [cartCount, setCartCount] = useState(0);

  const isDark = theme === "dark";
  const isAdmin = profile?.role === "admin";
  const isApprovedAgent = agentAccess?.status === "approved";
  const isAgentMode = !isAdmin && isApprovedAgent && accessMode === "agent";

  const pageBg = isDark
       ? "bg-[#080808] text-white"
       : "bg-white text-[#18120d]";
  const loadSessionData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProfile(null);
      setAgentAccess(null);
      setUserEmail("");
      setCartCount(0);
      localStorage.removeItem("merch-access-mode");
      setAccessMode("customer");
      return;
    }

    setUserEmail(user.email || "");

    const [profileResult, agentResult, cartResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role, profile_photo_url")
        .eq("id", user.id)
        .single(),
      supabase
        .from("agent_profiles")
        .select("status, referral_code")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("cart_items").select("quantity").eq("user_id", user.id),
    ]);

    const loadedProfile = (profileResult.data as Profile) || null;
    const loadedAgent = (agentResult.data as AgentAccess) || null;

    setProfile(loadedProfile);
    setAgentAccess(loadedAgent);

    const requestedMode = localStorage.getItem("merch-access-mode");
    const allowAgentMode =
      loadedProfile?.role !== "admin" &&
      loadedAgent?.status === "approved" &&
      requestedMode === "agent";

    setAccessMode(allowAgentMode ? "agent" : "customer");

    setCartCount(
      (cartResult.data || []).reduce(
        (total, item) => total + Number(item.quantity || 1),
        0
      )
    );
  };

  useEffect(() => {
    setMounted(true);

    const savedTheme = localStorage.getItem("merch-theme");
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }

    loadSessionData();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => loadSessionData());

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("merch-theme", theme);
  }, [theme, mounted]);

  return (
    <main className={`${isDark ? "dark" : ""} min-h-screen transition-colors duration-300 ${pageBg}`}>
      <ToastContainer toasts={toasts} isDark={isDark} />

      <div className="flex min-h-screen">
        <Sidebar
          isAdmin={isAdmin}
          isAgentMode={isAgentMode}
          isApprovedAgent={isApprovedAgent}
          isDark={isDark}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="min-w-0 flex-1">
          <Header
            title={title}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
            isDark={isDark}
            onToggleTheme={() => setTheme(isDark ? "light" : "dark")}
            onOpenSidebar={() => setSidebarOpen(true)}
            cartCount={cartCount}
            userEmail={userEmail}
            isAdmin={isAdmin}
            isAgentMode={isAgentMode}
            isApprovedAgent={isApprovedAgent}
            profileName={profile?.full_name || ""}
          />

          {!isAdmin && <ReferralTracker isDark={isDark} />}

          {isAgentMode && (
            <div className="mx-auto max-w-7xl px-4 pt-5 md:px-6">
              <div className="flex flex-col justify-between gap-3 rounded-3xl border border-violet-200 bg-violet-50 p-4 text-violet-950 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-100 md:flex-row md:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-violet-600 dark:text-violet-300">
                    Agent Workspace Active
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    You may shop personally in this mode. Your own referral code cannot be credited to your personal order.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">{children}</div>
        </div>
      </div>
    </main>
  );
}