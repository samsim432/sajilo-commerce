import { describe, expect, it } from "vitest";
import {
  assertPermission,
  canAssignRole,
  ForbiddenRoleError,
  hasPermission,
} from "@/lib/security/rbac";

describe("6-role RBAC permission matrix", () => {
  it("grants Owner full billing, deletion, team, and commerce permissions", () => {
    expect(hasPermission("owner", "billing:manage")).toBe(true);
    expect(hasPermission("owner", "business:delete")).toBe(true);
    expect(hasPermission("owner", "team:manage")).toBe(true);
    expect(hasPermission("owner", "payments:verify_settle")).toBe(true);
  });

  it("restricts Admin from billing management and business deletion", () => {
    expect(hasPermission("admin", "team:manage")).toBe(true);
    expect(hasPermission("admin", "store:publish")).toBe(true);
    expect(hasPermission("admin", "billing:manage")).toBe(false);
    expect(hasPermission("admin", "business:delete")).toBe(false);
    expect(canAssignRole("admin", "manager")).toBe(true);
    expect(canAssignRole("admin", "admin")).toBe(false);
  });

  it("restricts Warehouse to inventory, packing/dispatch, and stock analytics", () => {
    expect(hasPermission("warehouse", "inventory:adjust")).toBe(true);
    expect(hasPermission("warehouse", "orders:pack_dispatch")).toBe(true);
    expect(hasPermission("warehouse", "billing:read")).toBe(false);
    expect(hasPermission("warehouse", "payments:read")).toBe(false);
    expect(() => assertPermission("warehouse", "billing:read")).toThrow(
      ForbiddenRoleError
    );
  });

  it("allows Accountant to verify/settle payments and read billing without mutating stock", () => {
    expect(hasPermission("accountant", "payments:verify_settle")).toBe(true);
    expect(hasPermission("accountant", "billing:read")).toBe(true);
    expect(hasPermission("accountant", "analytics:financial")).toBe(true);
    expect(hasPermission("accountant", "inventory:adjust")).toBe(false);
    expect(hasPermission("accountant", "products:write")).toBe(false);
  });

  it("allows Staff to create orders and log manual payments without viewing financial analytics", () => {
    expect(hasPermission("staff", "orders:create")).toBe(true);
    expect(hasPermission("staff", "payments:log_manual")).toBe(true);
    expect(hasPermission("staff", "analytics:financial")).toBe(false);
    expect(hasPermission("staff", "team:manage")).toBe(false);
  });
});