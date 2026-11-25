import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Clock,
  PackagePlus,
  Settings,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { formatNpr } from "@/lib/currency/npr";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StatusBadge } from "@/components/dashboard/status-badge";

export default async function DashboardOverviewPage() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }

  const dict = getDictionary(workspace.business.default_locale);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold text-charcoal">
              {dict.overviewTitle}
            </h1>
            <StatusBadge label="Workspace Active" tone="success" />
          </div>
          <p className="mt-1 text-sm text-muted-ink">
            {workspace.business.name} · {workspace.business.slug}.sajilocommerce.com
          </p>
        </div>

        <Link
          href="/dashboard/products"
          className="inline-flex h-[40px] items-center justify-center gap-1.5 rounded-[10px] bg-coral px-4 text-sm font-semibold text-white hover:bg-coral-hover transition-colors"
        >
          <PackagePlus className="h-4 w-4" />
          <span>{dict.addFirstProduct}</span>
        </Link>
      </div>

      {/* Top 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label={dict.todaysSales}
          value={formatNpr(0)}
          deltaLabel="Ready"
          deltaTone="neutral"
          helperText="Updates live as orders confirm"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label={dict.monthlyOrders}
          value="0"
          deltaLabel="All channels"
          deltaTone="info"
          helperText="Web, Instagram, Facebook & WhatsApp"
          icon={<ShoppingBag className="h-4 w-4" />}
        />
        <KpiCard
          label={dict.pendingAttention}
          value="0"
          deltaLabel="0 awaiting verify"
          deltaTone="warning"
          helperText="New & pending bank transfers"
          icon={<Clock className="h-4 w-4" />}
        />
        <KpiCard
          label={dict.unsettledCod}
          value={formatNpr(0)}
          deltaLabel="NPR 0 due"
          deltaTone="neutral"
          helperText="Courier COD cash reconciliation"
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      {/* Onboarding & Next Milestones */}
      <div className="rounded-[14px] border border-soft bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
        <h2 className="font-display text-base font-semibold text-charcoal">
          {dict.quickActions}
        </h2>
        <p className="mt-1 text-xs text-muted-ink">
          Your multi-tenant workspace, default branch location, and role permissions are active.
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <Link
            href="/dashboard/products"
            className="group flex items-start justify-between rounded-[12px] border border-soft bg-ivory/70 p-4 hover:border-coral hover:bg-coral-tint/40 transition-colors"
          >
            <div className="space-y-1">
              <PackagePlus className="h-4 w-4 text-coral" />
              <p className="text-sm font-semibold text-charcoal">
                {dict.addFirstProduct}
              </p>
              <p className="text-xs text-muted-ink">
                Coming in Phase 3: multi-variant catalogue &amp; SKUs.
              </p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-ink group-hover:text-charcoal" />
          </Link>

          <Link
            href="/dashboard/team"
            className="group flex items-start justify-between rounded-[12px] border border-soft bg-ivory/70 p-4 hover:border-coral hover:bg-coral-tint/40 transition-colors"
          >
            <div className="space-y-1">
              <Users className="h-4 w-4 text-coral" />
              <p className="text-sm font-semibold text-charcoal">
                {dict.inviteTeam}
              </p>
              <p className="text-xs text-muted-ink">
                Assign Warehouse, Accountant, Staff, or Manager roles.
              </p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-ink group-hover:text-charcoal" />
          </Link>

          <Link
            href="/dashboard/settings"
            className="group flex items-start justify-between rounded-[12px] border border-soft bg-ivory/70 p-4 hover:border-coral hover:bg-coral-tint/40 transition-colors"
          >
            <div className="space-y-1">
              <Settings className="h-4 w-4 text-coral" />
              <p className="text-sm font-semibold text-charcoal">
                {dict.configureSettings}
              </p>
              <p className="text-xs text-muted-ink">
                Manage branches, support +977 phone, and PAN/VAT details.
              </p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-ink group-hover:text-charcoal" />
          </Link>
        </div>
      </div>
    </div>
  );
}
