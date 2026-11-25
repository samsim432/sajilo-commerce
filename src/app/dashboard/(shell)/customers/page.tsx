import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { listBusinessCustomers } from "@/features/customers/customer-service";
import { CustomersDirectoryClient } from "@/features/customers/customers-directory-client";

export default async function CustomersPage() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }
  if (!hasPermission(workspace.role, "customers:read")) {
    return (
      <div className="rounded-[14px] border border-soft bg-surface p-6">
        <h1 className="font-display text-xl font-bold text-charcoal">
          Customer CRM access restricted
        </h1>
      </div>
    );
  }

  const customers = await listBusinessCustomers({
    businessId: workspace.business.id,
  });

  return <CustomersDirectoryClient customers={customers as never} />;
}
