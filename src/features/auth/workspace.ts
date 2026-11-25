import { cookies, headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ACTIVE_BUSINESS_COOKIE = "sc_active_business_id";

export type MerchantRole =
  | "owner"
  | "admin"
  | "manager"
  | "staff"
  | "accountant"
  | "warehouse";

export interface ActiveWorkspace {
  userId: string;
  userEmail: string;
  business: {
    id: string;
    name: string;
    slug: string;
    category: string;
    country_code: string;
    default_currency: string;
    default_locale: "en" | "ne";
    status: "active" | "suspended" | "pending_deletion";
    onboarding_completed_at: string | null;
  };
  role: MerchantRole;
  allBusinesses: Array<{
    id: string;
    name: string;
    slug: string;
    role: MerchantRole;
  }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolves the authenticated user and active business workspace from X-Business-Id header
 * or sc_active_business_id cookie, verifying active membership in PostgreSQL.
 */
export async function resolveActiveWorkspace(): Promise<ActiveWorkspace | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const headerStore = await headers();
  const cookieStore = await cookies();

  const headerBusinessId = headerStore.get("x-business-id");
  const cookieBusinessId = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value;
  const requestedBusinessId =
    headerBusinessId && UUID_REGEX.test(headerBusinessId)
      ? headerBusinessId
      : cookieBusinessId && UUID_REGEX.test(cookieBusinessId)
        ? cookieBusinessId
        : null;

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select(
      `
      role,
      status,
      businesses:business_id (
        id,
        name,
        slug,
        category,
        country_code,
        default_currency,
        default_locale,
        status,
        onboarding_completed_at
      )
    `
    )
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !memberships || memberships.length === 0) {
    return null;
  }

  type MembershipRow = {
    role: MerchantRole;
    status: string;
    businesses: ActiveWorkspace["business"] | ActiveWorkspace["business"][] | null;
  };

  const normalized = (memberships as unknown as MembershipRow[])
    .map((m) => {
      const biz = Array.isArray(m.businesses) ? m.businesses[0] : m.businesses;
      return biz ? { role: m.role, business: biz } : null;
    })
    .filter((item): item is { role: MerchantRole; business: ActiveWorkspace["business"] } => item !== null);

  if (normalized.length === 0) {
    return null;
  }

  const selected =
    (requestedBusinessId
      ? normalized.find((item) => item.business.id === requestedBusinessId)
      : undefined) ?? normalized[0]!;

  // Set transaction-scoped tenant context for subsequent RLS queries in this request
  await supabase.rpc("set_tenant_context", {
    p_business_id: selected.business.id,
  });

  return {
    userId: user.id,
    userEmail: user.email ?? "",
    business: selected.business,
    role: selected.role,
    allBusinesses: normalized.map((item) => ({
      id: item.business.id,
      name: item.business.name,
      slug: item.business.slug,
      role: item.role,
    })),
  };
}