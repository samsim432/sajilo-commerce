import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import {
  listBusinessPaymentOverview,
  upsertMerchantPaymentConfig,
} from "@/features/payments/payment-service";

export async function GET() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "payments:read")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const overview = await listBusinessPaymentOverview(workspace.business.id);
  return NextResponse.json({ data: overview });
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
  const result = await upsertMerchantPaymentConfig({
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


