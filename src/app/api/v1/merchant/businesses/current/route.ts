import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { normalizeNepalPhone } from "@/lib/currency/npr";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const updateBusinessSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  category: z
    .enum([
      "fashion",
      "electronics",
      "beauty",
      "food_artisan",
      "general_retail",
      "services",
      "general",
    ])
    .optional(),
  default_locale: z.enum(["en", "ne"]).optional(),
  support_phone: z.string().trim().optional().or(z.literal("")),
  support_email: z.string().trim().email().optional().or(z.literal("")),
  tax_registered: z.boolean().optional(),
  pan_vat_number: z.string().trim().max(32).optional().or(z.literal("")),
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
  const [{ data: business }, { data: locations }] = await Promise.all([
    serviceClient
      .from("businesses")
      .select(
        "id, name, slug, category, country_code, default_currency, default_locale, support_phone_e164, support_email, tax_registered, pan_vat_number, status"
      )
      .eq("id", workspace.business.id)
      .single(),
    serviceClient
      .from("locations")
      .select("id, name, address_line1, city, district, province, is_default, is_active")
      .eq("business_id", workspace.business.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);

  return NextResponse.json({
    data: {
      business,
      locations: locations ?? [],
    },
  });
}

export async function PATCH(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "settings:manage")) {
    return NextResponse.json(
      { code: "FORBIDDEN_ROLE", detail: "Only Owner or Admin can update business settings." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = updateBusinessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        detail: parsed.error.issues[0]?.message ?? "Invalid business settings payload.",
      },
      { status: 422 }
    );
  }

  const input = parsed.data;
  let normalizedPhone: string | null | undefined = undefined;
  if (input.support_phone !== undefined) {
    if (input.support_phone === "") {
      normalizedPhone = null;
    } else {
      const checked = normalizeNepalPhone(input.support_phone);
      if (!checked) {
        return NextResponse.json(
          {
            code: "INVALID_PHONE",
            detail: "Enter a valid 10-digit Nepali mobile number (e.g. 9841234567).",
          },
          { status: 422 }
        );
      }
      normalizedPhone = checked;
    }
  }

  const patchPayload: Record<string, unknown> = {};
  if (input.name !== undefined) patchPayload.name = input.name;
  if (input.category !== undefined) patchPayload.category = input.category;
  if (input.default_locale !== undefined) patchPayload.default_locale = input.default_locale;
  if (normalizedPhone !== undefined) patchPayload.support_phone_e164 = normalizedPhone;
  if (input.support_email !== undefined) {
    patchPayload.support_email = input.support_email === "" ? null : input.support_email;
  }
  if (input.tax_registered !== undefined) patchPayload.tax_registered = input.tax_registered;
  if (input.pan_vat_number !== undefined) {
    patchPayload.pan_vat_number = input.pan_vat_number === "" ? null : input.pan_vat_number;
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: updated, error } = await serviceClient
    .from("businesses")
    .update(patchPayload)
    .eq("id", workspace.business.id)
    .select(
      "id, name, slug, category, country_code, default_currency, default_locale, support_phone_e164, support_email, tax_registered, pan_vat_number"
    )
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { code: "UPDATE_FAILED", detail: "Unable to save business settings." },
      { status: 500 }
    );
  }

  await serviceClient.from("audit_logs").insert({
    business_id: workspace.business.id,
    actor_type: "merchant_user",
    actor_id: workspace.userId,
    action: "business.settings_updated",
    resource_type: "business",
    resource_id: workspace.business.id,
    metadata: { updated_fields: Object.keys(patchPayload) },
  });

  return NextResponse.json({ data: updated });
}
