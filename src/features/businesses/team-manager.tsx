"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { MerchantRole } from "@/features/auth/workspace";

interface MemberItem {
  id: string;
  user_id: string;
  role: MerchantRole;
  status: string;
  profiles?: { full_name?: string; phone_e164?: string | null } | Array<{ full_name?: string; phone_e164?: string | null }> | null;
}

interface InvitationItem {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
}

const ASSIGNABLE_ROLES: Array<{ value: string; label: string; hint: string }> = [
  { value: "admin", label: "Admin", hint: "Full operations & settings (except billing)" },
  { value: "manager", label: "Manager", hint: "Orders, products, stock & store content" },
  { value: "staff", label: "Staff", hint: "Log social/phone orders & update deliveries" },
  { value: "accountant", label: "Accountant", hint: "Verify payments, COD settlements & reports" },
  { value: "warehouse", label: "Warehouse", hint: "Stock adjustments, packing & dispatch" },
];

export function TeamManager({
  canManage,
  actorRole,
  currentUserId,
  initialMembers,
  initialInvitations,
}: {
  canManage: boolean;
  actorRole: MerchantRole;
  currentUserId: string;
  initialMembers: MemberItem[];
  initialInvitations: InvitationItem[];
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("staff");
  const [loading, setLoading] = React.useState(false);
  const [latestInviteUrl, setLatestInviteUrl] = React.useState<string | null>(null);

  const availableRoles = ASSIGNABLE_ROLES.filter((r) =>
    actorRole === "owner" ? true : r.value !== "admin"
  );

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setLatestInviteUrl(null);

    try {
      const res = await fetch("/api/v1/merchant/team/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const payload = await res.json();

      if (!res.ok) {
        toast.error(payload?.detail ?? "Could not create invitation.");
        return;
      }

      setLatestInviteUrl(payload.data?.inviteUrl ?? null);
      setEmail("");
      toast.success("Staff invitation created (valid for 72 hours)");
      router.refresh();
    } catch {
      toast.error("Network error sending invitation.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    const res = await fetch(`/api/v1/merchant/team/members/${userId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      toast.error(payload?.detail ?? "Failed to remove team member.");
      return;
    }
    toast.success("Team member removed");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <form
          onSubmit={handleInvite}
          className="rounded-[14px] border border-soft bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(36,35,33,0.04)]"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-coral" />
            <h2 className="font-display text-base font-semibold text-charcoal">
              Invite team member
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-ink">
            Generate a 72-hour invite link with role-based permissions.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5 space-y-1">
              <Label htmlFor="invite-email" className="text-xs">
                Staff email
              </Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="staff@yourstore.com.np"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[40px] rounded-[10px] border-soft bg-surface"
              />
            </div>

            <div className="sm:col-span-4 space-y-1">
              <Label htmlFor="invite-role" className="text-xs">
                Role
              </Label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-[40px] w-full rounded-[10px] border border-soft bg-surface px-3 text-sm text-charcoal focus:border-coral focus:outline-none"
              >
                {availableRoles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.hint}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3 flex items-end">
              <Button
                type="submit"
                disabled={loading}
                className="h-[40px] w-full rounded-[10px] bg-coral font-semibold text-white hover:bg-coral-hover"
              >
                {loading ? "Creating..." : "Create invite"}
              </Button>
            </div>
          </div>

          {latestInviteUrl && (
            <div className="mt-4 flex items-center justify-between gap-2 rounded-[10px] border border-success-border bg-success-bg px-3.5 py-2.5 text-xs text-success-fg">
              <span className="truncate font-mono">{latestInviteUrl}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(latestInviteUrl);
                  toast.success("Invite link copied");
                }}
                className="inline-flex shrink-0 items-center gap-1 font-semibold underline"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          )}
        </form>
      )}

      {/* Active Members */}
      <div className="rounded-[14px] border border-soft bg-surface overflow-hidden shadow-[0_1px_2px_rgba(36,35,33,0.04)]">
        <div className="border-b border-soft bg-sand/40 px-5 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-ink">
            Active Team Members ({initialMembers.length})
          </h3>
        </div>
        <div className="divide-y divide-soft">
          {initialMembers.map((member) => {
            const prof = Array.isArray(member.profiles)
              ? member.profiles[0]
              : member.profiles;
            const displayName = prof?.full_name || member.user_id.slice(0, 8);
            const isSelf = member.user_id === currentUserId;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div>
                  <p className="text-sm font-semibold text-charcoal">
                    {displayName}{" "}
                    {isSelf ? (
                      <span className="text-xs font-normal text-muted-ink">(You)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-ink capitalize">
                    Role: {member.role}
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <StatusBadge label={member.role.toUpperCase()} tone="neutral" />
                  {canManage && !isSelf && member.role !== "owner" && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.user_id)}
                      className="rounded-[8px] border border-soft p-2 text-muted-ink hover:border-danger-border hover:bg-danger-bg hover:text-danger-fg transition-colors"
                      aria-label={`Remove ${displayName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending Invitations */}
      {initialInvitations.length > 0 && (
        <div className="rounded-[14px] border border-soft bg-surface overflow-hidden">
          <div className="border-b border-soft bg-sand/40 px-5 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-ink">
              Pending Invitations ({initialInvitations.length})
            </h3>
          </div>
          <div className="divide-y divide-soft">
            {initialInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div>
                  <p className="text-sm font-medium text-charcoal">{inv.email}</p>
                  <p className="text-xs text-muted-ink capitalize">
                    Role: {inv.role} · Expires{" "}
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge label="Pending" tone="warning" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}