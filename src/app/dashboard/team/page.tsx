import { redirect } from "next/navigation";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { listBusinessTeam } from "@/features/businesses/team-service";
import { hasPermission } from "@/lib/security/rbac";
import { TeamManager } from "@/features/businesses/team-manager";

export default async function TeamPage() {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    redirect("/dashboard/onboarding");
  }

  if (!hasPermission(workspace.role, "team:read")) {
    return (
      <div className="rounded-[14px] border border-soft bg-surface p-6">
        <h1 className="font-display text-xl font-bold text-charcoal">
          Team access restricted
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Your role ({workspace.role}) does not have permission to view team settings.
        </p>
      </div>
    );
  }

  const team = await listBusinessTeam(workspace.business.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-charcoal">
          Team &amp; Permissions
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Manage staff roles across {workspace.business.name}.
        </p>
      </div>

      <TeamManager
        canManage={hasPermission(workspace.role, "team:manage")}
        actorRole={workspace.role}
        currentUserId={workspace.userId}
        initialMembers={team.members}
        initialInvitations={team.invitations}
      />
    </div>
  );
}