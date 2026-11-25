import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import {
  findOrCreateCustomerByPhone,
  listBusinessCustomers,
  upsertCustomerSchema,
} from "@/features/customers/customer-service";

export async function GET(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "customers:read")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const customers = await listBusinessCustomers({
    businessId: workspace.business.id,
    query: searchParams.get("q") ?? undefined,
  });

  return NextResponse.json({ data: customers });
}

export async function POST(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "customers:write")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = upsertCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        detail: parsed.error.issues[0]?.message ?? "Invalid customer details.",
      },
      { status: 422 }
    );
  }

  const result = await findOrCreateCustomerByPhone({
    businessId: workspace.business.id,
    fullName: parsed.data.full_name,
    rawPhone: parsed.data.phone,
    email: parsed.data.email || null,
    instagramHandle: parsed.data.instagram_handle || null,
    notes: parsed.data.notes || null,
    address: parsed.data.address,
  });

  if (result.error) {
    return NextResponse.json(
      { code: result.error.code, detail: result.error.message },
      { status: result.error.status }
    );
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
