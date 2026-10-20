import { Prisma } from "@prisma/client";
import {
  DEFAULT_PROGRESSIVE_TIERS,
  PAYOUT_LOCK_CATALOG,
  evaluatePayoutLocksAndCeiling,
  type ReleaseCalculationBase,
  type RetentionCategory
} from "@/lib/control-math";

export type EventRetentionItem = {
  id: string;
  eventId: string;
  category: RetentionCategory;
  description: string;
  beneficiary: string;
  documentRef: string;
  ownerName: string;
  dueDate: string | null;
  amountCents: string;
  status: "ACTIVE" | "RELEASED" | "CANCELED";
  createdAt: string;
  updatedAt: string;
};

export type EventLockPolicyConfig = {
  eventId: string;
  active: boolean;
  capacityTickets: number;
  soldTicketsOverride: number | null;
  salesTriggerBps: number;
  customReleaseLimitBps: number | null;
  calculationBase: ReleaseCalculationBase;
  potentialEventCents: string;
  contractSigned: boolean;
  producerDocsValid: boolean;
  reconciliationApproved: boolean;
  overdueExpensesActive: boolean;
  manualBlockActive: boolean;
  manualBlockReason: string;
  maxSingleRequestCents: string;
  maxCumulativeEventCents: string;
  postEventClosed: boolean;
  updatedAt: string;
};

export type EventFeeExtensionConfig = {
  eventId: string;
  channel: "ONLINE" | "POS" | "BILHETERIA";
  costBearer: "PRODUCER" | "SOUL" | "BUYER";
  spreadBps: number;
  advancedBps: number;
  rebateBps: number;
  installmentInterestBps: number;
  updatedAt: string;
};

export const RETENTION_CATEGORY_LABELS: Record<RetentionCategory, string> = {
  ECAD: "ECAD · Direitos autorais",
  ALUGUEL_ESPACO: "Aluguel do espaço (Teatro / Casa de shows)",
  EQUIPE_PRODUCAO: "Equipe e produção (Segurança, limpeza, técnicos)",
  TRIBUTOS_ENCARGOS: "Tributos e encargos fiscais",
  RESERVA_RISCO: "Reserva de risco (Estornos e chargebacks)",
  OUTRAS_DESPESAS: "Outras despesas contratuais do evento"
};

export function defaultLockPolicy(eventId: string): EventLockPolicyConfig {
  return {
    eventId,
    active: false,
    capacityTickets: 1000,
    soldTicketsOverride: null,
    salesTriggerBps: 5000,
    customReleaseLimitBps: null,
    calculationBase: "PRODUCER_NET_AFTER_RETENTIONS",
    potentialEventCents: "0",
    contractSigned: true,
    producerDocsValid: true,
    reconciliationApproved: true,
    overdueExpensesActive: false,
    manualBlockActive: false,
    manualBlockReason: "",
    maxSingleRequestCents: "0",
    maxCumulativeEventCents: "0",
    postEventClosed: false,
    updatedAt: new Date().toISOString()
  };
}

export function defaultFeeExtension(eventId: string): EventFeeExtensionConfig {
  return {
    eventId,
    channel: "ONLINE",
    costBearer: "PRODUCER",
    spreadBps: 0,
    advancedBps: 0,
    rebateBps: 0,
    installmentInterestBps: 0,
    updatedAt: new Date().toISOString()
  };
}

type DbClient = Prisma.TransactionClient;

export async function loadEventRetentions(tx: DbClient, eventId: string): Promise<EventRetentionItem[]> {
  const row = await tx.financeSetting.findUnique({ where: { key: `retentions:${eventId}` } });
  if (!row) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    throw new Error(`REGRA:Configuração de retenções corrompida para o evento ${eventId}.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`REGRA:Formato inválido de retenções para o evento ${eventId}.`);
  }
  return parsed as EventRetentionItem[];
}

export async function loadEventLockPolicy(tx: DbClient, eventId: string): Promise<EventLockPolicyConfig> {
  const row = await tx.financeSetting.findUnique({ where: { key: `locks:${eventId}` } });
  if (!row) return defaultLockPolicy(eventId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    throw new Error(`REGRA:Política de travas corrompida para o evento ${eventId}.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`REGRA:Formato inválido na política de travas do evento ${eventId}.`);
  }
  return { ...defaultLockPolicy(eventId), ...(parsed as Partial<EventLockPolicyConfig>), eventId };
}

