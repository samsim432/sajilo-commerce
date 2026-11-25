import crypto from "node:crypto";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { MerchantRole } from "@/features/auth/workspace";
import { assertPermission, canAssignRole } from "@/lib/security/rbac";
import { getPublicEnv } from "@/lib/env";

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid staff email address."),
  role: z.enum(["admin", "manager", "staff", "accountant", "warehouse"]),
});

export type InvitableRole = z.infer<typeof inviteMemberSchema>["role"];

function hashInviteToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function listBusinessTeam(businessId: string) {
  const serviceClient = createSupabaseServiceClient();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    serviceClient
      .from("memberships")
      .select(
        `
        id,
        user_id,
        role,
        status,
        created_at,
        profiles:user_id (
          full_name,
          phone_e164
        )
      `
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    serviceClient
      .from("invitations")
      .select("id, email, role, status, expires_at, created_at")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return {
    members: members ?? [],
    invitations: invitations ?? [],
  };
}

export async function createStaffInvitation(params: {
  businessId: string;
  actorUserId: string;
  actorRole: MerchantRole;
  rawInput: unknown;
}) {
  assertPermission(params.actorRole, "team:manage");

  const parsed = inviteMemberSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid invitation payload.",
      },
    };
  }

  const { email, role } = parsed.data;
  if (!canAssignRole(params.actorRole, role)) {
    return {
      error: {
        status: 403,
        code: "FORBIDDEN_ROLE",
        message: `Your role (${params.actorRole}) cannot invite a user as ${role}.`,
      },
    };
  }

  const serviceClient = createSupabaseServiceClient();

  // Check active subscription staff seat limit
  const { data: subscription } = await serviceClient
    .from("subscriptions")
    .select("override_limits, plans:plan_id(limits)")
    .eq("business_id", params.businessId)
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
  const maxSeats =
    typeof effectiveLimits.max_staff_seats === "number"
      ? effectiveLimits.max_staff_seats
      : 1;

  if (maxSeats !== -1) {
    const [{ count: activeCount }, { count: pendingCount }] = await Promise.all([
      serviceClient
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("business_id", params.businessId)
        .eq("status", "active"),
      serviceClient
        .from("invitations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", params.businessId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString()),
    ]);

    const occupiedSeats = (activeCount ?? 0) + (pendingCount ?? 0);
    if (occupiedSeats >= maxSeats) {
      return {
        error: {
          status: 402,
          code: "PLAN_QUOTA_EXCEEDED",
          message: `Your current plan allows up to ${maxSeats} team seat(s). Upgrade your plan to invite more staff.`,
        },
      };
    }
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { data: invitation, error } = await serviceClient
    .from("invitations")
    .insert({
      business_id: params.businessId,
      email,
      role,
      token_hash: tokenHash,
      invited_by: params.actorUserId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id, email, role, status, expires_at, created_at")
    .single();

  if (error || !invitation) {
    return {
      error: {
        status: 500,
        code: "INVITATION_CREATE_FAILED",
        message: "Unable to create staff invitation.",
      },
    };
  }

  await serviceClient.from("audit_logs").insert({
    business_id: params.businessId,
    actor_type: "merchant_user",
    actor_id: params.actorUserId,
    action: "team.invitation_created",
    resource_type: "invitation",
    resource_id: invitation.id,
    metadata: { email, role },
  });

  const { NEXT_PUBLIC_APP_URL } = getPublicEnv();
  const inviteUrl = `${NEXT_PUBLIC_APP_URL}/signup?invite=${rawToken}`;

  return {
    data: {
      invitation,
      inviteUrl,
    },
  };
}