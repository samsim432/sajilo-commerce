"use client";

import * as React from "react";
import { AlertTriangle, Phone, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { formatNpr } from "@/lib/currency/npr";

interface CustomerRecord {
  id: string;
  full_name: string;
  phone_e164: string;
  email: string | null;
  instagram_handle: string | null;
  cod_risk_flag: boolean;
  total_orders: number;
  delivered_orders: number;
  returned_orders: number;
  total_spent_minor: number;
  last_order_at: string | null;
  customer_addresses?: Array<{
    id: string;
    district: string | null;
    city: string | null;
    street_address: string;
    landmark: string | null;
  }>;
}

export function CustomersDirectoryClient({
  customers,
}: {
  customers: CustomerRecord[];
}) {
  const [query, setQuery] = React.useState("");
  const [riskOnly, setRiskOnly] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (riskOnly && !c.cod_risk_flag) return false;
      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        c.phone_e164.toLowerCase().includes(q) ||
        (c.instagram_handle ?? "").toLowerCase().includes(q)
      );
    });
  }, [customers, query, riskOnly]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">
            Customer CRM
          </h1>
          <p className="mt-1 text-sm text-muted-ink">
            Deduplicated +977 buyer profiles, repeat order counts, and COD risk flags.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[14px] border border-soft bg-surface p-4">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-ink" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, +977 mobile, or @handle..."
            className="h-[38px] rounded-[10px] border-soft bg-surface pl-9 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={() => setRiskOnly((prev) => !prev)}
          className={`inline-flex h-[38px] items-center gap-1.5 rounded-[10px] border px-3.5 text-xs font-semibold transition-colors ${
            riskOnly
              ? "border-danger-border bg-danger-bg text-danger-fg"
              : "border-soft bg-surface text-muted-ink hover:text-charcoal"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          COD risk flagged only
        </button>
      </div>

      <div className="rounded-[14px] border border-soft bg-surface overflow-hidden shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-2">
            <Users className="mx-auto h-6 w-6 text-muted-ink" />
            <p className="text-sm font-semibold text-charcoal">No matching customers</p>
            <p className="text-xs text-muted-ink">
              Customers appear automatically when you log a DM, phone, or storefront order.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-soft">
            {filtered.map((cust) => {
              const addr = cust.customer_addresses?.[0];
              return (
                <div
                  key={cust.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-4 hover:bg-surface-hover/50"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-charcoal">
                        {cust.full_name}
                      </span>
                      {cust.cod_risk_flag ? (
                        <StatusBadge label="COD Risk" tone="danger" />
                      ) : cust.total_orders > 1 ? (
                        <StatusBadge label="Repeat Buyer" tone="success" />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-ink">
                      <span className="inline-flex items-center gap-1 font-mono text-charcoal">
                        <Phone className="h-3 w-3" />
                        {cust.phone_e164}
                      </span>
                      {cust.instagram_handle && (
                        <span>@{cust.instagram_handle}</span>
                      )}
                      {addr && (
                        <span>
                          {[addr.street_address, addr.district].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 text-right">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-ink">
                        Orders
                      </p>
                      <p className="text-xs font-semibold text-charcoal tabular-nums-npr">
                        {cust.total_orders} ({cust.returned_orders} ret)
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-ink">
                        Lifetime Value
                      </p>
                      <p className="text-sm font-bold text-charcoal tabular-nums-npr">
                        {formatNpr(Number(cust.total_spent_minor || 0))}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
