import * as React from "react";
import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }

  return <DashboardShell workspace={workspace}>{children}</DashboardShell>;
}