export async function loadEventFeeExtension(tx: DbClient, eventId: string): Promise<EventFeeExtensionConfig> {
  const row = await tx.financeSetting.findUnique({ where: { key: `fee_ext:${eventId}` } });
  if (!row) return defaultFeeExtension(eventId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    throw new Error(`REGRA:Configuração estendida de taxas corrompida para o evento ${eventId}.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`REGRA:Formato inválido na configuração de taxas do evento ${eventId}.`);
  }
  return { ...defaultFeeExtension(eventId), ...(parsed as Partial<EventFeeExtensionConfig>), eventId };
}

export function sumActiveRetentionsCents(items: readonly EventRetentionItem[]): bigint {
  let sum = 0n;
  for (const item of items) {
    if (item.status === "ACTIVE" && /^\d+$/.test(item.amountCents)) {
      sum += BigInt(item.amountCents);
    }
  }
  return sum;
}

export function evaluateEventPolicy(params: {
  policy: EventLockPolicyConfig;
  retentions: readonly EventRetentionItem[];
  settledProducerCents: bigint;
  totalProducerNetCents: bigint;
  grossSoldCents: bigint;
  soldTicketsCount: number;
  openRiskCents: bigint;
  confirmedLossCents: bigint;
  committedPayoutsCents: bigint;
}) {
  const mandatoryRetentionsCents = sumActiveRetentionsCents(params.retentions);
  const soldTickets = params.policy.soldTicketsOverride !== null
    ? params.policy.soldTicketsOverride
    : params.soldTicketsCount;
  const capacity = Math.max(1, params.policy.capacityTickets || 1000);
  const soldPercentBps = params.policy.active
    ? Math.min(10000, Math.round((soldTickets * 10000) / capacity))
    : 10000;

  const evalResult = evaluatePayoutLocksAndCeiling({
    settledProducerCents: params.settledProducerCents,
    totalProducerNetCents: params.totalProducerNetCents,
    grossSoldCents: params.grossSoldCents,
    potentialEventCents: /^\d+$/.test(params.policy.potentialEventCents) ? BigInt(params.policy.potentialEventCents) : 0n,
    mandatoryRetentionsCents,
    openRiskCents: params.openRiskCents,
    confirmedLossCents: params.confirmedLossCents,
    previousPayoutsCents: params.committedPayoutsCents,
    soldPercentBps,
    salesTriggerBps: params.policy.active ? params.policy.salesTriggerBps : 0,
    customReleaseLimitBps: params.policy.active ? (params.policy.customReleaseLimitBps ?? undefined) : 10000,
    calculationBase: params.policy.calculationBase,
    postEventClosed: params.policy.active ? params.policy.postEventClosed : true,
    contractSigned: params.policy.active ? params.policy.contractSigned : true,
    producerDocsValid: params.policy.active ? params.policy.producerDocsValid : true,
    reconciliationApproved: params.policy.active ? params.policy.reconciliationApproved : true,
    criticalRiskActive: params.openRiskCents > 0n,
    overdueExpensesActive: params.policy.active ? params.policy.overdueExpensesActive : false,
    manualBlockActive: params.policy.active ? params.policy.manualBlockActive : false,
    manualBlockReason: params.policy.manualBlockReason,
    maxSingleRequestCents: params.policy.active && /^\d+$/.test(params.policy.maxSingleRequestCents)
      ? BigInt(params.policy.maxSingleRequestCents)
      : 0n,
    maxCumulativeEventCents: params.policy.active && /^\d+$/.test(params.policy.maxCumulativeEventCents)
      ? BigInt(params.policy.maxCumulativeEventCents)
      : 0n
  });

  return {
    mandatoryRetentionsCents,
    soldTickets,
    capacityTickets: capacity,
    soldPercentBps,
    ...evalResult,
    catalogCount: PAYOUT_LOCK_CATALOG.length,
    tiersCount: DEFAULT_PROGRESSIVE_TIERS.length
  };
}

export type ProducerFinancialPolicyConfig = {
  producerId: string;
  allowPayoutRequests: boolean;
  allowAdvanceRequests: boolean;
  allowEventTransfers: boolean;
  allowedTransferEventIds: string[];
  maxSingleTransferCents: string;
  maxTransferPercentBps: number;
  maxTransfersPerEvent: number;
  approvalPolicy: "FINANCE_SOUL" | "DUAL_INTERNAL";
  updatedAt: string;
};

export type EventTransferStatus = "REQUESTED" | "APPROVED" | "PRODUCER_ACCEPTED" | "EXECUTED" | "REJECTED" | "REVERSED";

export type EventTransferRecord = {
  id: string;
  producerId: string;
  producerName: string;
  sourceEventId: string;
  sourceEventName: string;
  targetEventId: string;
  targetEventName: string;
  amountCents: string;
  reason: string;
  status: EventTransferStatus;
  requestedById: string;
  approvedById: string | null;
  secondApprovedById?: string | null;
  producerAcceptedById: string | null;
  executedById: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export function defaultProducerFinancialPolicy(producerId: string): ProducerFinancialPolicyConfig {
  return {
    producerId,
    allowPayoutRequests: true,
    allowAdvanceRequests: true,
    allowEventTransfers: false,
    allowedTransferEventIds: [],
    maxSingleTransferCents: "0",
    maxTransferPercentBps: 10000,
    maxTransfersPerEvent: 10,
    approvalPolicy: "FINANCE_SOUL",
    updatedAt: new Date().toISOString()
  };
}

export async function loadProducerFinancialPolicy(tx: DbClient, producerId: string): Promise<ProducerFinancialPolicyConfig> {
  const row = await tx.financeSetting.findUnique({ where: { key: `producer_policy:${producerId}` } });
  if (!row) return defaultProducerFinancialPolicy(producerId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    throw new Error(`REGRA:Política financeira corrompida para o produtor ${producerId}.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`REGRA:Formato inválido na política financeira do produtor ${producerId}.`);
  }
  return { ...defaultProducerFinancialPolicy(producerId), ...(parsed as Partial<ProducerFinancialPolicyConfig>), producerId };
}

