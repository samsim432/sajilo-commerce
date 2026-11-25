import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { listBusinessProducts } from "@/features/products/product-service";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { ProductsCatalogueClient } from "@/features/products/products-catalogue-client";

export default async function ProductsPage() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }
  if (!hasPermission(workspace.role, "products:read")) {
    return (
      <div className="rounded-[14px] border border-soft bg-surface p-6">
        <h1 className="font-display text-xl font-bold text-charcoal">
          Catalogue access restricted
        </h1>
      </div>
    );
  }

  const serviceClient = createSupabaseServiceClient();
  const [products, { data: categories }] = await Promise.all([
    listBusinessProducts({ businessId: workspace.business.id }),
    serviceClient
      .from("categories")
      .select("id, name")
      .eq("business_id", workspace.business.id)
      .order("name", { ascending: true }),
  ]);

  return (
    <ProductsCatalogueClient
      initialProducts={products as never}
      initialCategories={categories ?? []}
      canWrite={hasPermission(workspace.role, "products:write")}
    />
  );
}
