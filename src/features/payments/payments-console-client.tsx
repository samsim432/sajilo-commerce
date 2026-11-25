"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpenCheck, CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatNpr } from "@/lib/currency/npr";

interface PaymentConfigRow {
  id: string;
  gateway: string;
  is_enabled: boolean;
  is_sandbox: boolean;
  merchant_identifier: string | null;
  account_title: string | null;
  instructions: string | null;
}

interface PaymentIntentRow {
  id: string;
  gateway: string;
  external_reference: string;
  amount_minor: number;
  status: string;
  proof_reference: string | null;
  created_at: string;
  orders?: {
    id?: string;
    order_number?: string;
    status?: string;
    payment_status?: string;
  } | Array<{
    id?: string;
    order_number?: string;
    status?: string;
    payment_status?: string;
  }> | null;
}

interface LedgerRow {
  id: string;
  entry_type: string;
  gateway: string;
  gross_amount_minor: number;
  fee_amount_minor: number;
  net_amount_minor: number;
  description: string;
  created_at: string;
  orders?: { order_number?: string } | Array<{ order_number?: string }> | null;
}

export function PaymentsConsoleClient({
  configs,
  intents,
  ledger,
  unpaidOrders,
  canManageSettings,
  canLogManual,
  canVerifySettle,
}: {
  configs: PaymentConfigRow[];
  intents: PaymentIntentRow[];
  ledger: LedgerRow[];
  unpaidOrders: Array<{ id: string; label: string }>;
  canManageSettings: boolean;
  canLogManual: boolean;
  canVerifySettle: boolean;
}) {
  const router = useRouter();

  // Gateway Config State
  const [gateway, setGateway] = React.useState<
    "esewa" | "khalti" | "fonepay" | "bank_transfer" | "cod"
  >("esewa");
  const [isEnabled, setIsEnabled] = React.useState(true);
  const [isSandbox, setIsSandbox] = React.useState(true);
  const [merchantId, setMerchantId] = React.useState("");
  const [secretKey, setSecretKey] = React.useState("");
  const [accountTitle, setAccountTitle] = React.useState("");
  const [savingConfig, setSavingConfig] = React.useState(false);

  // Payment Intent State
  const [orderId, setOrderId] = React.useState(unpaidOrders[0]?.id ?? "");
  const [intentGateway, setIntentGateway] = React.useState<
    "esewa" | "khalti" | "fonepay" | "bank_transfer" | "cash"
  >("fonepay");
  const [proofRef, setProofRef] = React.useState("");
  const [creatingIntent, setCreatingIntent] = React.useState(false);

  const netCapturedMinor = React.useMemo(
    () => ledger.reduce((sum, l) => sum + Number(l.net_amount_minor || 0), 0),
    [ledger]
  );

  const pendingVerificationCount = React.useMemo(
    () => intents.filter((i) => i.status !== "verified" && i.status !== "refunded").length,
    [intents]
  );

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch("/api/v1/merchant/payments/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway,
          is_enabled: isEnabled,
          is_sandbox: isSandbox,
          merchant_identifier: merchantId.trim() || undefined,
          secret_key: secretKey.trim() || undefined,
          account_title: accountTitle.trim() || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Failed to save gateway config.");
        return;
      }
      setSecretKey("");
      toast.success(`${gateway.toUpperCase()} payment configuration saved`);
      router.refresh();
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleCreateIntent(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId) {
      toast.error("Select an unpaid order.");
      return;
    }
    setCreatingIntent(true);
    try {
      const res = await fetch("/api/v1/merchant/payments/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          gateway: intentGateway,
          proof_reference: proofRef.trim() || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Could not create payment intent.");
        return;
      }
      setProofRef("");
      toast.success(`Payment intent ${payload.data.external_reference} logged`);
      router.refresh();
    } finally {
      setCreatingIntent(false);
    }
  }

  async function handleVerifyIntent(intentId: string) {
    const res = await fetch(`/api/v1/merchant/payments/intents/${intentId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload?.detail ?? "Could not verify payment.");
      return;
    }
    toast.success("Payment verified & posted to finance ledger");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-charcoal">
          Payments, Gateways &amp; Finance Ledger
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Configure eSewa v2, Khalti v2, Fonepay QR, and bank transfers; verify vouchers; inspect immutable NPR ledger entries.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Net Captured Ledger"
          value={formatNpr(netCapturedMinor)}
          deltaLabel="Append-only NPR entries"
          deltaTone="success"
          icon={<BookOpenCheck className="h-4 w-4" />}
        />
        <KpiCard
          label="Pending Verification"
          value={String(pendingVerificationCount)}
          deltaLabel="Awaiting settlement check"
          deltaTone={pendingVerificationCount > 0 ? "warning" : "neutral"}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <KpiCard
          label="Configured Gateways"
          value={String(configs.filter((c) => c.is_enabled).length)}
          deltaLabel="eSewa · Khalti · Fonepay"
          deltaTone="info"
          icon={<CreditCard className="h-4 w-4" />}
        />
      </div>

      {/* Gateway Setup + Log Payment Proof */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {canManageSettings && (
          <form
            onSubmit={handleSaveConfig}
            className="rounded-[14px] border border-soft bg-surface p-5 space-y-4 shadow-[0_1px_2px_rgba(36,35,33,0.04)]"
          >
            <h2 className="font-display text-base font-semibold text-charcoal">
              Nepal payment gateway setup
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Gateway</Label>
                <select
                  value={gateway}
                  onChange={(e) =>
                    setGateway(
                      e.target.value as
                        | "esewa"
                        | "khalti"
                        | "fonepay"
                        | "bank_transfer"
                        | "cod"
                    )
                  }
                  className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
                >
                  <option value="esewa">eSewa (ePay v2)</option>
                  <option value="khalti">Khalti (ePayment v2)</option>
                  <option value="fonepay">Fonepay QR</option>
                  <option value="bank_transfer">Bank Transfer / QR</option>
                  <option value="cod">Cash on Delivery (COD)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Product / Merchant Code / A/C</Label>
                <Input
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  placeholder="e.g., EPAYTEST or Account #"
                  className="h-[40px] rounded-[10px] border-soft bg-surface"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Account / Holder Title</Label>
                <Input
                  value={accountTitle}
                  onChange={(e) => setAccountTitle(e.target.value)}
                  placeholder="e.g., Sajilo Store Pvt. Ltd."
                  className="h-[40px] rounded-[10px] border-soft bg-surface"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">HMAC / Secret Key (Write-only)</Label>
                <Input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="••••••••••••"
                  className="h-[40px] rounded-[10px] border-soft bg-surface"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-xs text-charcoal">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                />
                Gateway enabled
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSandbox}
                  onChange={(e) => setIsSandbox(e.target.checked)}
                />
                Sandbox / UAT mode
              </label>
            </div>

            <Button
              type="submit"
              disabled={savingConfig}
              className="h-[40px] rounded-[10px] bg-coral px-5 font-semibold text-white hover:bg-coral-hover"
            >
              {savingConfig ? "Saving..." : "Save gateway config"}
            </Button>
          </form>
        )}

        {canLogManual && (
          <form
            onSubmit={handleCreateIntent}
            className="rounded-[14px] border border-soft bg-surface p-5 space-y-4 shadow-[0_1px_2px_rgba(36,35,33,0.04)]"
          >
            <h2 className="font-display text-base font-semibold text-charcoal">
              Log payment intent / QR voucher
            </h2>

            <div className="space-y-1">
              <Label className="text-xs">Order</Label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
              >
                {unpaidOrders.length === 0 ? (
                  <option value="">No unpaid orders found</option>
                ) : (
                  unpaidOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Channel / Gateway</Label>
                <select
                  value={intentGateway}
                  onChange={(e) =>
                    setIntentGateway(
                      e.target.value as
                        | "esewa"
                        | "khalti"
                        | "fonepay"
                        | "bank_transfer"
                        | "cash"
                    )
                  }
                  className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
                >
                  <option value="fonepay">Fonepay QR</option>
                  <option value="esewa">eSewa</option>
                  <option value="khalti">Khalti</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Counter Cash</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Txn / Voucher Reference</Label>
                <Input
                  value={proofRef}
                  onChange={(e) => setProofRef(e.target.value)}
                  placeholder="e.g., FP-992817"
                  className="h-[40px] rounded-[10px] border-soft bg-surface"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={creatingIntent || !orderId}
              className="h-[40px] rounded-[10px] bg-charcoal px-5 font-semibold text-ivory"
            >
              {creatingIntent ? "Logging..." : "Create payment intent"}
            </Button>
          </form>
        )}
      </div>

      {/* Payment Intents Queue */}
      <div className="rounded-[14px] border border-soft bg-surface overflow-hidden shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
        <div className="border-b border-soft bg-sand/40 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-ink">
            Payment Intents &amp; Verification Queue
          </h2>
        </div>

        {intents.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-muted-ink">
            No payment intents recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-soft">
            {intents.map((intent) => {
              const ord = Array.isArray(intent.orders)
                ? intent.orders[0]
                : intent.orders;
              return (
                <div
                  key={intent.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-charcoal">
                        {intent.external_reference}
                      </span>
                      <StatusBadge
                        label={intent.status.replaceAll("_", " ")}
                        tone={intent.status === "verified" ? "success" : "warning"}
                      />
                      <span className="text-xs uppercase font-semibold text-muted-ink">
                        {intent.gateway}
                      </span>
                      {ord?.order_number && (
                        <span className="font-mono text-xs text-muted-ink">
                          ({ord.order_number})
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-ink tabular-nums-npr">
                      Amount: <strong className="text-charcoal">{formatNpr(Number(intent.amount_minor))}</strong>
                      {intent.proof_reference ? ` · Ref: ${intent.proof_reference}` : ""}
                    </p>
                  </div>

                  {canVerifySettle && intent.status !== "verified" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleVerifyIntent(intent.id)}
                      className="h-8 rounded-[8px] bg-charcoal text-xs font-semibold text-ivory"
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Verify &amp; Capture
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Immutable Ledger Feed */}
      <div className="rounded-[14px] border border-soft bg-surface overflow-hidden shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
        <div className="border-b border-soft bg-sand/40 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-ink">
            Immutable Merchant Finance Ledger
          </h2>
        </div>

        {ledger.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-muted-ink">
            No settled ledger entries yet. Verifying a payment records an immutable NPR entry here.
          </p>
        ) : (
          <div className="divide-y divide-soft">
            {ledger.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3.5 text-xs"
              >
                <div>
                  <span className="font-semibold text-charcoal">{entry.entry_type}</span>
                  <span className="ml-2 uppercase text-muted-ink">{entry.gateway}</span>
                  <p className="text-muted-ink">{entry.description}</p>
                </div>
                <div className="sm:text-right tabular-nums-npr">
                  <p className="font-bold text-charcoal">
                    Net: {formatNpr(Number(entry.net_amount_minor))}
                  </p>
                  <p className="text-[11px] text-muted-ink">
                    {new Date(entry.created_at).toLocaleString("en-GB")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
