"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileClock,
  FileText,
  LayoutDashboard,
  Menu,
  Plus,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/login/actions";

export type NavigationAccess = {
  signedIn: boolean;
  role?: "admin" | "agent" | "client";
  status?: "active" | "pending" | "inactive";
  displayName?: string;
  unreadAlerts: number;
  isAdmin: boolean;
  isAgent: boolean;
};

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
};

function isCurrentPath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLink({
  item,
  compact,
  onNavigate,
}: {
  item: NavigationItem;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isCurrentPath(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      className={`group relative flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors ${
        active ? "bg-[#dff3ef] text-[#0f5f59]" : "text-[#405047] hover:bg-[#eef3ef] hover:text-[#18211d]"
      }`}
      href={item.href}
      onClick={onNavigate}
      title={compact ? item.label : undefined}
      aria-current={active ? "page" : undefined}
    >
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.9} />
      {!compact ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
      {!compact && item.count ? (
        <span className="min-w-6 rounded-full bg-[#0f766e] px-1.5 py-0.5 text-center text-xs font-bold text-white">
          {item.count > 99 ? "99+" : item.count}
        </span>
      ) : null}
      {compact && item.count ? (
        <span className="absolute ml-4 mt-[-22px] h-2.5 w-2.5 rounded-full border-2 border-white bg-[#0f766e]" />
      ) : null}
    </Link>
  );
}

function NavigationGroup({
  label,
  items,
  compact,
  onNavigate,
}: {
  label: string;
  items: NavigationItem[];
  compact: boolean;
  onNavigate?: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="grid gap-1">
      {!compact ? <p className="px-3 pb-1 pt-3 text-xs font-bold uppercase text-[#7a8781]">{label}</p> : null}
      {compact ? <div className="my-2 border-t border-[#dce2dc]" /> : null}
      {items.map((item) => (
        <NavigationLink compact={compact} item={item} key={`${label}-${item.href}`} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function buildNavigation(access: NavigationAccess) {
  const workspace: NavigationItem[] = [];
  const planning: NavigationItem[] = [];
  const administration: NavigationItem[] = [];
  const account: NavigationItem[] = [];

  if (access.signedIn) {
    workspace.push({ href: "/", label: "Dashboard", icon: LayoutDashboard });
    if (access.isAdmin || access.isAgent) {
      planning.push(
        { href: "/customers", label: "Customers", icon: Users },
        { href: "/reviews", label: "Reviews", icon: ClipboardCheck },
        { href: "/customers/new", label: "Add Customer", icon: Plus },
      );
    }
    if (access.status === "active") {
      planning.push({ href: "/my-plan", label: "My Plan", icon: FileText });
    }
    workspace.push(
      { href: "/calculator", label: "Calculator", icon: Calculator },
      { href: "/notifications", label: "Alerts", icon: Bell, count: access.unreadAlerts },
    );
    account.push({ href: "/profile", label: "Profile", icon: UserRound });
  } else {
    workspace.push({ href: "/calculator", label: "Calculator", icon: Calculator });
  }

  if (access.isAdmin) {
    administration.push(
      { href: "/admin/access", label: "Access & Reviews", icon: ShieldCheck },
      { href: "/admin/privacy", label: "Privacy & Retention", icon: Scale },
      { href: "/admin/audit", label: "Audit Log", icon: FileClock },
      { href: "/admin/operations", label: "Operations", icon: SlidersHorizontal },
    );
  }

  account.push(
    { href: "/privacy", label: "Privacy", icon: ShieldCheck },
    { href: "/terms", label: "Terms", icon: FileText },
  );

  return { workspace, planning, administration, account };
}

function SidebarContent({
  access,
  compact,
  onNavigate,
}: {
  access: NavigationAccess;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const navigation = buildNavigation(access);
  return (
    <>
      <div className={`flex h-16 items-center border-b border-[#dce2dc] ${compact ? "justify-center px-2" : "px-5"}`}>
        <Link className="flex items-center gap-3 font-bold" href="/" onClick={onNavigate} title={compact ? "CFP Planning" : undefined}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#0f766e] text-sm text-white">CFP</span>
          {!compact ? <span className="text-lg">CFP Planning</span> : null}
        </Link>
      </div>
      <nav className="grid flex-1 content-start gap-1 overflow-y-auto p-3" aria-label="Primary navigation">
        <NavigationGroup compact={compact} items={navigation.workspace} label="Workspace" onNavigate={onNavigate} />
        <NavigationGroup compact={compact} items={navigation.planning} label="Planning" onNavigate={onNavigate} />
        <NavigationGroup compact={compact} items={navigation.administration} label="Administration" onNavigate={onNavigate} />
        <NavigationGroup compact={compact} items={navigation.account} label="Account" onNavigate={onNavigate} />
      </nav>
      {access.signedIn ? (
        <div className="border-t border-[#dce2dc] p-3">
          {!compact ? (
            <Link className="mb-2 block rounded-md px-3 py-2 hover:bg-[#eef3ef]" href="/profile" onClick={onNavigate}>
              <p className="truncate text-sm font-bold">{access.displayName}</p>
              <p className="text-xs capitalize text-[#68756f]">{access.role}</p>
            </Link>
          ) : null}
          <form action={signOut}>
            <button className={`btn btn-secondary w-full ${compact ? "px-2 text-xs" : ""}`} type="submit" title={compact ? "Sign out" : undefined}>
              {compact ? "Exit" : "Sign Out"}
            </button>
          </form>
        </div>
      ) : (
        <div className="border-t border-[#dce2dc] p-3">
          <Link className="btn w-full" href="/login" onClick={onNavigate}>Sign In</Link>
        </div>
      )}
    </>
  );
}

export function NavigationShell({
  access,
  children,
}: {
  access: NavigationAccess;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const stored = window.localStorage.getItem("cfp-navigation-compact");
    setCompact(stored === "true");
  }, []);

  function toggleCompact() {
    setCompact((current) => {
      const next = !current;
      window.localStorage.setItem("cfp-navigation-compact", String(next));
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-[#f7f8f5] lg:flex">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-[#dce2dc] bg-white transition-[width] duration-200 lg:flex lg:flex-col ${
          compact ? "w-[76px]" : "w-64"
        }`}
      >
        <SidebarContent access={access} compact={compact} />
        <button
          className="absolute -right-3 top-20 flex h-7 w-7 items-center justify-center rounded-full border border-[#dce2dc] bg-white text-[#53625b] shadow-sm hover:bg-[#eef3ef]"
          type="button"
          onClick={toggleCompact}
          title={compact ? "Expand navigation" : "Collapse navigation"}
          aria-label={compact ? "Expand navigation" : "Collapse navigation"}
        >
          {compact ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/35" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
          <aside className="relative flex h-full w-[min(86vw,320px)] flex-col bg-white shadow-xl">
            <button
              className="absolute right-3 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-md hover:bg-[#eef3ef]"
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent access={access} compact={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[#dce2dc] bg-white/95 backdrop-blur lg:hidden">
          <div className="flex h-16 items-center justify-between gap-3 px-4">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-md border border-[#dce2dc] hover:bg-[#eef3ef]"
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link className="font-bold" href="/">CFP Planning</Link>
            {access.signedIn ? (
              <Link className="relative flex h-10 w-10 items-center justify-center rounded-md hover:bg-[#eef3ef]" href="/notifications" aria-label="Alerts">
                <Bell className="h-5 w-5" />
                {access.unreadAlerts ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#0f766e]" /> : null}
              </Link>
            ) : <span className="h-10 w-10" />}
          </div>
        </header>

        <main className="w-full flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-7xl">
            {access.signedIn && access.status !== "active" ? (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                Your account is waiting for admin approval. You can sign out or ask the admin to activate your role.
              </div>
            ) : null}
            {children}
          </div>
        </main>
        <footer className="border-t border-[#dce2dc] bg-white">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-[#68756f] sm:px-6">
            <span>CFP Planning workspace</span>
            <div className="flex gap-4">
              <Link className="font-semibold hover:text-[#0f766e]" href="/privacy">Privacy</Link>
              <Link className="font-semibold hover:text-[#0f766e]" href="/terms">Terms</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
