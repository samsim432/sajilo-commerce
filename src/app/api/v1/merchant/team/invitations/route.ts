import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import {
  createStaffInvitation,
  listBusinessTeam,
} from "@/features/businesses/team-service";
import { ForbiddenRoleError, hasPermission } from "@/lib/security/rbac";

export async function GET() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", detail: "Active workspace session required." },
      { status: 401 }
    );
  }

  if (!hasPermission(workspace.role, "team:read")) {
    return NextResponse.json(
      { code: "FORBIDDEN_ROLE", detail: "You do not have access to view team members." },
      { status: 403 }
    );
  }

  const team = await listBusinessTeam(workspace.business.id);
  return NextResponse.json({ data: team });
}

export async function POST(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", detail: "Active workspace session required." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "BAD_REQUEST", detail: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  try {
    const result = await createStaffInvitation({
      businessId: workspace.business.id,
      actorUserId: workspace.userId,
      actorRole: workspace.role,
      rawInput: body,
    });

    if (result.error) {
      return NextResponse.json(
        {
          type: `https://sajilocommerce.com/errors/${result.error.code.toLowerCase().replaceAll("_", "-")}`,
          title: "Invitation Error",
          status: result.error.status,
          detail: result.error.message,
          code: result.error.code,
        },
        { status: result.error.status }
      );
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err) {
    if (err instanceof ForbiddenRoleError) {
      return NextResponse.json(
        { code: err.code, detail: err.message },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { code: "INTERNAL_ERROR", detail: "Unexpected server error." },
      { status: 500 }
    );
  }
}