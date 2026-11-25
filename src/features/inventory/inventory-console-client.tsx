"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Boxes, History, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import type { InventoryBalanceRow } from "@/features/inventory/inventory-service";

interface MovementRow {
  id: string;
  movement_type: string;
  quantity_delta: number;
  reserved_delta: number;
  on_hand_after: number;
  reserved_after: number;
  reason: string | null;
  created_at: string;
  locations?: { name?: string } | Array<{ name?: string }> | null;
  product_variants?: { sku?: string; title?: string } | Array<{ sku?: string; title?: string }> | null;
}

export function InventoryConsoleClient({
  locations,
  balances,
  lowStockCount,
  movements,
  canAdjust,
}: {
  locations: Array<{ id: string; name: string; is_default: boolean }>;
  balances: InventoryBalanceRow[];
  lowStockCount: number;
  movements: MovementRow[];
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [selectedLocation, setSelectedLocation] = React.useState<string>("all");
  const [onlyLowStock, setOnlyLowStock] = React.useState(false);

  // Adjustment Form State
  const defaultLocId = locations[0]?.id ?? "";
  const [adjLocationId, setAdjLocationId] = React.useState<string>(defaultLocId);
  const [adjVariantId, setAdjVariantId] = React.useState<string>(
    balances[0]?.variant_id ?? ""
  );
  const [adjDelta, setAdjDelta] = React.useState<number>(10);
  const [adjReason, setAdjReason] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);

  const uniqueVariants = React.useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const row of balances) {
      if (!map.has(row.variant_id)) {
        map.set(row.variant_id, {
          id: row.variant_id,
          label: `${row.sku} — ${row.product_title} (${row.variant_title})`,
        });
      }
    }
    return Array.from(map.values());
  }, [balances]);

  const filteredBalances = React.useMemo(() => {
    return balances.filter((b) => {
      const locMatch =
        selectedLocation === "all" || b.location_id === selectedLocation;
      const lowMatch = !onlyLowStock || b.is_low_stock;
      return locMatch && lowMatch;
    });
  }, [balances, selectedLocation, onlyLowStock]);

  const totalOnHand = filteredBalances.reduce(
    (sum, r) => sum + r.on_hand_quantity,
    0
  );
  const totalReserved = filteredBalances.reduce(
    (sum, r) => sum + r.reserved_quantity,
    0
  );
  const totalAvailable = filteredBalances.reduce(
    (sum, r) => sum + r.available_quantity,
    0
  );

  async function handleAdjustSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adjLocationId || !adjVariantId) {
      toast.error("Select both a location and a variant.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/merchant/inventory/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: adjLocationId,
          variant_id: adjVariantId,
          quantity_delta: Number(adjDelta),
          reason: adjReason.trim(),
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Could not adjust stock.");
        return;
      }

      setAdjReason("");
      toast.success("Stock adjusted & recorded in immutable ledger");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">
            Inventory &amp; Stock Ledger
          </h1>
          <p className="mt-1 text-sm text-muted-ink">
            Track on-hand, reserved, and available stock across branches with full audit history.
          </p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Available to Sell"
          value={String(totalAvailable)}
          deltaLabel="On Hand − Reserved"
          deltaTone="success"
          icon={<Boxes className="h-4 w-4" />}
        />
        <KpiCard
          label="On Hand Units"
          value={String(totalOnHand)}
          deltaLabel="Physical stock"
          deltaTone="neutral"
        />
        <KpiCard
          label="Reserved for Orders"
          value={String(totalReserved)}
          deltaLabel="Row-locked"
          deltaTone="info"
        />
        <KpiCard
          label="Low-Stock Alerts"
          value={String(lowStockCount)}
          deltaLabel={lowStockCount > 0 ? "Needs restock" : "Healthy"}
          deltaTone={lowStockCount > 0 ? "warning" : "success"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {/* Quick Stock Adjustment Form */}
      {canAdjust && uniqueVariants.length > 0 && (
        <form
          onSubmit={handleAdjustSubmit}
          className="rounded-[14px] border border-soft bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(36,35,33,0.04)] space-y-4"
        >
          <div className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-coral" />
            <h2 className="font-display text-base font-semibold text-charcoal">
              Record stock adjustment
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-3 space-y-1">
              <Label htmlFor="adj-loc" className="text-xs">
                Location
              </Label>
              <select
                id="adj-loc"
                value={adjLocationId}
                onChange={(e) => setAdjLocationId(e.target.value)}
                className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm text-charcoal"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4 space-y-1">
              <Label htmlFor="adj-var" className="text-xs">
                SKU / Variant
              </Label>
              <select
                id="adj-var"
                value={adjVariantId}
                onChange={(e) => setAdjVariantId(e.target.value)}
                className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm text-charcoal"
              >
                {uniqueVariants.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="adj-delta" className="text-xs">
                Delta (+ / −)
              </Label>
              <Input
                id="adj-delta"
                type="number"
                value={adjDelta}
                onChange={(e) => setAdjDelta(Number(e.target.value) || 0)}
                className="h-[40px] rounded-[10px] border-soft bg-surface tabular-nums-npr"
              />
            </div>

            <div className="sm:col-span-3 space-y-1">
              <Label htmlFor="adj-reason" className="text-xs">
                Reason (required)
              </Label>
              <Input
                id="adj-reason"
                required
                placeholder="e.g., New batch arrival or damaged unit"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                className="h-[40px] rounded-[10px] border-soft bg-surface text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              className="h-[40px] rounded-[10px] bg-coral px-5 font-semibold text-white hover:bg-coral-hover"
            >
              {submitting ? "Saving..." : "Apply adjustment"}
            </Button>
          </div>
        </form>
      )}

      {/* Balances Table */}
      <div className="rounded-[14px] border border-soft bg-surface overflow-hidden shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-soft bg-sand/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by location"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="h-8 rounded-[8px] border border-soft bg-surface px-2.5 text-xs font-medium text-charcoal"
            >
              <option value="all">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setOnlyLowStock((prev) => !prev)}
              className={`h-8 rounded-[8px] border px-3 text-xs font-medium transition-colors ${
                onlyLowStock
                  ? "border-warning-border bg-warning-bg text-warning-fg"
                  : "border-soft bg-surface text-muted-ink hover:text-charcoal"
              }`}
            >
              Low stock only ({lowStockCount})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-soft text-xs font-semibold uppercase tracking-[0.04em] text-muted-ink">
                <th className="px-4 py-3">SKU &amp; Item</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-right">On Hand</th>
                <th className="px-4 py-3 text-right">Reserved</th>
                <th className="px-4 py-3 text-right">Available</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-soft text-sm">
              {filteredBalances.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-ink">
                    No inventory tracked yet. Create an active product with inventory tracking enabled first.
                  </td>
                </tr>
              ) : (
                filteredBalances.map((row) => (
                  <tr
                    key={`${row.location_id}-${row.variant_id}`}
                    className="hover:bg-surface-hover/70"
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-charcoal">
                        {row.sku}
                      </p>
                      <p className="text-xs text-muted-ink">
                        {row.product_title} · {row.variant_title}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal">
                      {row.location_name}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-charcoal tabular-nums-npr">
                      {row.on_hand_quantity}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-ink tabular-nums-npr">
                      {row.reserved_quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-charcoal tabular-nums-npr">
                      {row.available_quantity}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={row.is_low_stock ? "Low Stock" : "In Stock"}
                        tone={row.is_low_stock ? "warning" : "success"}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Immutable Stock Movement Ledger */}
      <div className="rounded-[14px] border border-soft bg-surface overflow-hidden shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
        <div className="flex items-center gap-2 border-b border-soft bg-sand/40 px-4 py-3">
          <History className="h-4 w-4 text-muted-ink" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-ink">
            Recent Stock Movement Ledger (Append-Only)
          </h2>
        </div>

        <div className="divide-y divide-soft text-xs">
          {movements.length === 0 ? (
            <p className="px-4 py-6 text-center text-muted-ink">
              No stock movements recorded yet.
            </p>
          ) : (
            movements.map((m) => {
              const loc = Array.isArray(m.locations) ? m.locations[0] : m.locations;
              const v = Array.isArray(m.product_variants)
                ? m.product_variants[0]
                : m.product_variants;
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-charcoal">
                      <span className="font-mono">{v?.sku ?? "SKU"}</span> ·{" "}
                      <span className="capitalize">{m.movement_type.replaceAll("_", " ")}</span>{" "}
                      <span className="text-muted-ink">({loc?.name ?? "Branch"})</span>
                    </p>
                    <p className="text-muted-ink mt-0.5">
                      {m.reason || "No note"} · On hand after:{" "}
                      <span className="font-semibold text-charcoal tabular-nums-npr">
                        {m.on_hand_after}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-mono font-semibold tabular-nums-npr ${
                      m.quantity_delta >= 0
                        ? "bg-success-bg text-success-fg"
                        : "bg-danger-bg text-danger-fg"
                    }`}
                  >
                    {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
