import { Prisma, type PayoutType } from "@prisma/client";
import { CAPABILITIES, roleAllows, resolveCapability, approvalWithinLimit, type Capability } from "@/lib/governance-rules";
export { CAPABILITIES, roleAllows, resolveCapability };
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

export const CAPABILITY_LABELS: Record<Capability,string> = {
  REPORT_VIEW: "Consultar relatórios", ALERT_VIEW: "Consultar alertas", PAYOUT_APPROVE: "Aprovar repasses/antecipações",
  PAYOUT_SETTLE: "Registrar baixa de repasses", AUDIT_VIEW: "Consultar auditoria", CONFIG_VIEW: "Consultar parâmetros"
};
export async function hasCapability(user: SessionUser, capability: Capability, db: Pick<Prisma.TransactionClient, "userPermissionOverride"> = prisma): Promise<boolean> {
  if (!roleAllows(user.role, capability)) return false;
  if (user.role === "ADMIN") return true;
  const found = await db.userPermissionOverride.findUnique({ where: { userId_permission: { userId: user.id, permission: capability } } });
  return resolveCapability(user.role, capability, found?.allowed);
}
export async function capabilityList(user: SessionUser) {
  if (user.role === "ADMIN") return [...CAPABILITIES];
  const overrides = await prisma.userPermissionOverride.findMany({ where: { userId: user.id } });
  const map = new Map(overrides.map(item => [item.permission,item.allowed]));
  return CAPABILITIES.filter(c => resolveCapability(user.role,c,map.get(c)));
}
export async function ensureApprovalAuthority(tx: Prisma.TransactionClient, user: SessionUser, type: PayoutType, amountCents: bigint) {
  if (!(await hasCapability(user, "PAYOUT_APPROVE", tx))) throw new Error("REGRA:Usuário sem permissão para aprovar repasses ou antecipações.");
  if (user.role === "ADMIN") return;
  const grant = await tx.approvalAuthority.findUnique({ where: { userId_type: { userId:user.id, type } } });
  if (!approvalWithinLimit(user.role, amountCents, grant?.maxCents, grant?.active))
    throw new Error("REGRA:Valor superior à alçada autorizada ou alçada ainda não configurada.");
}
export const SETTINGS_DEFAULTS = {
  overdueDays: 0, payoutPendingDays: 2, unmatchedDays: 2, openRiskDays: 1
} as const;
export type SettingKey = keyof typeof SETTINGS_DEFAULTS;
export function validSetting(key:string, value: number):key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS,key) && Number.isSafeInteger(value) && value >= 0 && value <= 90;
}
export async function readSettings() {
  const rows=await prisma.financeSetting.findMany();
  const out:{[K in SettingKey]:number}={...SETTINGS_DEFAULTS};
  for(const r of rows){if(Object.prototype.hasOwnProperty.call(out,r.key)) {
    const n=Number(r.value);if(validSetting(r.key,n))out[r.key as SettingKey]=n;
  }}
  return out;
}
