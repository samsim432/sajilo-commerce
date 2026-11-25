import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { ProductEditorForm } from "@/features/products/product-editor-form";

export default async function NewProductPage() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }
  if (!hasPermission(workspace.role, "products:write")) {
    redirect("/dashboard/products");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: categories } = await serviceClient
    .from("categories")
    .select("id, name")
    .eq("business_id", workspace.business.id)
    .order("name", { ascending: true });

  return <ProductEditorForm categories={categories ?? []} />;
}
