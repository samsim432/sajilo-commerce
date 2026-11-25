import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { verifyAndCapturePaymentIntent } from "@/features/payments/payment-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "payments:verify_settle")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const result = await verifyAndCapturePaymentIntent({
    businessId: workspace.business.id,
    intentId: id,
    actorUserId: workspace.userId,
    rawInput: body,
  });

  if (result.error) {
    return NextResponse.json(
      { code: result.error.code, detail: result.error.message },
      { status: result.error.status }
    );
  }

  return NextResponse.json({
    data: result.data,
    already_verified: result.alreadyVerified,
  });
}
