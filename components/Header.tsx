"use client";

import Link from "next/link";

type HeaderProps = {
  title?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  isDark?: boolean;
  onToggleTheme?: () => void;
  onOpenSidebar?: () => void;
  cartCount?: number;
  userEmail?: string;
  profileName?: string;
  isAdmin?: boolean;
  isAgentMode?: boolean;
  isApprovedAgent?: boolean;
};

export default function Header({
  title = "MERCHSHOP",
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search products...",
  isDark = false,
  onToggleTheme,
  onOpenSidebar,
  cartCount = 0,
  userEmail = "",
  profileName = "",
  isAdmin = false,
  isAgentMode = false,
  isApprovedAgent = false,
}: HeaderProps) {
  const headerBg = isDark
    ? "border-white/10 bg-black/70 text-white"
    : "border-[#ded0bf] bg-[#fffaf4]/90 text-[#18120d] shadow-[0_1px_0_rgba(77,55,36,0.08)]";
  const inputClass = isDark
    ? "border-white/10 bg-zinc-900 text-white placeholder:text-gray-500 focus:border-violet-500"
    : "border-[#cdbba7] bg-white text-[#18120d] placeholder:text-[#8c7a67] shadow-inner focus:border-violet-600 focus:ring-4 focus:ring-violet-200/70";
  const outlineButton = isDark
    ? "border-white/10 hover:bg-white hover:text-black"
    : "border-[#cdbba7] bg-white text-[#2b2118] shadow-sm hover:border-[#18120d] hover:bg-[#18120d] hover:text-white";
  const primaryButton = isDark
    ? "bg-white text-black hover:bg-violet-400"
    : "bg-[#18120d] text-white shadow-sm hover:bg-violet-700";
  const mutedText = isDark ? "text-gray-400" : "text-[#725f4d]";
  const displayName = profileName || userEmail;

  const switchToCustomerMode = () => {
    localStorage.setItem("merch-access-mode", "customer");
    window.location.href = "/";
  };

  return (
    <header className={`sticky top-0 z-30 border-b px-4 py-4 backdrop-blur-xl md:px-6 ${headerBg}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onOpenSidebar} className={`rounded-full border px-4 py-2 text-xs font-black transition lg:hidden ${outlineButton}`}>
            Menu
          </button>
          <div className="min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-[0.25em] ${mutedText}`}>
              {isAgentMode ? "Agent Portal" : "Current Page"}
            </p>
            <h1 className="truncate text-xl font-black md:text-2xl">{title}</h1>
          </div>
        </div>

        {onSearchChange && (
          <div className="hidden flex-1 justify-center md:flex">
            <input value={searchValue} onChange={(e) => onSearchChange(e.target.value)} placeholder={searchPlaceholder} className={`w-full max-w-md rounded-full border px-5 py-3 text-sm outline-none transition ${inputClass}`} />
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onToggleTheme} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${outlineButton}`}>
            {isDark ? "☀ Light" : "☾ Dark"}
          </button>

          <Link href="/cart" className={`relative rounded-full border px-4 py-2 text-xs font-bold transition ${outlineButton}`}>
            Cart
            {cartCount > 0 && <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-black text-white">{cartCount}</span>}
          </Link>

          {isAgentMode && (
            <button onClick={switchToCustomerMode} className={`hidden rounded-full border px-4 py-2 text-xs font-bold transition md:inline-block ${outlineButton}`}>
              Customer Mode
            </button>
          )}

          {!isAgentMode && isApprovedAgent && !isAdmin && (
            <Link href="/agent-login" className={`hidden rounded-full border px-4 py-2 text-xs font-bold transition md:inline-block ${outlineButton}`}>
              Agent Portal
            </Link>
          )}

          {isAdmin && (
            <Link href="/admin" className={`hidden rounded-full border px-4 py-2 text-xs font-bold transition md:inline-block ${outlineButton}`}>
              Admin
            </Link>
          )}

          {userEmail ? (
            <Link href="/account" className={`rounded-full px-4 py-2 text-xs font-black transition ${primaryButton}`} title={displayName}>
              Account
            </Link>
          ) : (
            <Link href="/login" className={`rounded-full px-4 py-2 text-xs font-black transition ${primaryButton}`}>
              Login
            </Link>
          )}
        </div>
      </div>

      {onSearchChange && (
        <div className="mx-auto mt-4 max-w-7xl md:hidden">
          <input value={searchValue} onChange={(e) => onSearchChange(e.target.value)} placeholder={searchPlaceholder} className={`w-full rounded-full border px-5 py-3 text-sm outline-none transition ${inputClass}`} />
        </div>
      )}
    </header>
  );
}