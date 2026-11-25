import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { canAssignRole, hasPermission } from "@/lib/security/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const updateRoleSchema = z.object({
  role: z.enum(["admin", "manager", "staff", "accountant", "warehouse"]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "team:manage")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (userId === workspace.userId) {
    return NextResponse.json(
      { code: "SELF_ROLE_LOCKED", detail: "You cannot change your own role." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", detail: "Invalid role specified." },
      { status: 422 }
    );
  }

  if (!canAssignRole(workspace.role, parsed.data.role)) {
    return NextResponse.json(
      { code: "FORBIDDEN_ROLE", detail: "Cannot assign equal or higher role." },
      { status: 403 }
    );
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: target } = await serviceClient
    .from("memberships")
    .select("id, role")
    .eq("business_id", workspace.business.id)
    .eq("user_id", userId)
    .single();

  if (!target) {
    return NextResponse.json({ code: "RESOURCE_NOT_FOUND" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json(
      { code: "OWNER_IMMUTABLE", detail: "Business owner role cannot be modified." },
      { status: 403 }
    );
  }

  await serviceClient
    .from("memberships")
    .update({ role: parsed.data.role })
    .eq("id", target.id);

  await serviceClient.from("audit_logs").insert({
    business_id: workspace.business.id,
    actor_type: "merchant_user",
    actor_id: workspace.userId,
    action: "team.role_updated",
    resource_type: "membership",
    resource_id: target.id,
    metadata: { target_user_id: userId, from: target.role, to: parsed.data.role },
  });

  return NextResponse.json({ data: { userId, role: parsed.data.role } });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "team:manage")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (userId === workspace.userId) {
    return NextResponse.json(
      { code: "SELF_REMOVAL_BLOCKED", detail: "You cannot remove yourself." },
      { status: 400 }
    );
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: target } = await serviceClient
    .from("memberships")
    .select("id, role")
    .eq("business_id", workspace.business.id)
    .eq("user_id", userId)
    .single();

  if (!target) {
    return NextResponse.json({ code: "RESOURCE_NOT_FOUND" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json(
      { code: "OWNER_IMMUTABLE", detail: "Business owner cannot be removed." },
      { status: 403 }
    );
  }

  await serviceClient.from("memberships").delete().eq("id", target.id);

  await serviceClient.from("audit_logs").insert({
    business_id: workspace.business.id,
    actor_type: "merchant_user",
    actor_id: workspace.userId,
    action: "team.member_removed",
    resource_type: "membership",
    resource_id: target.id,
    metadata: { target_user_id: userId, role: target.role },
  });

  return NextResponse.json({ data: { removed: true } });
}