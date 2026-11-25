"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/dashboard/status-badge";

interface TransferItem {
  id: string;
  status: "draft" | "in_transit" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  source?: { name?: string } | Array<{ name?: string }> | null;
  destination?: { name?: string } | Array<{ name?: string }> | null;
  stock_transfer_items?: Array<{
    id: string;
    quantity: number;
    product_variants?: { sku?: string; title?: string } | Array<{ sku?: string; title?: string }> | null;
  }>;
}

export function TransfersClient({
  locations,
  variants,
  transfers,
  canAdjust,
}: {
  locations: Array<{ id: string; name: string }>;
  variants: Array<{ id: string; label: string }>;
  transfers: TransferItem[];
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [sourceId, setSourceId] = React.useState(locations[0]?.id ?? "");
  const [destId, setDestId] = React.useState(locations[1]?.id ?? "");
  const [variantId, setVariantId] = React.useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = React.useState(1);
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/merchant/inventory/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_location_id: sourceId,
          destination_location_id: destId,
          variant_id: variantId,
          quantity: Number(quantity),
          notes: notes.trim() || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Could not dispatch stock transfer.");
        return;
      }
      setNotes("");
      toast.success("Stock transfer dispatched");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmReceipt(transferId: string) {
    const res = await fetch(
      `/api/v1/merchant/inventory/transfers/${transferId}/complete`,
      { method: "POST" }
    );
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload?.detail ?? "Could not complete transfer.");
      return;
    }
    toast.success("Stock received at destination branch");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/inventory"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-soft bg-surface text-charcoal hover:bg-surface-hover"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">
            Branch Stock Transfers
          </h1>
          <p className="text-xs text-muted-ink">
            Move stock between warehouses and retail branches with two-step audit tracking.
          </p>
        </div>
      </div>

      {canAdjust && locations.length >= 2 && variants.length > 0 ? (
        <form
          onSubmit={handleDispatch}
          className="rounded-[14px] border border-soft bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(36,35,33,0.04)] space-y-4"
        >
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-coral" />
            <h2 className="font-display text-base font-semibold text-charcoal">
              Dispatch new stock transfer
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-3 space-y-1">
              <Label className="text-xs">From location</Label>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3 space-y-1">
              <Label className="text-xs">To location</Label>
              <select
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
                className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4 space-y-1">
              <Label className="text-xs">SKU / Variant</Label>
              <select
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
              >
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Quantity</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="h-[40px] rounded-[10px] border-soft bg-surface tabular-nums-npr"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <Input
              placeholder="Transfer note (e.g., Courier dispatch to Pokhara branch)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-[40px] max-w-md rounded-[10px] border-soft bg-surface text-sm"
            />
            <Button
              type="submit"
              disabled={submitting}
              className="h-[40px] rounded-[10px] bg-coral px-5 font-semibold text-white hover:bg-coral-hover"
            >
              {submitting ? "Dispatching..." : "Dispatch transfer"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-[14px] border border-soft bg-surface p-5 text-xs text-muted-ink">
          Add at least two active locations in{" "}
          <Link href="/dashboard/settings" className="font-semibold text-charcoal underline">
            Business Settings
          </Link>{" "}
          to transfer stock between branches.
        </div>
      )}

      {/* Transfers List */}
      <div className="rounded-[14px] border border-soft bg-surface divide-y divide-soft overflow-hidden">
        {transfers.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-muted-ink">
            No branch transfers recorded yet.
          </p>
        ) : (
          transfers.map((tr) => {
            const src = Array.isArray(tr.source) ? tr.source[0] : tr.source;
            const dst = Array.isArray(tr.destination) ? tr.destination[0] : tr.destination;
            const item = tr.stock_transfer_items?.[0];
            const v = Array.isArray(item?.product_variants)
              ? item?.product_variants[0]
              : item?.product_variants;

            return (
              <div
                key={tr.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="text-sm font-semibold text-charcoal">
                    {src?.name ?? "Source"} → {dst?.name ?? "Destination"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-ink">
                    <span className="font-mono">{v?.sku ?? "SKU"}</span> ·{" "}
                    {item?.quantity ?? 0} unit(s)
                    {tr.notes ? ` · ${tr.notes}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <StatusBadge
                    label={tr.status.replace("_", " ")}
                    tone={tr.status === "completed" ? "success" : "warning"}
                  />
                  {canAdjust && tr.status === "in_transit" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleConfirmReceipt(tr.id)}
                      className="h-8 rounded-[8px] bg-charcoal text-xs font-semibold text-ivory"
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Confirm receipt
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
