
import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import {
  createMerchantOrder,
  listBusinessOrders,
} from "@/features/orders/order-service";
import {
  hashRequestPayload,
  lookupIdempotentResponse,
  storeIdempotentResponse,
} from "@/lib/security/idempotency";

export async function GET(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();

  if (!workspace) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  if (!hasPermission(workspace.role, "orders:read")) {
    return NextResponse.json(
      { code: "FORBIDDEN_ROLE" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);

  const orders = await listBusinessOrders({
    businessId: workspace.business.id,
    status: searchParams.get("status") ?? undefined,
    channel: searchParams.get("channel") ?? undefined,
    query: searchParams.get("q") ?? undefined,
  });

  return NextResponse.json({ data: orders });
}

export async function POST(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();

  if (!workspace) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  if (!hasPermission(workspace.role, "orders:create")) {
    return NextResponse.json(
      {
        code: "FORBIDDEN_ROLE",
        detail: "Your role cannot create orders.",
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      {
        code: "BAD_REQUEST",
        detail: "Invalid JSON payload.",
      },
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  const requestHash = hashRequestPayload(body);
  const scopeKey = `merchant-orders:${workspace.business.id}`;

  const replay = await lookupIdempotentResponse({
    scopeKey,
    idempotencyKey,
    requestHash,
  });

  // Check successful replay first so TypeScript narrows the result type.
  if (replay.hit) {
    return NextResponse.json(replay.body, {
      status: replay.status,
    });
  }

  // Handle an idempotency conflict.
  if (replay.conflict) {
    return NextResponse.json(
      {
        code: replay.conflict.code,
        detail: replay.conflict.message,
      },
      {
        status: replay.conflict.status,
      }
    );
  }

  const result = await createMerchantOrder({
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
      {
        status: result.error.status,
      }
    );
  }

  const responseBody = {
    data: result.data,
  };

  await storeIdempotentResponse({
    scopeKey,
    idempotencyKey,
    requestHash,
    status: 201,
    body: responseBody,
  });

  return NextResponse.json(responseBody, {
    status: 201,
  });
}
