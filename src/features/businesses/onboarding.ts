import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { normalizeNepalPhone } from "@/lib/currency/npr";

export const createBusinessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters.")
    .max(120, "Business name must be 120 characters or fewer."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/,
      "Slug must contain lowercase letters, numbers, and hyphens (3-63 chars)."
    )
    .optional(),
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
    .default("general"),
  default_locale: z.enum(["en", "ne"]).default("en"),
  support_phone: z.string().trim().optional().or(z.literal("")),
  support_email: z.string().trim().email().optional().or(z.literal("")),
  address_line1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  primary_channel: z
    .enum(["instagram", "facebook", "new_website", "existing_website", "shop"])
    .default("instagram"),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

function slugifyBusinessName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  const suffix = Math.floor(100 + Math.random() * 900);
  const safeBase = base.length >= 2 ? base : "store";
  return `${safeBase}-${suffix}`;
}

export interface ProvisionedBusinessResult {
  business: {
    id: string;
    name: string;
    slug: string;
    category: string;
    country_code: string;
    default_currency: string;
    default_locale: "en" | "ne";
  };
  defaultLocationId: string;
  planCode: string;
}

/**
 * Provisions a new business workspace with Owner membership, default location,
 * and Free subscription tier, rolling back cleanly on downstream failure.
 */
export async function provisionBusinessWorkspace(
  ownerUserId: string,
  rawInput: CreateBusinessInput
): Promise<{ data?: ProvisionedBusinessResult; error?: { status: number; code: string; message: string } }> {
  const parsed = createBusinessSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid business details.",
      },
    };
  }

  const input = parsed.data;
  const normalizedPhone =
    input.support_phone && input.support_phone.length > 0
      ? normalizeNepalPhone(input.support_phone)
      : null;

  if (input.support_phone && input.support_phone.length > 0 && !normalizedPhone) {
    return {
      error: {
        status: 422,
        code: "INVALID_PHONE",
        message: "Please enter a valid 10-digit Nepali mobile number (e.g. 9841234567).",
      },
    };
  }

  const serviceClient = createSupabaseServiceClient();

  const { data: freePlan, error: planError } = await serviceClient
    .from("plans")
    .select("id, code")
    .eq("code", "free")
    .single();

  if (planError || !freePlan) {
    return {
      error: {
        status: 500,
        code: "PLAN_CONFIG_MISSING",
        message: "Default Free plan is not seeded in the database.",
      },
    };
  }

  const candidateSlug = input.slug || slugifyBusinessName(input.name);

  const { data: business, error: bizError } = await serviceClient
    .from("businesses")
    .insert({
      name: input.name,
      slug: candidateSlug,
      category: input.category,
      country_code: "NP",
      default_currency: "NPR",
      default_locale: input.default_locale,
      support_phone_e164: normalizedPhone,
      support_email: input.support_email || null,
      status: "active",
      onboarding_completed_at: new Date().toISOString(),
    })
    .select(
      "id, name, slug, category, country_code, default_currency, default_locale"
    )
    .single();

  if (bizError || !business) {
    const isDuplicateSlug = bizError?.code === "23505";
    return {
      error: {
        status: isDuplicateSlug ? 409 : 500,
        code: isDuplicateSlug ? "SLUG_TAKEN" : "BUSINESS_CREATE_FAILED",
        message: isDuplicateSlug
          ? "That store handle/slug is already taken. Try another name or slug."
          : "Could not create business workspace.",
      },
    };
  }

  const { error: memberError } = await serviceClient.from("memberships").insert({
    business_id: business.id,
    user_id: ownerUserId,
    role: "owner",
    status: "active",
  });

  const { data: location, error: locError } = await serviceClient
    .from("locations")
    .insert({
      business_id: business.id,
      name: "Main Location",
      address_line1: input.address_line1 || null,
      city: input.city || null,
      district: input.district || null,
      province: input.province || null,
      is_default: true,
      is_active: true,
    })
    .select("id")
    .single();

  const { error: subError } = await serviceClient.from("subscriptions").insert({
    business_id: business.id,
    plan_id: freePlan.id,
    billing_interval: "monthly",
    status: "active",
  });

  if (memberError || locError || subError || !location) {
    // Compensating cleanup so partial workspace records never linger
    await serviceClient.from("businesses").delete().eq("id", business.id);
    return {
      error: {
        status: 500,
        code: "WORKSPACE_PROVISION_INCOMPLETE",
        message: "Failed to finish setting up default location or subscription.",
      },
    };
  }

  await serviceClient.from("audit_logs").insert({
    business_id: business.id,
    actor_type: "merchant_user",
    actor_id: ownerUserId,
    action: "business.created",
    resource_type: "business",
    resource_id: business.id,
    metadata: {
      slug: business.slug,
      default_locale: business.default_locale,
      primary_channel: input.primary_channel,
    },
  });

  return {
    data: {
      business: business as ProvisionedBusinessResult["business"],
      defaultLocationId: location.id,
      planCode: freePlan.code,
    },
  };
}