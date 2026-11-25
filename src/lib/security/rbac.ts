
import type { MerchantRole } from "@/features/auth/workspace";

export type Permission =
  | "billing:read"
  | "billing:manage"
  | "business:delete"
  | "team:read"
  | "team:manage"
  | "settings:read"
  | "settings:manage"
  | "store:read"
  | "store:edit_content"
  | "store:publish"
  | "products:read"
  | "products:write"
  | "inventory:read"
  | "inventory:adjust"
  | "orders:read"
  | "orders:create"
  | "orders:transition"
  | "orders:pack_dispatch"
  | "payments:read"
  | "payments:log_manual"
  | "payments:verify_settle"
  | "shipments:read"
  | "shipments:manage"
  | "shipping:read"
  | "shipping:write"
  | "finance:reconcile"
  | "customers:read"
  | "customers:write"
  | "analytics:sales"
  | "analytics:financial"
  | "analytics:stock";

const ROLE_PERMISSIONS: Record<
  MerchantRole,
  ReadonlySet<Permission>
> = {
  owner: new Set<Permission>([
    "billing:read",
    "billing:manage",
    "business:delete",
    "team:read",
    "team:manage",
    "settings:read",
    "settings:manage",
    "store:read",
    "store:edit_content",
    "store:publish",
    "products:read",
    "products:write",
    "inventory:read",
    "inventory:adjust",
    "orders:read",
    "orders:create",
    "orders:transition",
    "orders:pack_dispatch",
    "payments:read",
    "payments:log_manual",
    "payments:verify_settle",
    "shipments:read",
    "shipments:manage",
    "shipping:read",
    "shipping:write",
    "finance:reconcile",
    "customers:read",
    "customers:write",
    "analytics:sales",
    "analytics:financial",
    "analytics:stock",
  ]),

  admin: new Set<Permission>([
    "team:read",
    "team:manage",
    "settings:read",
    "settings:manage",
    "store:read",
    "store:edit_content",
    "store:publish",
    "products:read",
    "products:write",
    "inventory:read",
    "inventory:adjust",
    "orders:read",
    "orders:create",
    "orders:transition",
    "orders:pack_dispatch",
    "payments:read",
    "payments:log_manual",
    "payments:verify_settle",
    "shipments:read",
    "shipments:manage",
    "shipping:read",
    "shipping:write",
    "finance:reconcile",
    "customers:read",
    "customers:write",
    "analytics:sales",
    "analytics:financial",
    "analytics:stock",
  ]),

  manager: new Set<Permission>([
    "settings:read",
    "store:read",
    "store:edit_content",
    "products:read",
    "products:write",
    "inventory:read",
    "inventory:adjust",
    "orders:read",
    "orders:create",
    "orders:transition",
    "orders:pack_dispatch",
    "payments:read",
    "shipments:read",
    "shipments:manage",
    "shipping:read",
    "shipping:write",
    "customers:read",
    "customers:write",
    "analytics:sales",
    "analytics:stock",
  ]),

  staff: new Set<Permission>([
    "products:read",
    "inventory:read",
    "orders:read",
    "orders:create",
    "payments:log_manual",
    "shipments:read",
    "shipments:manage",
    "shipping:read",
    "shipping:write",
    "customers:read",
  ]),

  accountant: new Set<Permission>([
    "billing:read",
    "settings:read",
    "products:read",
    "inventory:read",
    "orders:read",
    "payments:read",
    "payments:verify_settle",
    "shipments:read",
    "shipping:read",
    "finance:reconcile",
    "customers:read",
    "analytics:sales",
    "analytics:financial",
  ]),

  warehouse: new Set<Permission>([
    "products:read",
    "inventory:read",
    "inventory:adjust",
    "orders:read",
    "orders:pack_dispatch",
    "shipments:read",
    "shipments:manage",
    "shipping:read",
    "shipping:write",
    "analytics:stock",
  ]),
};

export function hasPermission(
  role: MerchantRole,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function hasAnyPermission(
  role: MerchantRole,
  permissions: readonly Permission[]
): boolean {
  return permissions.some((permission) =>
    ROLE_PERMISSIONS[role].has(permission)
  );
}

export function canAssignRole(
  actorRole: MerchantRole,
  targetRole: Exclude<MerchantRole, "owner">
): boolean {
  if (actorRole === "owner") {
    return true;
  }

  if (actorRole === "admin") {
    return targetRole !== "admin";
  }

  return false;
}

export class ForbiddenRoleError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN_ROLE";

  constructor(role: MerchantRole, permission: Permission) {
    super(
      `Role '${role}' does not have permission '${permission}'.`
    );

    this.name = "ForbiddenRoleError";
  }
}

export function assertPermission(
  role: MerchantRole,
  permission: Permission
): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenRoleError(role, permission);
  }
}
