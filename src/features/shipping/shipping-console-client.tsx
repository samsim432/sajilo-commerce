"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, MapPin, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NprAmountInput } from "@/components/dashboard/commerce-inputs";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatNpr, nprToMinor } from "@/lib/currency/npr";
import type { ShippingZoneConfig } from "@/features/shipping/nepal-shipping-calculator";

interface ShipmentRow {
  id: string;
  courier_provider: string;
  courier_name_custom: string | null;
  tracking_number: string | null;
  status: string;
  is_cod: boolean;
  cod_expected_minor: number;
  cod_collected_minor: number;
  cod_reconciled: boolean;
  created_at: string;
  orders?: {
    id?: string;
    order_number?: string;
    status?: string;
    total_minor?: number;
    customers?: { full_name?: string; phone_e164?: string } | Array<{ full_name?: string; phone_e164?: string }> | null;
  } | Array<{
    id?: string;
    order_number?: string;
    status?: string;
    total_minor?: number;
    customers?: { full_name?: string; phone_e164?: string } | Array<{ full_name?: string; phone_e164?: string }> | null;
  }> | null;
}

export function ShippingConsoleClient({
  zones,
  shipments,
  dispatchableOrders,
  canWriteShipping,
  canReconcileCod,
}: {
  zones: ShippingZoneConfig[];
  shipments: ShipmentRow[];
  dispatchableOrders: Array<{ id: string; label: string; payment_method: string }>;
  canWriteShipping: boolean;
  canReconcileCod: boolean;
}) {
  const router = useRouter();

  // Dispatch Form State
  const [orderId, setOrderId] = React.useState(dispatchableOrders[0]?.id ?? "");
  const [courier, setCourier] = React.useState<
    "pathao" | "ncm" | "sundar" | "upakar" | "self_rider" | "custom"
  >("pathao");
  const [trackingNo, setTrackingNo] = React.useState("");
  const [dispatching, setDispatching] = React.useState(false);

  // COD Batch Reconciliation State
  const unreconciledDeliveredCod = React.useMemo(
    () =>
      shipments.filter(
        (s) => s.is_cod && s.status === "delivered" && !s.cod_reconciled
      ),
    [shipments]
  );
  const [selectedCodIds, setSelectedCodIds] = React.useState<string[]>(() =>
    unreconciledDeliveredCod.map((s) => s.id)
  );
  const [remittedNpr, setRemittedNpr] = React.useState<string>("");
  const [reconciling, setReconciling] = React.useState(false);

  // New Zone Form State
  const [zoneName, setZoneName] = React.useState("");
  const [zoneCode, setZoneCode] = React.useState<
    "inside_valley" | "outside_valley" | "remote_district" | "custom"
  >("inside_valley");
  const [districtsText, setDistrictsText] = React.useState("Kathmandu, Lalitpur, Bhaktapur");
  const [feeNpr, setFeeNpr] = React.useState("100");
  const [savingZone, setSavingZone] = React.useState(false);

  React.useEffect(() => {
    setSelectedCodIds(unreconciledDeliveredCod.map((s) => s.id));
  }, [unreconciledDeliveredCod]);

  const expectedSelectedCodMinor = React.useMemo(() => {
    return unreconciledDeliveredCod
      .filter((s) => selectedCodIds.includes(s.id))
      .reduce((sum, s) => sum + Number(s.cod_expected_minor || 0), 0);
  }, [unreconciledDeliveredCod, selectedCodIds]);

  const pendingCodMinor = React.useMemo(() => {
    return shipments
      .filter((s) => s.is_cod && !s.cod_reconciled)
      .reduce((sum, s) => sum + Number(s.cod_expected_minor || 0), 0);
  }, [shipments]);

  async function handleDispatchShipment(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId) {
      toast.error("Select an order to dispatch.");
      return;
    }
    setDispatching(true);
    try {
      const res = await fetch("/api/v1/merchant/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          courier_provider: courier,
          tracking_number: trackingNo.trim() || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Could not dispatch shipment.");
        return;
      }
      setTrackingNo("");
      toast.success("Shipment dispatched & order marked shipped");
      router.refresh();
    } finally {
      setDispatching(false);
    }
  }

  async function handleShipmentStatus(
    shipmentId: string,
    nextStatus: "delivered" | "returned_to_origin"
  ) {
    const res = await fetch(`/api/v1/merchant/shipments/${shipmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload?.detail ?? "Could not update shipment status.");
      return;
    }
    toast.success(
      nextStatus === "delivered"
        ? "Shipment marked delivered"
        : "Shipment marked returned to origin"
    );
    router.refresh();
  }

  async function handleReconcileCod(e: React.FormEvent) {
    e.preventDefault();
    if (selectedCodIds.length === 0) {
      toast.error("Select at least one delivered COD shipment.");
      return;
    }
    const remittedMinor = nprToMinor(remittedNpr);
    if (remittedMinor === null) {
      toast.error("Enter a valid remitted NPR amount.");
      return;
    }

    setReconciling(true);
    try {
      const res = await fetch("/api/v1/merchant/cod-reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courier_provider: courier,
          shipment_ids: selectedCodIds,
          remitted_total_minor: remittedMinor,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "COD reconciliation failed.");
        return;
      }
      setRemittedNpr("");
      toast.success(`COD Batch ${payload.data.batch_reference} reconciled`);
      router.refresh();
    } finally {
      setReconciling(false);
    }
  }

  async function handleCreateZone(e: React.FormEvent) {
    e.preventDefault();
    const feeMinor = nprToMinor(feeNpr);
    if (feeMinor === null) {
      toast.error("Enter a valid NPR delivery fee.");
      return;
    }
    setSavingZone(true);
    try {
      const districts = districtsText
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      const res = await fetch("/api/v1/merchant/shipping/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: zoneName.trim(),
          zone_code: zoneCode,
          districts,
          flat_fee_minor: feeMinor,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Could not save zone.");
        return;
      }
      setZoneName("");
      toast.success("Nepal shipping zone saved");
      router.refresh();
    } finally {
      setSavingZone(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-charcoal">
          Shipping, Couriers &amp; COD Reconciliation
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Dispatch Pathao/NCM/Sundar parcels, configure Nepal zone rates, and settle COD cash.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Active Shipments"
          value={String(shipments.filter((s) => s.status !== "delivered").length)}
          deltaLabel="In transit / rider"
          deltaTone="info"
          icon={<Truck className="h-4 w-4" />}
        />
        <KpiCard
          label="Unreconciled COD"
          value={formatNpr(pendingCodMinor)}
          deltaLabel={`${unreconciledDeliveredCod.length} delivered ready`}
          deltaTone="warning"
          icon={<Wallet className="h-4 w-4" />}
        />
        <KpiCard
          label="Shipping Zones"
          value={String(zones.length)}
          deltaLabel="Nepal districts"
          deltaTone="neutral"
          icon={<MapPin className="h-4 w-4" />}
        />
      </div>

      {/* Dispatch Form + COD Batch Reconciliation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {canWriteShipping && (
          <form
            onSubmit={handleDispatchShipment}
            className="rounded-[14px] border border-soft bg-surface p-5 space-y-4 shadow-[0_1px_2px_rgba(36,35,33,0.04)]"
          >
            <h2 className="font-display text-base font-semibold text-charcoal">
              Dispatch order to courier
            </h2>

            <div className="space-y-1">
              <Label className="text-xs">Order</Label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
              >
                {dispatchableOrders.length === 0 ? (
                  <option value="">No orders available</option>
                ) : (
                  dispatchableOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Courier</Label>
                <select
                  value={courier}
                  onChange={(e) =>
                    setCourier(
                      e.target.value as
                        | "pathao"
                        | "ncm"
                        | "sundar"
                        | "upakar"
                        | "self_rider"
                        | "custom"
                    )
                  }
                  className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
                >
                  <option value="pathao">Pathao Parcel</option>
                  <option value="ncm">Nepal Can Move (NCM)</option>
                  <option value="sundar">Sundar Courier</option>
                  <option value="upakar">Upakar</option>
                  <option value="self_rider">In-house Rider</option>
                  <option value="custom">Custom Courier</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tracking / AWB #</Label>
                <Input
                  value={trackingNo}
                  onChange={(e) => setTrackingNo(e.target.value)}
                  placeholder="e.g., NCM-884920"
                  className="h-[40px] rounded-[10px] border-soft bg-surface"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={dispatching || !orderId}
              className="h-[40px] rounded-[10px] bg-coral px-5 font-semibold text-white hover:bg-coral-hover"
            >
              {dispatching ? "Dispatching..." : "Dispatch shipment"}
            </Button>
          </form>
        )}

        {canReconcileCod && (
          <form
            onSubmit={handleReconcileCod}
            className="rounded-[14px] border border-soft bg-surface p-5 space-y-4 shadow-[0_1px_2px_rgba(36,35,33,0.04)]"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-charcoal">
                Reconcile delivered COD batch
              </h2>
              <span className="text-xs font-semibold text-charcoal tabular-nums-npr">
                Expected: {formatNpr(expectedSelectedCodMinor)}
              </span>
            </div>

            {unreconciledDeliveredCod.length === 0 ? (
              <p className="text-xs text-muted-ink py-3">
                No delivered, unreconciled COD shipments waiting for cash settlement.
              </p>
            ) : (
              <div className="max-h-36 overflow-y-auto divide-y divide-soft rounded-[10px] border border-soft px-3">
                {unreconciledDeliveredCod.map((s) => {
                  const ord = Array.isArray(s.orders) ? s.orders[0] : s.orders;
                  const checked = selectedCodIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center justify-between py-2 text-xs cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedCodIds((prev) =>
                              e.target.checked
                                ? [...prev, s.id]
                                : prev.filter((x) => x !== s.id)
                            );
                          }}
                        />
                        <span className="font-mono font-semibold">
                          {ord?.order_number ?? s.id.slice(0, 8)}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums-npr">
                        {formatNpr(Number(s.cod_expected_minor))}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Remitted Cash Received (NPR)</Label>
              <NprAmountInput
                value={remittedNpr}
                onValueChange={setRemittedNpr}
                placeholder="0.00"
              />
            </div>

            <Button
              type="submit"
              disabled={reconciling || unreconciledDeliveredCod.length === 0}
              className="h-[40px] rounded-[10px] bg-charcoal px-5 font-semibold text-ivory"
            >
              {reconciling ? "Reconciling..." : "Settle COD batch"}
            </Button>
          </form>
        )}
      </div>

      {/* Shipments Feed */}
      <div className="rounded-[14px] border border-soft bg-surface overflow-hidden shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
        <div className="border-b border-soft bg-sand/40 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-ink">
            Courier Shipments
          </h2>
        </div>

        {shipments.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-muted-ink">
            No shipments created yet.
          </p>
        ) : (
          <div className="divide-y divide-soft">
            {shipments.map((s) => {
              const ord = Array.isArray(s.orders) ? s.orders[0] : s.orders;
              const cust = ord
                ? Array.isArray(ord.customers)
                  ? ord.customers[0]
                  : ord.customers
                : null;
              return (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-charcoal">
                        {ord?.order_number ?? "Order"}
                      </span>
                      <StatusBadge
                        label={s.status.replaceAll("_", " ")}
                        tone={s.status === "delivered" ? "success" : "info"}
                      />
                      <span className="text-xs uppercase font-semibold text-muted-ink">
                        {s.courier_provider}
                      </span>
                      {s.tracking_number && (
                        <span className="font-mono text-xs text-charcoal">
                          #{s.tracking_number}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-ink">
                      {cust?.full_name ?? "Buyer"} ·{" "}
                      {s.is_cod
                        ? `COD ${formatNpr(Number(s.cod_expected_minor))} (${
                            s.cod_reconciled ? "Settled" : "Pending COD"
                          })`
                        : "Prepaid / Non-COD"}
                    </p>
                  </div>

                  {canWriteShipping &&
                    s.status !== "delivered" &&
                    s.status !== "returned_to_origin" && (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleShipmentStatus(s.id, "delivered")}
                          className="h-8 rounded-[8px] bg-charcoal text-xs font-semibold text-ivory"
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Delivered
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleShipmentStatus(s.id, "returned_to_origin")
                          }
                          className="h-8 rounded-[8px] border-soft text-xs"
                        >
                          RTO Return
                        </Button>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Nepal Shipping Zones */}
      <div className="rounded-[14px] border border-soft bg-surface p-5 space-y-4">
        <h2 className="font-display text-base font-semibold text-charcoal">
          Nepal Delivery Zones &amp; Rates
        </h2>

        {zones.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {zones.map((z) => {
              const rate = z.rates[0];
              return (
                <div
                  key={z.id}
                  className="rounded-[12px] border border-soft bg-ivory/60 p-4 space-y-1"
                >
                  <p className="text-sm font-bold text-charcoal">{z.name}</p>
                  <p className="text-xs font-semibold text-coral tabular-nums-npr">
                    {rate ? formatNpr(Number(rate.flat_fee_minor)) : "NPR 100"}
                  </p>
                  <p className="text-[11px] text-muted-ink">
                    {z.districts.length > 0
                      ? z.districts.join(", ")
                      : z.zone_code.replace("_", " ")}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {canWriteShipping && (
          <form
            onSubmit={handleCreateZone}
            className="grid grid-cols-1 sm:grid-cols-12 gap-3 border-t border-soft pt-4"
          >
            <div className="sm:col-span-3 space-y-1">
              <Label className="text-xs">Zone name</Label>
              <Input
                required
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="e.g., Kathmandu Valley"
                className="h-[40px] rounded-[10px] border-soft bg-surface"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Type</Label>
              <select
                value={zoneCode}
                onChange={(e) =>
                  setZoneCode(
                    e.target.value as
                      | "inside_valley"
                      | "outside_valley"
                      | "remote_district"
                      | "custom"
                  )
                }
                className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-2.5 text-xs"
              >
                <option value="inside_valley">Inside Valley</option>
                <option value="outside_valley">Outside Valley</option>
                <option value="remote_district">Remote</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="sm:col-span-4 space-y-1">
              <Label className="text-xs">Districts (comma-separated)</Label>
              <Input
                value={districtsText}
                onChange={(e) => setDistrictsText(e.target.value)}
                className="h-[40px] rounded-[10px] border-soft bg-surface text-xs"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Flat Fee (NPR)</Label>
              <NprAmountInput
                value={feeNpr}
                onValueChange={setFeeNpr}
                placeholder="100"
              />
            </div>
            <div className="sm:col-span-1 flex items-end">
              <Button
                type="submit"
                disabled={savingZone}
                className="h-[40px] w-full rounded-[10px] bg-coral text-xs font-semibold text-white hover:bg-coral-hover"
              >
                Add
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
