import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/features/businesses/settings-client";

export default async function SettingsPage() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }

  if (!hasPermission(workspace.role, "settings:read")) {
    return (
      <div className="rounded-[14px] border border-soft bg-surface p-6">
        <h1 className="font-display text-xl font-bold text-charcoal">
          Settings access restricted
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Your role ({workspace.role}) does not have permission to view business settings.
        </p>
      </div>
    );
  }

  const serviceClient = createSupabaseServiceClient();
  const [{ data: business }, { data: locations }] = await Promise.all([
    serviceClient
      .from("businesses")
      .select(
        "id, name, slug, category, default_locale, support_phone_e164, support_email, tax_registered, pan_vat_number"
      )
      .eq("id", workspace.business.id)
      .single(),
    serviceClient
      .from("locations")
      .select("id, name, address_line1, city, district, province, is_default, is_active")
      .eq("business_id", workspace.business.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);

  if (!business) {
    redirect("/dashboard/onboarding");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-charcoal">
          Business Settings
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Configure store details, Nepali/English preference, PAN/VAT, and branch locations.
        </p>
      </div>

      <SettingsClient
        canManage={hasPermission(workspace.role, "settings:manage")}
        business={business as never}
        locations={(locations ?? []) as never}
      />
    </div>
  );
}
