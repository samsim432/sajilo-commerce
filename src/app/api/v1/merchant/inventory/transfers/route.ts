import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import {
  dispatchStockTransfer,
  listStockTransfers,
} from "@/features/inventory/transfer-service";

export async function GET() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "inventory:read")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const transfers = await listStockTransfers(workspace.business.id);
  return NextResponse.json({ data: transfers });
}

export async function POST(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "inventory:adjust")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const result = await dispatchStockTransfer({
    businessId: workspace.business.id,
    actorUserId: workspace.userId,
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
