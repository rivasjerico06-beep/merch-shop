"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse,
  faBagShopping,
  faCartShopping,
  faCreditCard,
  faUser,
  faBox,
  faHeadset,
  faGauge,
  faTag,
  faGear,
  faClipboardList,
  faUsers,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

type SidebarProps = {
  isAdmin?: boolean;
  isAgentMode?: boolean;
  isApprovedAgent?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  isDark?: boolean;
};

type NavLink = {
  href: string;
  label: string;
  icon: IconDefinition;
};

const customerLinks: NavLink[] = [
  { href: "/", label: "Home", icon: faHouse },
  { href: "/products", label: "Products", icon: faBagShopping },
  { href: "/cart", label: "Cart", icon: faCartShopping },
  { href: "/checkout", label: "Checkout", icon: faCreditCard },
  { href: "/account", label: "Account", icon: faUser },
  { href: "/orders", label: "Orders", icon: faBox },
];

const customerApplicationLink: NavLink = {
  href: "/agent",
  label: "Apply as Agent",
  icon: faHeadset,
};

const agentWorkspaceLinks: NavLink[] = [
  { href: "/agent", label: "Dashboard", icon: faGauge },
  { href: "/account", label: "My Account", icon: faUser },
];

const agentShoppingLinks: NavLink[] = [
  { href: "/", label: "Store Home", icon: faHouse },
  { href: "/products", label: "Products", icon: faBagShopping },
  { href: "/cart", label: "My Cart", icon: faCartShopping },
  { href: "/checkout", label: "Checkout", icon: faCreditCard },
  { href: "/orders", label: "My Orders", icon: faBox },
];

const adminLinks: NavLink[] = [
  { href: "/admin", label: "Dashboard", icon: faGauge },
  { href: "/admin/products", label: "Products", icon: faTag },
  { href: "/admin/options", label: "Options", icon: faGear },
  { href: "/admin/orders", label: "Orders", icon: faClipboardList },
  { href: "/admin/customers", label: "Customers", icon: faUsers },
  { href: "/admin/agents", label: "Agents", icon: faHeadset },
];

