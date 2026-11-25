import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { listBusinessOrders } from "@/features/orders/order-service";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { OrdersConsoleClient } from "@/features/orders/orders-console-client";

export default async function OrdersPage() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }
  if (!hasPermission(workspace.role, "orders:read")) {
    return (
      <div className="rounded-[14px] border border-soft bg-surface p-6">
        <h1 className="font-display text-xl font-bold text-charcoal">
          Orders access restricted
        </h1>
      </div>
    );
  }

  const serviceClient = createSupabaseServiceClient();
  const [orders, { data: locations }, { data: variants }] = await Promise.all([
    listBusinessOrders({ businessId: workspace.business.id }),
    serviceClient
      .from("locations")
      .select("id, name")
      .eq("business_id", workspace.business.id)
      .eq("is_active", true)
      .order("is_default", { ascending: false }),
    serviceClient
      .from("product_variants")
      .select("id, sku, title, price_minor, products:product_id!inner(title, deleted_at)")
      .eq("business_id", workspace.business.id)
      .eq("is_active", true),
  ]);

  type VarRow = {
    id: string;
    sku: string;
    title: string;
    price_minor: number;
    products: { title?: string; deleted_at?: string | null } | Array<{ title?: string; deleted_at?: string | null }> | null;
  };

  const variantOptions = ((variants ?? []) as unknown as VarRow[])
    .map((v) => {
      const prod = Array.isArray(v.products) ? v.products[0] : v.products;
      if (!prod || prod.deleted_at !== null) return null;
      return {
        id: v.id,
        label: `${v.sku} — ${prod.title ?? "Item"} (${v.title})`,
        price_minor: Number(v.price_minor),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <OrdersConsoleClient
      initialOrders={orders as never}
      variants={variantOptions}
      locations={locations ?? []}
      canCreate={hasPermission(workspace.role, "orders:create")}
      canTransition={hasPermission(workspace.role, "orders:transition")}
    />
  );
}
