export const GLOBAL_ROLES = [
  "super_admin",
  "command_staff",
  "evidence_tech",
  "officer",
  "viewer",
] as const;

export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export function roleRank(role: GlobalRole): number {
  const order: GlobalRole[] = [
    "viewer",
    "officer",
    "evidence_tech",
    "command_staff",
    "super_admin",
  ];
  return order.indexOf(role);
}

export function canManageUsers(role: GlobalRole): boolean {
  return role === "super_admin" || role === "command_staff";
}

export function canAdminRetention(role: GlobalRole): boolean {
  return role === "super_admin" || role === "command_staff" || role === "evidence_tech";
}

export function canDeleteEvidence(role: GlobalRole): boolean {
  return role === "super_admin" || role === "command_staff" || role === "evidence_tech";
}