export default function Sidebar({
  isAdmin = false,
  isAgentMode = false,
  isApprovedAgent = false,
  isOpen = false,
  onClose,
  isDark = false,
}: SidebarProps) {
  const pathname = usePathname();

  const sidebarBase = isDark
    ? "border-white/10 bg-zinc-950 text-white"
    : "border-[#ded0bf] bg-[#fffaf4] text-[#18120d] shadow-[1px_0_0_rgba(77,55,36,0.08)]";

  const mutedText = isDark ? "text-gray-400" : "text-[#725f4d]";

  const getPathOnly = (href: string) => href.split("?")[0];

  const getIsActive = (href: string) => {
    const linkPath = getPathOnly(href);

    return linkPath === "/"
      ? pathname === "/"
      : pathname === linkPath || pathname.startsWith(`${linkPath}/`);
  };

  const getLinkClass = (href: string) => {
    const isActive = getIsActive(href);

    const base =
      "relative flex h-12 items-center rounded-2xl text-sm font-bold transition-all duration-300 lg:justify-center lg:px-0 lg:group-hover/sidebar:justify-start lg:group-hover/sidebar:px-4";

    if (isActive) {
      return `${base} bg-violet-600 text-white shadow-sm`;
    }

    return isDark
      ? `${base} text-gray-300 hover:bg-white/10 hover:text-white`
      : `${base} text-[#3b2f25] hover:bg-[#f1e6d9] hover:text-[#18120d]`;
  };

  const renderLink = (link: NavLink) => {
    const isActive = getIsActive(link.href);

    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={onClose}
        className={getLinkClass(link.href)}
        title={link.label}
      >
        <span
          className={`flex h-12 w-16 shrink-0 items-center justify-center transition-all duration-300 lg:w-full lg:group-hover/sidebar:w-8 ${
            isActive ? "text-white" : ""
          }`}
        >
          <FontAwesomeIcon icon={link.icon} className="h-[18px] w-[18px]" />
        </span>

        <span className="hidden min-w-0 whitespace-nowrap opacity-0 transition-opacity duration-200 lg:group-hover/sidebar:inline lg:group-hover/sidebar:opacity-100">
          {link.label}
        </span>
      </Link>
    );
  };

  const normalCustomerLinks = isAdmin
    ? customerLinks
    : isApprovedAgent
      ? customerLinks
      : [...customerLinks, customerApplicationLink];

  return (
    <>
      {isOpen && (
        <button
          aria-label="Close sidebar backdrop"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`group/sidebar fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r p-4 shadow-xl transition-all duration-300 lg:sticky lg:top-0 lg:w-20 lg:translate-x-0 lg:overflow-hidden lg:p-4 lg:shadow-none lg:hover:w-72 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarBase}`}
      >
        <div className="flex h-12 items-center justify-between gap-3 overflow-hidden">
          <Link
            href={isAgentMode ? "/agent" : "/"}
            onClick={onClose}
            className="flex min-w-0 items-center gap-3 overflow-hidden"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-base font-black text-white">
              {isAgentMode ? "A" : "M"}
            </span>

            <span className="hidden whitespace-nowrap text-2xl font-black tracking-tight opacity-0 transition-opacity duration-200 lg:group-hover/sidebar:inline lg:group-hover/sidebar:opacity-100">
              {isAgentMode ? (
                <>
                  AGENT<span className="text-violet-600">PORTAL</span>
                </>
              ) : (
                <>
                  MERCH<span className="text-violet-600">SHOP</span>
                </>
              )}
            </span>
          </Link>

          <button
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm font-black lg:hidden"
          >
            ✕
          </button>
        </div>

        <div className="mt-8 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0">
          {isAgentMode ? (
            <>
              <NavGroup
                label="Agent Workspace"
                links={agentWorkspaceLinks}
                mutedText={mutedText}
                renderLink={renderLink}
              />

              <div className="mt-8">
                <NavGroup
                  label="My Shopping"
                  links={agentShoppingLinks}
                  mutedText={mutedText}
                  renderLink={renderLink}
                />
              </div>
            </>
          ) : (
            <NavGroup
              label="Shop"
              links={normalCustomerLinks}
              mutedText={mutedText}
              renderLink={renderLink}
            />
          )}

          {!isAgentMode && isApprovedAgent && !isAdmin && (
            <div className="mt-6 px-1">
              <Link
                href="/agent-login"
                onClick={onClose}
                className="block rounded-2xl border border-violet-200 bg-violet-50 p-3 text-center text-xs font-black uppercase tracking-[0.15em] text-violet-700 transition hover:bg-violet-100 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200 dark:hover:bg-violet-400/15"
              >
                Open Agent Portal
              </Link>
            </div>
          )}

          {isAdmin && (
            <div className="mt-8">
              <NavGroup
                label="Admin"
                links={adminLinks}
                mutedText={mutedText}
                renderLink={renderLink}
              />
            </div>
          )}
        </div>

        <div
          className={`mt-4 hidden overflow-hidden rounded-3xl border p-4 text-xs opacity-0 transition-opacity duration-200 lg:group-hover/sidebar:block lg:group-hover/sidebar:opacity-100 ${
            isDark
              ? "border-white/10 bg-white/[0.04]"
              : "border-[#ded0bf] bg-[#f7ecdf]"
          }`}
        >
          <p className="whitespace-nowrap font-black uppercase tracking-[0.2em] text-violet-600">
            Status
          </p>
          <p className={`mt-2 whitespace-nowrap ${mutedText}`}>
            {isAgentMode
              ? "Agent portal active"
              : isAdmin
                ? "Admin access enabled"
                : isApprovedAgent
                  ? "Customer + agent access"
                  : "Customer shopping mode"}
          </p>
        </div>
      </aside>
    </>
  );
}

function NavGroup({
  label,
  links,
  mutedText,
  renderLink,
}: {
  label: string;
  links: NavLink[];
  mutedText: string;
  renderLink: (link: NavLink) => React.ReactNode;
}) {
  return (
    <div>
      <p
        className={`mb-3 hidden whitespace-nowrap px-4 text-xs font-black uppercase tracking-[0.2em] opacity-0 transition-opacity duration-200 lg:group-hover/sidebar:block lg:group-hover/sidebar:opacity-100 ${mutedText}`}
      >
        {label}
      </p>

      <nav className="space-y-2">{links.map(renderLink)}</nav>
    </div>
  );
}