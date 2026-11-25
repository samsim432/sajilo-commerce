"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChevronsUpDown,
  CreditCard,
  ExternalLink,
  Globe,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  Users,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasPermission, type Permission } from "@/lib/security/rbac";
import type { ActiveWorkspace } from "@/features/auth/workspace";

interface NavItem {
  href: string;
  labelEn: string;
  labelNe: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
  mobilePrimary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelEn: "Overview", labelNe: "अवलोकन", icon: LayoutDashboard, mobilePrimary: true },
  { href: "/dashboard/orders", labelEn: "Orders", labelNe: "अर्डरहरू", icon: ShoppingBag, permission: "orders:read", mobilePrimary: true },
  { href: "/dashboard/products", labelEn: "Products", labelNe: "सामानहरू", icon: Package, permission: "products:read", mobilePrimary: true },
  { href: "/dashboard/inventory", labelEn: "Inventory", labelNe: "स्टक", icon: Boxes, permission: "inventory:read", mobilePrimary: true },
  { href: "/dashboard/customers", labelEn: "Customers", labelNe: "ग्राहकहरू", icon: UserCheck, permission: "customers:read" },
  { href: "/dashboard/payments", labelEn: "Payments & COD", labelNe: "भुक्तानी र COD", icon: CreditCard, permission: "payments:read" },
  { href: "/dashboard/store/builder", labelEn: "Online Store", labelNe: "अनलाइन स्टोर", icon: Globe, permission: "store:read" },
  { href: "/dashboard/analytics", labelEn: "Analytics", labelNe: "विश्लेषण", icon: BarChart3, permission: "analytics:sales" },
  { href: "/dashboard/team", labelEn: "Team", labelNe: "टोली", icon: Users, permission: "team:read" },
  { href: "/dashboard/settings", labelEn: "Settings", labelNe: "सेटिङ्स", icon: Settings, permission: "settings:read", mobilePrimary: true },
];

export function DashboardShell({
  workspace,
  children,
}: {
  workspace: ActiveWorkspace;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [locale, setLocale] = React.useState<"en" | "ne">(workspace.business.default_locale);
  const [switching, setSwitching] = React.useState(false);

  const visibleNav = NAV_ITEMS.filter((item) =>
    item.permission ? hasPermission(workspace.role, item.permission) : true
  );
  const mobileNav = visibleNav.filter((item) => item.mobilePrimary).slice(0, 5);

  async function handleSwitchBusiness(businessId: string) {
    if (businessId === workspace.business.id || switching) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/v1/merchant/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId }),
      });
      if (!res.ok) {
        toast.error("Unable to switch workspace.");
        return;
      }
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActiveRoute(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen bg-ivory text-charcoal flex">
      {/* Desktop Left Sidebar (260px fixed) */}
      <aside className="hidden lg:flex lg:w-[260px] lg:flex-col lg:fixed lg:inset-y-0 border-r border-soft bg-ivory px-3.5 py-4">
        {/* Brand + Workspace Switcher */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-2">
            <span className="font-display text-sm font-bold tracking-tight text-charcoal">
              Sajilo Commerce
            </span>
            <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-semibold uppercase text-charcoal">
              {workspace.role}
            </span>
          </div>

          <div className="relative">
            <select
              aria-label="Switch active business"
              disabled={switching}
              value={workspace.business.id}
              onChange={(e) => handleSwitchBusiness(e.target.value)}
              className="h-[42px] w-full appearance-none rounded-[10px] border border-soft bg-surface pl-3 pr-8 text-sm font-semibold text-charcoal shadow-[0_1px_2px_rgba(36,35,33,0.03)] focus:border-coral focus:outline-none"
            >
              {workspace.allBusinesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </select>
            <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-muted-ink" />
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="mt-5 flex-1 space-y-1 overflow-y-auto" aria-label="Dashboard navigation">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = isActiveRoute(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-coral-tint font-semibold text-charcoal"
                    : "font-medium text-muted-ink hover:bg-surface-hover hover:text-charcoal"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-coral" : "text-muted-ink"
                  )}
                />
                <span>{locale === "ne" ? item.labelNe : item.labelEn}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Workspace Actions */}
        <div className="mt-4 space-y-1.5 border-t border-soft pt-3">
          <Link
            href="/dashboard/onboarding"
            className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-xs font-medium text-muted-ink hover:bg-surface-hover hover:text-charcoal"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New business workspace</span>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-xs font-medium text-muted-ink hover:bg-danger-bg hover:text-danger-fg transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex flex-1 flex-col lg:pl-[260px]">
        {/* Top Utility Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-soft bg-ivory/95 px-4 sm:px-6 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0">
            <span className="lg:hidden font-display text-sm font-bold text-charcoal truncate">
              {workspace.business.name}
            </span>
            <button
              type="button"
              onClick={() => toast.info("Quick search (Cmd+K) connects to Orders, SKUs & Phones in Phase 5 & 10.")}
              className="hidden sm:inline-flex h-9 w-64 items-center justify-between rounded-[10px] border border-soft bg-surface px-3 text-xs text-muted-ink hover:border-strong"
            >
              <span className="inline-flex items-center gap-2">
                <Search className="h-3.5 w-3.5" />
                Search orders, SKUs, +977...
              </span>
              <kbd className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10px] text-charcoal">
                Ctrl K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Bilingual EN / NE Toggle */}
            <div className="inline-flex rounded-[10px] border border-soft bg-surface p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setLocale("en")}
                className={cn(
                  "rounded-[8px] px-2.5 py-1 font-medium transition-colors",
                  locale === "en" ? "bg-coral text-white" : "text-muted-ink hover:text-charcoal"
                )}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLocale("ne")}
                className={cn(
                  "rounded-[8px] px-2.5 py-1 font-medium transition-colors",
                  locale === "ne" ? "bg-coral text-white" : "text-muted-ink hover:text-charcoal"
                )}
              >
                नेपाली
              </button>
            </div>

            <a
              href={`http://${workspace.business.slug}.localhost:3000`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-soft bg-surface px-3 text-xs font-medium text-charcoal hover:bg-surface-hover"
            >
              <span className="hidden sm:inline">View store</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-ink" />
            </a>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 pb-24 sm:px-6 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile dashboard navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-soft bg-surface/95 px-2 py-1.5 backdrop-blur lg:hidden"
      >
        {mobileNav.map((item) => {
          const Icon = item.icon;
          const active = isActiveRoute(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-[10px] px-3 py-1.5 text-[11px] font-medium",
                active ? "text-coral font-semibold" : "text-muted-ink"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{locale === "ne" ? item.labelNe : item.labelEn}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
