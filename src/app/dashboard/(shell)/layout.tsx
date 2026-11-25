
import * as React from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function DashboardShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
    </Suspense>
  );
}

async function AuthenticatedDashboard({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await resolveActiveWorkspace();

  if (!workspace) {
    redirect("/dashboard/onboarding");
  }

  return (
    <DashboardShell workspace={workspace}>
      {children}
    </DashboardShell>
  );
}

function DashboardLoading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-ivory"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        <p className="text-sm text-slate-600">
          Loading your workspace...
        </p>
      </div>
    </div>
  );
}
