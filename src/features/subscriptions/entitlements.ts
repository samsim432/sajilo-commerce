import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type NumericQuotaKey =
  | "max_products"
  | "max_locations"
  | "max_staff_seats"
  | "max_custom_domains";

export class PlanQuotaExceededError extends Error {
  readonly status = 402;
  readonly code = "PLAN_QUOTA_EXCEEDED";
  readonly quotaKey: NumericQuotaKey;
  readonly limit: number;
  readonly current: number;

  constructor(quotaKey: NumericQuotaKey, limit: number, current: number) {
    super(
      `Plan limit reached for ${quotaKey.replace("max_", "")}: ${current}/${limit}. Upgrade your plan to add more.`
    );
    this.name = "PlanQuotaExceededError";
    this.quotaKey = quotaKey;
    this.limit = limit;
    this.current = current;
  }
}

export async function getEffectivePlanLimits(
  businessId: string
): Promise<Record<string, unknown>> {
  const serviceClient = createSupabaseServiceClient();
  const { data: subscription } = await serviceClient
    .from("subscriptions")
    .select("override_limits, plans:plan_id(limits)")
    .eq("business_id", businessId)
    .single();

  type SubRow = {
    override_limits: Record<string, unknown> | null;
    plans:
      | { limits?: Record<string, unknown> }
      | Array<{ limits?: Record<string, unknown> }>
      | null;
  };

  const sub = subscription as unknown as SubRow | null;
  const planObj = Array.isArray(sub?.plans) ? sub?.plans[0] : sub?.plans;

  return {
    ...(planObj?.limits ?? {}),
    ...(sub?.override_limits ?? {}),
  };
}

export async function assertNumericQuota(
  businessId: string,
  quotaKey: NumericQuotaKey
): Promise<{ limit: number; current: number }> {
  const limits = await getEffectivePlanLimits(businessId);
  const rawLimit = limits[quotaKey];
  const limit = typeof rawLimit === "number" ? rawLimit : 25;

  if (limit === -1) {
    return { limit: -1, current: 0 };
  }

  const serviceClient = createSupabaseServiceClient();
  let current = 0;

  if (quotaKey === "max_products") {
    const { count } = await serviceClient
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .is("deleted_at", null);
    current = count ?? 0;
  } else if (quotaKey === "max_locations") {
    const { count } = await serviceClient
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("is_active", true);
    current = count ?? 0;
  } else if (quotaKey === "max_staff_seats") {
    const [{ count: activeCount }, { count: pendingCount }] = await Promise.all([
      serviceClient
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "active"),
      serviceClient
        .from("invitations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString()),
    ]);
    current = (activeCount ?? 0) + (pendingCount ?? 0);
  }

  if (current >= limit) {
    throw new PlanQuotaExceededError(quotaKey, limit, current);
  }

  return { limit, current };
}
