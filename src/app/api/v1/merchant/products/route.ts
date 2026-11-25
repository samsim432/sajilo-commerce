import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import {
  createBusinessProduct,
  listBusinessProducts,
} from "@/features/products/product-service";

export async function GET(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "products:read")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const products = await listBusinessProducts({
    businessId: workspace.business.id,
    query: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    categoryId: searchParams.get("category_id") ?? undefined,
  });

  return NextResponse.json({ data: products });
}

export async function POST(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "products:write")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const result = await createBusinessProduct({
    businessId: workspace.business.id,
    actorUserId: workspace.userId,
    rawInput: body,
  });

  if (result.error) {
    return NextResponse.json(
      {
        type: `https://sajilocommerce.com/errors/${result.error.code.toLowerCase().replaceAll("_", "-")}`,
        title: "Product Error",
        status: result.error.status,
        detail: result.error.message,
        code: result.error.code,
      },
      { status: result.error.status }
    );
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
