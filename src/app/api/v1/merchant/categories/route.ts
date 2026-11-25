import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { slugifyProductTitle } from "@/features/products/variant-matrix";

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(80),
  description: z.string().trim().max(300).optional(),
});

export async function GET() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "products:read")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const serviceClient = createSupabaseServiceClient();
  const { data } = await serviceClient
    .from("categories")
    .select("id, name, slug, description, sort_order")
    .eq("business_id", workspace.business.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "products:write")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        detail: parsed.error.issues[0]?.message ?? "Invalid category data.",
      },
      { status: 422 }
    );
  }

  const slug = slugifyProductTitle(parsed.data.name).slice(0, 80);
  const serviceClient = createSupabaseServiceClient();

  const { data: created, error } = await serviceClient
    .from("categories")
    .insert({
      business_id: workspace.business.id,
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
    })
    .select("id, name, slug, description, sort_order")
    .single();

  if (error || !created) {
    const isDuplicate = error?.code === "23505";
    return NextResponse.json(
      {
        code: isDuplicate ? "CATEGORY_EXISTS" : "CATEGORY_CREATE_FAILED",
        detail: isDuplicate
          ? "A category with this name already exists."
          : "Could not create category.",
      },
      { status: isDuplicate ? 409 : 500 }
    );
  }

  return NextResponse.json({ data: created }, { status: 201 });
}
