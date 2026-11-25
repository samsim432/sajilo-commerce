import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { getInventorySnapshot } from "@/features/inventory/inventory-service";
import { listStockTransfers } from "@/features/inventory/transfer-service";
import { TransfersClient } from "@/features/inventory/transfers-client";

export default async function StockTransfersPage() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }
  if (!hasPermission(workspace.role, "inventory:read")) {
    redirect("/dashboard/inventory");
  }

  const [snapshot, transfers] = await Promise.all([
    getInventorySnapshot({ businessId: workspace.business.id }),
    listStockTransfers(workspace.business.id),
  ]);

  const variantMap = new Map<string, { id: string; label: string }>();
  for (const row of snapshot.balances) {
    if (!variantMap.has(row.variant_id)) {
      variantMap.set(row.variant_id, {
        id: row.variant_id,
        label: `${row.sku} — ${row.product_title} (${row.variant_title})`,
      });
    }
  }

  return (
    <TransfersClient
      locations={snapshot.locations}
      variants={Array.from(variantMap.values())}
      transfers={transfers as never}
      canAdjust={hasPermission(workspace.role, "inventory:adjust")}
    />
  );
}