export async function loadEventTransfers(tx: DbClient): Promise<EventTransferRecord[]> {
  const row = await tx.financeSetting.findUnique({ where: { key: "event_transfers:all" } });
  if (!row) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    throw new Error("REGRA:Registro de transferências entre eventos corrompido no banco de dados.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("REGRA:Formato inválido no registro de transferências entre eventos.");
  }
  return parsed as EventTransferRecord[];
}

const ACTIVE_OUTGOING_TRANSFER_STATUSES: EventTransferStatus[] = ["REQUESTED", "APPROVED", "PRODUCER_ACCEPTED", "EXECUTED"];

export function sumEventTransferMovementsCents(transfers: readonly EventTransferRecord[], eventId: string) {
  let reservedOrExecutedOutCents = 0n;
  let executedInCents = 0n;
  let outgoingCount = 0;
  for (const t of transfers) {
    if (!/^\d+$/.test(t.amountCents)) continue;
    const amt = BigInt(t.amountCents);
    if (t.sourceEventId === eventId && ACTIVE_OUTGOING_TRANSFER_STATUSES.includes(t.status)) {
      reservedOrExecutedOutCents += amt;
      outgoingCount++;
    }
    if (t.targetEventId === eventId && t.status === "EXECUTED") {
      executedInCents += amt;
    }
  }
  return { reservedOrExecutedOutCents, executedInCents, outgoingCount };
}

