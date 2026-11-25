import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { getInventorySnapshot } from "@/features/inventory/inventory-service";
import { InventoryConsoleClient } from "@/features/inventory/inventory-console-client";

export default async function InventoryPage() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }
  if (!hasPermission(workspace.role, "inventory:read")) {
    return (
      <div className="rounded-[14px] border border-soft bg-surface p-6">
        <h1 className="font-display text-xl font-bold text-charcoal">
          Inventory access restricted
        </h1>
      </div>
    );
  }

  const snapshot = await getInventorySnapshot({
    businessId: workspace.business.id,
  });

  return (
    <InventoryConsoleClient
      locations={snapshot.locations}
      balances={snapshot.balances}
      lowStockCount={snapshot.lowStockCount}
      movements={snapshot.movements as never}
      canAdjust={hasPermission(workspace.role, "inventory:adjust")}
    />
  );
}
