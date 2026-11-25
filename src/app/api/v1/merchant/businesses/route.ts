import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { provisionBusinessWorkspace } from "@/features/businesses/onboarding";
import { ACTIVE_BUSINESS_COOKIE } from "@/features/auth/workspace";

function problemResponse(
  status: number,
  code: string,
  title: string,
  detail: string
) {
  return NextResponse.json(
    {
      type: `https://sajilocommerce.com/errors/${code.toLowerCase().replaceAll("_", "-")}`,
      title,
      status,
      detail,
      code,
    },
    { status }
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return problemResponse(
      401,
      "UNAUTHENTICATED",
      "Authentication Required",
      "Sign in before creating a business workspace."
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(
      400,
      "BAD_REQUEST",
      "Invalid JSON",
      "Request body must be valid JSON."
    );
  }

  const result = await provisionBusinessWorkspace(user.id, body as never);

  if (result.error || !result.data) {
    return problemResponse(
      result.error?.status ?? 500,
      result.error?.code ?? "INTERNAL_ERROR",
      "Workspace Creation Failed",
      result.error?.message ?? "Unable to create business."
    );
  }

  const response = NextResponse.json({ data: result.data }, { status: 201 });
  response.cookies.set(ACTIVE_BUSINESS_COOKIE, result.data.business.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}