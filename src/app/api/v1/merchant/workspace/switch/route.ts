import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_BUSINESS_COOKIE } from "@/features/auth/workspace";

const switchSchema = z.object({
  business_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = switchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("business_id", parsed.data.business_id)
    .eq("status", "active")
    .single();

  if (!membership) {
    return NextResponse.json({ code: "RESOURCE_NOT_FOUND" }, { status: 404 });
  }

  const response = NextResponse.json({ data: { active_business_id: parsed.data.business_id } });
  response.cookies.set(ACTIVE_BUSINESS_COOKIE, parsed.data.business_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
