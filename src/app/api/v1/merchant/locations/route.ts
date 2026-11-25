import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const createLocationSchema = z.object({
  name: z.string().trim().min(2, "Location name must be at least 2 characters.").max(100),
  province: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  address_line1: z.string().trim().max(200).optional(),
});

export async function GET() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "settings:read")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const serviceClient = createSupabaseServiceClient();
  const { data } = await serviceClient
    .from("locations")
    .select("id, name, address_line1, city, district, province, is_default, is_active")
    .eq("business_id", workspace.business.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "settings:manage")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createLocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        detail: parsed.error.issues[0]?.message ?? "Invalid location payload.",
      },
      { status: 422 }
    );
  }

  const serviceClient = createSupabaseServiceClient();

  // Enforce plan location limit
  const { data: subscription } = await serviceClient
    .from("subscriptions")
    .select("override_limits, plans:plan_id(limits)")
    .eq("business_id", workspace.business.id)
    .single();

  type SubRow = {
    override_limits: Record<string, unknown> | null;
    plans: { limits?: Record<string, unknown> } | Array<{ limits?: Record<string, unknown> }> | null;
  };
  const sub = subscription as unknown as SubRow | null;
  const planObj = Array.isArray(sub?.plans) ? sub?.plans[0] : sub?.plans;
  const effectiveLimits = {
    ...(planObj?.limits ?? {}),
    ...(sub?.override_limits ?? {}),
  };
  const maxLocations =
    typeof effectiveLimits.max_locations === "number"
      ? effectiveLimits.max_locations
      : 1;

  if (maxLocations !== -1) {
    const { count } = await serviceClient
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", workspace.business.id)
      .eq("is_active", true);

    if ((count ?? 0) >= maxLocations) {
      return NextResponse.json(
        {
          code: "PLAN_QUOTA_EXCEEDED",
          detail: `Your current plan allows up to ${maxLocations} active location(s). Upgrade to add more branches or warehouses.`,
        },
        { status: 402 }
      );
    }
  }

  const { data: created, error } = await serviceClient
    .from("locations")
    .insert({
      business_id: workspace.business.id,
      name: parsed.data.name,
      province: parsed.data.province || null,
      district: parsed.data.district || null,
      city: parsed.data.city || null,
      address_line1: parsed.data.address_line1 || null,
      is_default: false,
      is_active: true,
    })
    .select("id, name, address_line1, city, district, province, is_default, is_active")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { code: "LOCATION_CREATE_FAILED", detail: "Could not add location." },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: created }, { status: 201 });
}
