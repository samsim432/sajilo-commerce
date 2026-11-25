import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import {
  applyManualStockAdjustment,
  getInventorySnapshot,
} from "@/features/inventory/inventory-service";

export async function GET(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "inventory:read")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("location_id") ?? undefined;
  const snapshot = await getInventorySnapshot({
    businessId: workspace.business.id,
    locationId,
  });

  return NextResponse.json({ data: snapshot });
}

export async function POST(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "inventory:adjust")) {
    return NextResponse.json(
      { code: "FORBIDDEN_ROLE", detail: "Your role cannot adjust inventory levels." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const result = await applyManualStockAdjustment({
    businessId: workspace.business.id,
    actorUserId: workspace.userId,
    rawInput: body,
  });

  if (result.error) {
    return NextResponse.json(
      {
        code: result.error.code,
        detail: result.error.message,
      },
      { status: result.error.status }
    );
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
