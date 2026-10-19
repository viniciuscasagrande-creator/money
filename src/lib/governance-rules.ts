/** Matriz imutável de permissões máximas por perfil. */
export type GrantRole = "ADMIN" | "FINANCE_DISK" | "PRODUCER";
export const CAPABILITIES = ["REPORT_VIEW", "ALERT_VIEW", "PAYOUT_APPROVE", "PAYOUT_SETTLE", "AUDIT_VIEW", "CONFIG_VIEW"] as const;
export type Capability = typeof CAPABILITIES[number];
export function roleAllows(role: GrantRole, capability: Capability): boolean {
  if (role === "ADMIN") return true;
  if (role === "FINANCE_DISK") return capability !== "AUDIT_VIEW" && capability !== "CONFIG_VIEW";
  return capability === "REPORT_VIEW";
}
export function resolveCapability(role: GrantRole, capability: Capability, override?: boolean | null): boolean {
  return role === "ADMIN" ? true : roleAllows(role, capability) && override !== false;
}
export function approvalWithinLimit(role:GrantRole, amountCents:bigint, maxCents?:bigint, active=false):boolean {
  if(role === "ADMIN")return true;
  return role==="FINANCE_DISK" && active && maxCents!==undefined && amountCents>=0n && amountCents<=maxCents;
}
