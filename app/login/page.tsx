"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ToastItem } from "@/lib/types";
import ToastContainer from "@/components/ToastContainer";
import { authSchema, getValidationMessage } from "@/lib/validation";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const isDark = theme === "dark";

  /*
    Security note:
    Only allow internal redirect paths.
    This prevents redirecting a user to an external site through:
    /login?redirect=https://malicious-site.example
  */
  const rawRedirect = searchParams.get("redirect");
  const redirectTo =
    rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/";

  const pageBg = isDark
    ? "bg-[#080808] text-white"
    : "bg-[#f6f0e8] text-zinc-950";

  const cardBg = isDark
    ? "border-white/10 bg-zinc-950"
    : "border-[#ded0bf] bg-white";

  const softBg = isDark ? "bg-white/[0.05]" : "bg-[#faf4ec]";

  const inputClass = isDark
    ? "border-white/10 bg-zinc-900 text-white placeholder:text-gray-500 focus:border-violet-500"
    : "border-[#cdbba7] bg-white text-zinc-950 placeholder:text-[#8c7a67] focus:border-violet-600 focus:ring-4 focus:ring-violet-200/70";

  const outlineButton = isDark
    ? "border-white/10 hover:bg-white hover:text-black"
    : "border-[#cdbba7] bg-white hover:bg-zinc-950 hover:text-white";

  const mutedText = isDark ? "text-gray-400" : "text-[#725f4d]";

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now();

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("merch-theme");

    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }

    const checkSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        /*
          Normal login route always opens shopping/customer mode.
          An approved agent uses /agent-login to explicitly enter Agent Portal mode.
        */
        localStorage.setItem("merch-access-mode", "customer");
        router.replace(redirectTo);
        return;
      }

      setCheckingSession(false);
    };

    checkSession();
  }, [router, redirectTo]);

  useEffect(() => {
    localStorage.setItem("merch-theme", theme);
  }, [theme]);

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    let parsed;

    try {
      parsed = authSchema.parse({ email, password });
    } catch (error) {
      addToast(getValidationMessage(error), "error");
      setLoading(false);
      return;
    }

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.email,
        password: parsed.password,
      });

      if (error) {
        addToast(error.message, "error");
        setLoading(false);
        return;
      }

      /*
        Do not convert approved agents into agent mode on normal login.
        This account may be agent-enabled, but it is currently shopping as customer.
      */
      localStorage.setItem("merch-access-mode", "customer");
      addToast("Logged in successfully", "success");
      router.push(redirectTo);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.email,
        password: parsed.password,
      });

      if (error) {
        addToast(error.message, "error");
        setLoading(false);
        return;
      }

      localStorage.setItem("merch-access-mode", "customer");

      if (data.session) {
        addToast("Account created successfully", "success");
        router.push(redirectTo);
      } else {
        addToast(
          "Account created. Please check your email to confirm your account, then log in.",
          "success"
        );
        setAuthMode("login");
      }
    }

    setEmail("");
    setPassword("");
    setLoading(false);
  };

  if (checkingSession) {
    return <LoadingScreen isDark={isDark} />;
  }

  return (
    <main
      className={`${isDark ? "dark" : ""} min-h-screen transition-colors duration-300 ${pageBg}`}
    >
      <ToastContainer toasts={toasts} isDark={isDark} />

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-6">
        <Link href="/" className="shrink-0 text-xl font-black tracking-tight sm:text-2xl">
          MERCH<span className="text-violet-600">SHOP</span>
        </Link>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`rounded-full border px-3 py-2 text-xs font-bold transition sm:px-4 ${outlineButton}`}
          >
            {isDark ? "☀ Light" : "☾ Dark"}
          </button>

          <Link
            href="/agent-login"
            className={`rounded-full border px-3 py-2 text-xs font-bold transition sm:px-4 ${outlineButton}`}
          >
            Agent Portal
          </Link>

          <Link
            href="/"
            className={`rounded-full border px-3 py-2 text-xs font-bold transition sm:px-4 ${outlineButton}`}
          >
            Home
          </Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-92px)] max-w-6xl items-center px-4 pb-10 sm:px-6">
        <div className={`overflow-hidden rounded-[2.5rem] border shadow-xl ${cardBg}`}>
          <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
            <div className={`p-7 sm:p-10 md:p-12 ${softBg}`}>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-600">
                Customer Access
              </p>

              <h1 className="mt-5 text-4xl font-black leading-tight md:text-5xl">
                Welcome to your collectible store.
              </h1>

              <p className={`mt-5 max-w-md ${mutedText}`}>
                Browse products, manage your personal cart, track orders, and
                earn future rewards through your purchases.
              </p>

              <div className="mt-8 grid gap-3">
                <Feature label="Secure account access" isDark={isDark} />
                <Feature label="Personal shopping cart" isDark={isDark} />
                <Feature label="Order tracking" isDark={isDark} />
                <Feature label="Agent-assisted checkout coming next" isDark={isDark} />
              </div>

              <div
                className={`mt-8 rounded-3xl border p-5 text-sm ${
                  isDark
                    ? "border-violet-400/20 bg-violet-400/10 text-gray-300"
                    : "border-violet-200 bg-violet-50 text-[#514238]"
                }`}
              >
                <p className="font-black text-violet-600 dark:text-violet-300">
                  Approved agent?
                </p>
                <p className="mt-1">
                  Use the Agent Portal button above to access referral tools and
                  guided-sales performance.
                </p>
              </div>
            </div>

            <div className="p-7 sm:p-10 md:p-12">
              <div className="flex rounded-full bg-[#f1e6d9] p-1 dark:bg-white/[0.07]">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`flex-1 rounded-full px-4 py-3 text-xs font-black uppercase tracking-[0.2em] transition ${
                    authMode === "login"
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-black"
                      : "text-[#725f4d] dark:text-gray-400"
                  }`}
                >
                  Log In
                </button>

                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={`flex-1 rounded-full px-4 py-3 text-xs font-black uppercase tracking-[0.2em] transition ${
                    authMode === "signup"
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-black"
                      : "text-[#725f4d] dark:text-gray-400"
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <p className="mt-8 text-xs font-black uppercase tracking-[0.3em] text-violet-600">
                {authMode === "login" ? "Customer Login" : "Create Account"}
              </p>

              <h2 className="mt-3 text-4xl font-black">
                {authMode === "login" ? "Welcome back" : "Start shopping"}
              </h2>

              <p className={`mt-3 text-sm ${mutedText}`}>
                {authMode === "login"
                  ? "Sign in to your customer account."
                  : "Create your personal customer account."}
              </p>

              <form onSubmit={handleAuth} className="mt-8 space-y-4">
                <AuthInput
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="your@email.com"
                  inputClass={inputClass}
                />

                <AuthInput
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Minimum 6 characters"
                  inputClass={inputClass}
                />

                <button
                  disabled={loading}
                  className="w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-violet-400"
                >
                  {loading
                    ? authMode === "login"
                      ? "Signing In..."
                      : "Creating Account..."
                    : authMode === "login"
                      ? "Log In as Customer"
                      : "Create Customer Account"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/agent-login"
                  className="text-sm font-bold text-violet-600 transition hover:text-violet-800 dark:hover:text-violet-300"
                >
                  Agent? Open the Agent Portal
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoadingScreen({ isDark = false }: { isDark?: boolean }) {
  return (
    <main
      className={`flex min-h-screen items-center justify-center ${
        isDark ? "bg-[#080808] text-white" : "bg-[#f6f0e8] text-zinc-950"
      }`}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
    </main>
  );
}

function AuthInput({
  label,
  type,
  value,
  onChange,
  placeholder,
  inputClass,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputClass: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
        {label}
      </label>

      <input
        required
        minLength={type === "password" ? 6 : undefined}
        maxLength={type === "password" ? 128 : 254}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${inputClass}`}
      />
    </div>
  );
}

function Feature({ label, isDark }: { label: string; isDark: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-4 ${
        isDark
          ? "border-white/10 bg-white/[0.04]"
          : "border-[#ded0bf] bg-white"
      }`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-xs font-black text-white">
        ✓
      </span>
      <p className="font-bold">{label}</p>
    </div>
  );
}