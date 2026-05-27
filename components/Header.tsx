"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSun, faMoon, faShoppingCart, faUserCheck, faUserTie, faUserShield, faUser, faSignInAlt} from "@fortawesome/free-solid-svg-icons";

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
    : "border-slate-100 bg-white/90 text-[#18120d] shadow-[0_1px_0_rgba(0,0,0,0.05)]";;
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

        <div className="flex items-center gap-4">
  {/* Theme Toggle Button */}
  <button
    onClick={onToggleTheme}
    className="p-1 transition hover:opacity-80"
    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
  >
    <FontAwesomeIcon
      icon={isDark ? faSun : faMoon}
      className={isDark ? "text-yellow-300" : "text-[#093459]"}
      size="sm"
    />
  </button>

  {/* Cart Button */}
  <Link 
    href="/cart" 
    className="relative p-1 transition hover:opacity-80"
    aria-label="View Cart"
  >
    <FontAwesomeIcon icon={faShoppingCart} className="text-[#093459] dark:text-[#58948f]" size="sm" />
    {cartCount > 0 && (
      <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#58948f] px-1 text-[9px] font-black text-white">
        {cartCount}
      </span>
    )}
  </Link>

  {/* Customer Mode Action */}
  {isAgentMode && (
    <button 
      onClick={switchToCustomerMode} 
      className="hidden p-1 transition hover:opacity-80 md:inline-block"
      aria-label="Switch to Customer Mode"
      title="Customer Mode"
    >
      <FontAwesomeIcon icon={faUserCheck} className="text-[#093459] dark:text-[#58948f]" size="sm" />
    </button>
  )}

  {/* Agent Portal Navigation */}
  {!isAgentMode && isApprovedAgent && !isAdmin && (
    <Link 
      href="/agent-login" 
      className="hidden p-1 transition hover:opacity-80 md:inline-block"
      aria-label="Go to Agent Portal"
      title="Agent Portal"
    >
      <FontAwesomeIcon icon={faUserTie} className="text-[#093459] dark:text-[#58948f]" size="sm" />
    </Link>
  )}

  {/* Admin Control Dashboard */}
  {isAdmin && (
    <Link 
      href="/admin" 
      className="hidden p-1 transition hover:opacity-80 md:inline-block"
      aria-label="Go to Admin Dashboard"
      title="Admin"
    >
      <FontAwesomeIcon icon={faUserShield} className="text-[#093459] dark:text-[#58948f]" size="sm" />
    </Link>
  )}

  {/* Profile Account / Authentication Entry */}
  {userEmail ? (
    <Link 
      href="/account" 
      className="p-1 transition hover:opacity-80" 
      title={displayName}
      aria-label="View Account"
    >
      <FontAwesomeIcon icon={faUser} className="text-[#093459] dark:text-[#58948f]" size="sm" />
    </Link>
  ) : (
    <Link 
      href="/login" 
      className="p-1 transition hover:opacity-80"
      aria-label="Login"
      title="Login"
    >
      <FontAwesomeIcon icon={faSignInAlt} className="text-[#093459] dark:text-[#58948f]" size="sm" />
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