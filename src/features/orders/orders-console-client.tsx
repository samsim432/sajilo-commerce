"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCirclePlus, PackageCheck, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/dashboard/commerce-inputs";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { formatNpr } from "@/lib/currency/npr";
import {
  getAllowedNextStatuses,
  type OrderStatus,
} from "@/features/orders/state-machine";

interface VariantOption {
  id: string;
  label: string;
  price_minor: number;
}

interface OrderRow {
  id: string;
  order_number: string;
  channel: string;
  status: OrderStatus;
  payment_method: string;
  payment_status: string;
  total_minor: number;
  created_at: string;
  customers?: {
    full_name?: string;
    phone_e164?: string;
    cod_risk_flag?: boolean;
    total_orders?: number;
  } | Array<{
    full_name?: string;
    phone_e164?: string;
    cod_risk_flag?: boolean;
    total_orders?: number;
  }> | null;
  order_items?: Array<{
    id: string;
    product_title: string;
    variant_title: string;
    sku: string;
    quantity: number;
    line_total_minor: number;
  }>;
}

export function OrdersConsoleClient({
  initialOrders,
  variants,
  locations,
  canCreate,
  canTransition,
}: {
  initialOrders: OrderRow[];
  variants: VariantOption[];
  locations: Array<{ id: string; name: string }>;
  canCreate: boolean;
  canTransition: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Quick DM / Manual Order Form State
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [igHandle, setIgHandle] = React.useState("");
  const [district, setDistrict] = React.useState("Kathmandu");
  const [streetAddress, setStreetAddress] = React.useState("");
  const [channel, setChannel] = React.useState<
    "instagram" | "facebook" | "whatsapp" | "manual_phone"
  >("instagram");
  const [paymentMethod, setPaymentMethod] = React.useState<
    "cod" | "esewa" | "khalti" | "fonepay" | "bank_transfer"
  >("cod");
  const [locationId, setLocationId] = React.useState(locations[0]?.id ?? "");
  const [selectedVariantId, setSelectedVariantId] = React.useState(
    variants[0]?.id ?? ""
  );
  const [quantity, setQuantity] = React.useState(1);
  const [submitting, setSubmitting] = React.useState(false);

  const filteredOrders = React.useMemo(() => {
    return initialOrders.filter((o) => {
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const q = query.trim().toLowerCase();
      const cust = Array.isArray(o.customers) ? o.customers[0] : o.customers;
      const matchesQuery =
        !q ||
        o.order_number.toLowerCase().includes(q) ||
        (cust?.full_name ?? "").toLowerCase().includes(q) ||
        (cust?.phone_e164 ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [initialOrders, query, statusFilter]);

  async function handleCreateQuickOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVariantId) {
      toast.error("Add a product variant in Catalogue first.");
      return;
    }

    setSubmitting(true);
    try {
      const idemKey = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch("/api/v1/merchant/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          location_id: locationId || undefined,
          channel,
          payment_method: paymentMethod,
          customer: {
            full_name: customerName.trim(),
            phone: customerPhone.trim(),
            instagram_handle: igHandle.trim() || undefined,
            address: streetAddress.trim()
              ? {
                  district: district.trim() || undefined,
                  street_address: streetAddress.trim(),
                }
              : undefined,
          },
          items: [{ variant_id: selectedVariantId, quantity: Number(quantity) || 1 }],
          reserve_stock_immediately: true,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.detail ?? "Could not create order.");
        return;
      }

      toast.success(`Order ${payload.data.order_number} logged & stock reserved`);
      setDrawerOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setIgHandle("");
      setStreetAddress("");
      setQuantity(1);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusTransition(orderId: string, toStatus: OrderStatus) {
    const res = await fetch(`/api/v1/merchant/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_status: toStatus }),
    });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload?.detail ?? "Transition failed.");
      return;
    }
    toast.success(`Order marked as ${toStatus.replaceAll("_", " ")}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">
            Unified Orders
          </h1>
          <p className="mt-1 text-sm text-muted-ink">
            Instagram, Facebook, WhatsApp, phone &amp; storefront orders in one queue.
          </p>
        </div>

        {canCreate && (
          <Button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="h-[40px] rounded-[10px] bg-coral px-4 text-sm font-semibold text-white hover:bg-coral-hover"
          >
            <MessageCirclePlus className="mr-1.5 h-4 w-4" />
            Quick DM / Phone Order
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[14px] border border-soft bg-surface p-4">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-ink" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order #, buyer name, or +977 phone..."
            className="h-[38px] rounded-[10px] border-soft bg-surface pl-9 text-sm"
          />
        </div>

        <select
          aria-label="Filter orders by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-[38px] rounded-[10px] border border-soft bg-surface px-3 text-xs font-medium text-charcoal"
        >
          <option value="all">All statuses</option>
          <option value="pending_payment">Pending payment</option>
          <option value="confirmed">Confirmed</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Orders List */}
      <div className="rounded-[14px] border border-soft bg-surface overflow-hidden shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
        {filteredOrders.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-2">
            <PackageCheck className="mx-auto h-6 w-6 text-muted-ink" />
            <p className="text-sm font-semibold text-charcoal">No orders yet</p>
            <p className="text-xs text-muted-ink">
              Use &ldquo;Quick DM / Phone Order&rdquo; to log a social commerce order in seconds.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-soft">
            {filteredOrders.map((order) => {
              const cust = Array.isArray(order.customers)
                ? order.customers[0]
                : order.customers;
              const nextStates = getAllowedNextStatuses(order.status);

              return (
                <div
                  key={order.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-4 hover:bg-surface-hover/50"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-charcoal">
                        {order.order_number}
                      </span>
                      <StatusBadge
                        label={order.status.replaceAll("_", " ")}
                        tone={
                          order.status === "delivered"
                            ? "success"
                            : order.status === "cancelled"
                              ? "danger"
                              : "info"
                        }
                      />
                      <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] font-medium capitalize text-charcoal">
                        {order.channel.replace("_", " ")}
                      </span>
                      <span className="rounded-full bg-ivory border border-soft px-2 py-0.5 text-[11px] uppercase text-muted-ink">
                        {order.payment_method}
                      </span>
                    </div>
                    <p className="text-xs text-charcoal">
                      <span className="font-semibold">
                        {cust?.full_name ?? "Customer"}
                      </span>{" "}
                      · <span className="font-mono">{cust?.phone_e164 ?? ""}</span>
                      {cust?.cod_risk_flag ? (
                        <span className="ml-2 rounded bg-danger-bg px-1.5 py-0.5 text-[10px] font-semibold text-danger-fg">
                          COD Risk
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-charcoal tabular-nums-npr">
                      {formatNpr(order.total_minor)}
                    </span>

                    {canTransition && nextStates.length > 0 && (
                      <select
                        aria-label={`Transition ${order.order_number}`}
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleStatusTransition(
                              order.id,
                              e.target.value as OrderStatus
                            );
                            e.target.value = "";
                          }
                        }}
                        className="h-8 rounded-[8px] border border-soft bg-surface px-2.5 text-xs font-medium text-charcoal"
                      >
                        <option value="">Move status...</option>
                        {nextStates.map((st) => (
                          <option key={st} value={st}>
                            → {st.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Manual / DM Order Slide-Over Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-charcoal/40 backdrop-blur-[1px]">
          <form
            onSubmit={handleCreateQuickOrder}
            className="flex h-full w-full max-w-lg flex-col justify-between bg-ivory p-6 shadow-xl overflow-y-auto"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-soft pb-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-charcoal">
                    Quick DM / Phone Order
                  </h2>
                  <p className="text-xs text-muted-ink">
                    Auto-deduplicates +977 customer &amp; reserves stock immediately.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-[8px] p-1.5 text-muted-ink hover:bg-surface hover:text-charcoal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Customer name</Label>
                  <Input
                    required
                    placeholder="e.g., Aarav Shrestha"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-[40px] rounded-[10px] border-soft bg-surface"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mobile (+977)</Label>
                  <PhoneInput
                    value={customerPhone}
                    onValueChange={setCustomerPhone}
                    placeholder="9841234567"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Channel</Label>
                  <select
                    value={channel}
                    onChange={(e) =>
                      setChannel(
                        e.target.value as
                          | "instagram"
                          | "facebook"
                          | "whatsapp"
                          | "manual_phone"
                      )
                    }
                    className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
                  >
                    <option value="instagram">Instagram DM</option>
                    <option value="facebook">Facebook Messenger</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="manual_phone">Phone / Walk-in</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Payment method</Label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(
                        e.target.value as
                          | "cod"
                          | "esewa"
                          | "khalti"
                          | "fonepay"
                          | "bank_transfer"
                      )
                    }
                    className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
                  >
                    <option value="cod">Cash on Delivery (COD)</option>
                    <option value="esewa">eSewa</option>
                    <option value="khalti">Khalti</option>
                    <option value="fonepay">Fonepay QR</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Product / Variant</Label>
                  <select
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                    className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
                  >
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} ({formatNpr(v.price_minor)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="h-[40px] rounded-[10px] border-soft bg-surface tabular-nums-npr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">District</Label>
                  <Input
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="Kathmandu"
                    className="h-[40px] rounded-[10px] border-soft bg-surface"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Instagram / Social handle</Label>
                  <Input
                    value={igHandle}
                    onChange={(e) => setIgHandle(e.target.value)}
                    placeholder="@buyer_handle"
                    className="h-[40px] rounded-[10px] border-soft bg-surface"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Delivery street / landmark</Label>
                <Input
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="e.g., Lazimpat near Rastra Bank"
                  className="h-[40px] rounded-[10px] border-soft bg-surface"
                />
              </div>

              {locations.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Fulfillment branch</Label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-soft pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDrawerOpen(false)}
                className="h-[40px] rounded-[10px] border-soft"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="h-[40px] rounded-[10px] bg-coral px-5 font-semibold text-white hover:bg-coral-hover"
              >
                {submitting ? "Creating..." : "Create order"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
