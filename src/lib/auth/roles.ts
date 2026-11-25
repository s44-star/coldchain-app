import type { Enums } from "@/types/database";

type Role = Enums<"member_role">;

/** UI-level permission checks. The database enforces the same rules with RLS. */
export const can = {
  manageTeam: (role: Role) => role === "owner" || role === "admin",
  editCompany: (role: Role) => role === "owner" || role === "admin",
  manageBilling: (role: Role) => role === "owner",
  transferOwnership: (role: Role) => role === "owner",
};

/** Roles an Owner/Admin may hand out. Ownership moves only by transfer. */
export const ASSIGNABLE_ROLES: Role[] = ["admin", "warehouse_manager", "operator", "viewer"];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control, billing and company deletion",
  admin: "Manages team, warehouses and settings",
  warehouse_manager: "Configures assigned warehouses, zones and sensors",
  operator: "Handles alerts, incidents and maintenance tasks",
  viewer: "Sees dashboards and reports",
};
