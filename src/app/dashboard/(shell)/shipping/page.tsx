import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import {
  listBusinessShipments,
  listBusinessShippingZones,
} from "@/features/shipping/shipping-service";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { ShippingConsoleClient } from "@/features/shipping/shipping-console-client";

export default async function ShippingPage() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }
  if (!hasPermission(workspace.role, "shipping:read")) {
    return (
      <div className="rounded-[14px] border border-soft bg-surface p-6">
        <h1 className="font-display text-xl font-bold text-charcoal">
          Shipping access restricted
        </h1>
      </div>
    );
  }

  const serviceClient = createSupabaseServiceClient();
  const [zones, shipments, { data: orders }] = await Promise.all([
    listBusinessShippingZones(workspace.business.id),
    listBusinessShipments(workspace.business.id),
    serviceClient
      .from("orders")
      .select("id, order_number, status, payment_method, total_minor")
      .eq("business_id", workspace.business.id)
      .in("status", ["confirmed", "processing", "packed", "shipped"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const dispatchableOrders = (orders ?? []).map((o) => ({
    id: o.id,
    label: `${o.order_number} (${o.status} · ${o.payment_method.toUpperCase()})`,
    payment_method: o.payment_method,
  }));

  return (
    <ShippingConsoleClient
      zones={zones}
      shipments={shipments as never}
      dispatchableOrders={dispatchableOrders}
      canWriteShipping={hasPermission(workspace.role, "shipping:write")}
      canReconcileCod={hasPermission(workspace.role, "finance:reconcile")}
    />
  );
}
