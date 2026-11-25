import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { createOrderPaymentIntent } from "@/features/payments/payment-service";

export async function POST(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "payments:log_manual")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const result = await createOrderPaymentIntent({
    businessId: workspace.business.id,
    rawInput: body,
  });

  if (result.error) {
    return NextResponse.json(
      { code: result.error.code, detail: result.error.message },
      { status: result.error.status }
    );
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}


