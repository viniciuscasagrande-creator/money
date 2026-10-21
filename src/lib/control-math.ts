/** Regras puras e testáveis, todos os valores monetários são centavos bigint. */
export function adjustedAvailability(input: {
  total: bigint; settled: bigint; committed: bigint; openExposure: bigint; confirmedExposure: bigint; mandatoryRetentions?: bigint
}) {
  const retentions = input.mandatoryRetentions ?? 0n;
  const settledRight = input.settled - input.confirmedExposure;
  const totalRight = input.total - input.confirmedExposure;
  const unavailable = input.committed + input.openExposure + retentions;
  return {
    totalCents: totalRight > 0n ? totalRight : 0n,
    settledCents: settledRight > 0n ? settledRight : 0n,
    committedCents: input.committed,
    blockedCents: input.openExposure,
    retainedCents: retentions,
    confirmedLossCents: input.confirmedExposure,
    repasseCents: settledRight > unavailable ? settledRight - unavailable : 0n,
    antecipacaoCents: totalRight > unavailable ? totalRight - unavailable : 0n
  };
}
export function ledgerMatchesStatement(ledger: {bankAccountId:string; direction:string; amountCents:bigint}, line: {
  bankAccountId:string; direction:string; amountCents:bigint
}) { return ledger.bankAccountId === line.bankAccountId && ledger.direction === line.direction && ledger.amountCents === line.amountCents; }
export function accountingAccounts(origin: "OPENING"|"RECEIVABLE"|"PAYABLE"|"PAYOUT", direction: "CREDIT"|"DEBIT") {
  if (origin === "OPENING") return { debit: "Banco", credit: "Saldo de abertura / contrapartida a classificar" };
  if (origin === "RECEIVABLE" && direction === "CREDIT") return { debit: "Banco", credit: "Recebíveis / liquidação a classificar" };
  if (origin === "PAYOUT" && direction === "DEBIT") return { debit: "Obrigações com produtores (revisar)", credit: "Banco" };
  return direction === "DEBIT"
    ? { debit: "Despesas / contrapartida a classificar", credit: "Banco" }
    : { debit: "Banco", credit: "Receitas / contrapartida a classificar" };
}
export function csvCell(value:string) { return '"' + value.replace(/^[\t\r\n ]*[=+@-]/, prefix => "'" + prefix) .replaceAll('"','""') + '"'; }

export type RetentionCategory = "ECAD" | "ALUGUEL_ESPACO" | "EQUIPE_PRODUCAO" | "TRIBUTOS_ENCARGOS" | "RESERVA_RISCO" | "OUTRAS_DESPESAS";
export type ReleaseCalculationBase = "PRODUCER_NET_AFTER_RETENTIONS" | "GROSS_SOLD" | "POTENTIAL_TOTAL";
export type PayoutLockCategory = "IMPEDITIVA" | "CONDICIONAL" | "LIMITE";

export type PayoutLockDefinition = {
  code: string;
  number: string;
  title: string;
  condition: string;
  category: PayoutLockCategory;
};

export const PAYOUT_LOCK_CATALOG: readonly PayoutLockDefinition[] = [
  { code: "MIN_TICKETS_SOLD_PCT", number: "01", title: "Percentual de ingressos vendidos", condition: "Atingir o percentual mínimo de vendas definido", category: "LIMITE" },
  { code: "MAX_PAYOUT_PCT_TIER", number: "02", title: "Percentual máximo de repasse", condition: "Não ultrapassar o limite autorizado para a faixa de vendas", category: "LIMITE" },
  { code: "SETTLED_BALANCE_ONLY", number: "03", title: "Saldo efetivamente liquidado", condition: "Recursos recebidos e conciliados", category: "IMPEDITIVA" },
  { code: "MANDATORY_RETENTION", number: "04", title: "Retenção mínima obrigatória", condition: "Preservar valores destinados a ECAD, locação e despesas", category: "IMPEDITIVA" },
  { code: "EVENT_DATE_GATE", number: "05", title: "Data do evento", condition: "Bloquear ou limitar repasses antes de determinada data", category: "LIMITE" },
  { code: "EVENT_HORIZON_LIMIT", number: "06", title: "Prazo para realização", condition: "Aplicar limites mais rigorosos para eventos distantes", category: "LIMITE" },
  { code: "SIGNED_CONTRACT_REQUIRED", number: "07", title: "Contrato assinado", condition: "Exigir contrato vigente e formalizado", category: "IMPEDITIVA" },
  { code: "PRODUCER_DOCS_VALID", number: "08", title: "Documentação do produtor", condition: "Exigir documentação cadastral e bancária válida", category: "IMPEDITIVA" },
  { code: "CHARGEBACK_REFUND_HOLD", number: "09", title: "Chargebacks e estornos", condition: "Bloquear valores sob disputa ou risco", category: "CONDICIONAL" },
  { code: "OVERDUE_EXPENSES_BLOCK", number: "10", title: "Despesas vencidas", condition: "Impedir liberação quando houver obrigações críticas pendentes", category: "IMPEDITIVA" },
  { code: "ADVANCE_LIMIT_CAP", number: "11", title: "Limite de antecipações", condition: "Considerar antecipações já concedidas", category: "LIMITE" },
  { code: "FINANCIAL_HISTORY_SCORE", number: "12", title: "Histórico financeiro", condition: "Aplicar políticas conforme inadimplência e ocorrências", category: "CONDICIONAL" },
  { code: "BANK_RECONCILIATION_REQ", number: "13", title: "Conciliação bancária", condition: "Exigir conciliação das transações consideradas", category: "CONDICIONAL" },
  { code: "MAX_SINGLE_REQUEST", number: "14", title: "Limite por solicitação", condition: "Definir valor máximo por operação", category: "LIMITE" },
  { code: "MAX_CUMULATIVE_EVENT", number: "15", title: "Limite acumulado por evento", condition: "Impedir ultrapassar o teto total de repasses", category: "LIMITE" },
  { code: "REQUEST_FREQUENCY_COOLDOWN", number: "16", title: "Frequência de solicitações", condition: "Definir intervalo mínimo entre solicitações", category: "LIMITE" },
  { code: "FINANCE_AUTHORITY_APPROVAL", number: "17", title: "Aprovação financeira", condition: "Exigir autorização de usuário com alçada adequada", category: "CONDICIONAL" },
  { code: "DUAL_APPROVAL_HIGH_VALUE", number: "18", title: "Dupla aprovação", condition: "Exigir dois responsáveis para operações de maior valor", category: "CONDICIONAL" },
  { code: "DIGITAL_SIGNATURES_FLOW", number: "19", title: "Assinaturas digitais", condition: "Exigir formalização do produtor e da SOUL", category: "IMPEDITIVA" },
  { code: "MANUAL_JUSTIFIED_BLOCK", number: "20", title: "Bloqueio manual justificado", condition: "Permitir retenção excepcional com motivo e auditoria", category: "IMPEDITIVA" }
] as const;

export type ProgressiveTier = { label: string; minSoldBps: number; maxSoldBps: number; releaseLimitBps: number };
export const DEFAULT_PROGRESSIVE_TIERS: readonly ProgressiveTier[] = [
  { label: "Abaixo de 30%", minSoldBps: 0, maxSoldBps: 2999, releaseLimitBps: 0 },
  { label: "De 30% a 49,99%", minSoldBps: 3000, maxSoldBps: 4999, releaseLimitBps: 1000 },
  { label: "De 50% a 69,99%", minSoldBps: 5000, maxSoldBps: 6999, releaseLimitBps: 2000 },
  { label: "De 70% a 89,99%", minSoldBps: 7000, maxSoldBps: 8999, releaseLimitBps: 3500 },
  { label: "De 90% a 99,99%", minSoldBps: 9000, maxSoldBps: 9999, releaseLimitBps: 5000 },
  { label: "100% vendido", minSoldBps: 10000, maxSoldBps: 10000, releaseLimitBps: 6000 },
  { label: "Após evento e fechamento", minSoldBps: 10001, maxSoldBps: 10001, releaseLimitBps: 10000 }
] as const;

export function progressiveReleaseRateBps(soldPercentBps: number, postEventClosed = false): { label: string; releaseLimitBps: number } {
  if (postEventClosed) return { label: "Após evento e fechamento", releaseLimitBps: 10000 };
  const clamped = Math.max(0, Math.min(10000, Math.trunc(soldPercentBps)));
  for (const tier of DEFAULT_PROGRESSIVE_TIERS) {
    if (clamped >= tier.minSoldBps && clamped <= tier.maxSoldBps) {
      return { label: tier.label, releaseLimitBps: tier.releaseLimitBps };
    }
  }
  return { label: "Abaixo de 30%", releaseLimitBps: 0 };
}

export type EvaluatedPayoutLock = {
  code: string;
  number: string;
  title: string;
  category: PayoutLockCategory;
  enforcementType: "EFFECTIVE_BLOCK" | "ACTIVE_CEILING" | "ADVISORY_WARNING" | "WORKFLOW_REQUIREMENT";
  status: "PASSED" | "BLOCKED" | "WARNING" | "LIMIT_APPLIED";
  message: string;
};

export function evaluatePayoutLocksAndCeiling(input: {
  settledProducerCents: bigint;
  totalProducerNetCents?: bigint;
  grossSoldCents?: bigint;
  potentialEventCents?: bigint;
  mandatoryRetentionsCents: bigint;
  openRiskCents: bigint;
  confirmedLossCents?: bigint;
  previousPayoutsCents: bigint;
  soldPercentBps: number;
  salesTriggerBps?: number;
  customReleaseLimitBps?: number;
  calculationBase?: ReleaseCalculationBase;
  postEventClosed?: boolean;
  contractSigned?: boolean;
  producerDocsValid?: boolean;
  reconciliationApproved?: boolean;
  criticalRiskActive?: boolean;
  overdueExpensesActive?: boolean;
  manualBlockActive?: boolean;
  manualBlockReason?: string;
  maxSingleRequestCents?: bigint;
  maxCumulativeEventCents?: bigint;
  releaseGateDateIso?: string | null;
  nowIso?: string;
  daysUntilEvent?: number | null;
  maxHorizonDays?: number | null;
  horizonReducerBps?: number;
  advanceCommittedCents?: bigint;
  maxAdvanceCents?: bigint;
  producerHistoryScore?: number;
  minProducerHistoryScore?: number;
  hoursSinceLastRequest?: number | null;
  minCooldownHours?: number;
  hasEligibleApproverAuthority?: boolean;
  dualApprovalRequired?: boolean;
  dualApprovalThresholdCents?: bigint;
  requireDigitalSignatures?: boolean;
}) {
  const postClosed = input.postEventClosed ?? false;
  const confirmedLoss = input.confirmedLossCents ?? 0n;
  const settledRight = input.settledProducerCents > confirmedLoss ? input.settledProducerCents - confirmedLoss : 0n;
  const totalReserves = input.mandatoryRetentionsCents + input.openRiskCents;
  const balanceAfterReservesCents = settledRight > totalReserves ? settledRight - totalReserves : 0n;
  const financialAvailableCents = balanceAfterReservesCents > input.previousPayoutsCents
    ? balanceAfterReservesCents - input.previousPayoutsCents
    : 0n;

  const tier = progressiveReleaseRateBps(input.soldPercentBps, postClosed);
  const triggerBps = input.salesTriggerBps ?? 3000;
  let effectiveReleaseBps = input.soldPercentBps < triggerBps && !postClosed
    ? 0
    : (input.customReleaseLimitBps ?? tier.releaseLimitBps);

  const horizonDays = input.daysUntilEvent ?? null;
  const maxHorizon = input.maxHorizonDays ?? null;
  const horizonReducer = input.horizonReducerBps ?? 0;
  const horizonExceeded = !postClosed && maxHorizon !== null && maxHorizon > 0 && horizonDays !== null && horizonDays > maxHorizon;
  if (horizonExceeded && horizonReducer > 0 && horizonReducer < 10000) {
    effectiveReleaseBps = Math.max(0, Math.round((effectiveReleaseBps * (10000 - horizonReducer)) / 10000));
  }

  const calcBase: ReleaseCalculationBase = input.calculationBase ?? "PRODUCER_NET_AFTER_RETENTIONS";
  let baseAmountCents = balanceAfterReservesCents;
  if (calcBase === "GROSS_SOLD") {
    const gross = input.grossSoldCents ?? settledRight;
    baseAmountCents = gross > totalReserves ? gross - totalReserves : 0n;
  } else if (calcBase === "POTENTIAL_TOTAL") {
    const pot = input.potentialEventCents ?? settledRight;
    baseAmountCents = pot > totalReserves ? pot - totalReserves : 0n;
  }

  const cumulativeCommercialCeilingCents = (baseAmountCents * BigInt(effectiveReleaseBps) + 5000n) / 10000n;
  let commercialRemainingCents = cumulativeCommercialCeilingCents > input.previousPayoutsCents
    ? cumulativeCommercialCeilingCents - input.previousPayoutsCents
    : 0n;

  if (input.maxCumulativeEventCents !== undefined && input.maxCumulativeEventCents > 0n) {
    const remCap = input.maxCumulativeEventCents > input.previousPayoutsCents
      ? input.maxCumulativeEventCents - input.previousPayoutsCents
      : 0n;
    if (remCap < commercialRemainingCents) commercialRemainingCents = remCap;
  }

  let maxNewRequestCents = commercialRemainingCents < financialAvailableCents ? commercialRemainingCents : financialAvailableCents;
  if (input.maxSingleRequestCents !== undefined && input.maxSingleRequestCents > 0n && input.maxSingleRequestCents < maxNewRequestCents) {
    maxNewRequestCents = input.maxSingleRequestCents;
  }

  const blockingReasons: string[] = [];
  const conditionalWarnings: string[] = [];

  if (financialAvailableCents <= 0n) blockingReasons.push("Trava 03/04: Ausência de saldo liquidado disponível após retenções obrigatórias e repasses anteriores.");
  if (input.soldPercentBps < triggerBps && !postClosed) {
    blockingReasons.push(`Trava 01: Percentual de ingressos vendidos (${(input.soldPercentBps / 100).toFixed(2)}%) abaixo do gatilho mínimo (${(triggerBps / 100).toFixed(2)}%).`);
  }

  const nowMs = input.nowIso ? new Date(input.nowIso).getTime() : Date.now();
  const gateMs = input.releaseGateDateIso ? new Date(input.releaseGateDateIso).getTime() : null;
  const dateGateBlocked = !postClosed && gateMs !== null && !Number.isNaN(gateMs) && nowMs < gateMs;
  if (dateGateBlocked) {
    blockingReasons.push(`Trava 05: Repasses bloqueados antes da data-marco (${input.releaseGateDateIso!.slice(0, 10)}).`);
  }

  const horizonHardBlocked = horizonExceeded && (horizonReducer === 0 || horizonReducer >= 10000);
  if (horizonHardBlocked) {
    blockingReasons.push(`Trava 06: Prazo até o evento (${horizonDays} dias) excede o horizonte máximo autorizado (${maxHorizon} dias).`);
  } else if (horizonExceeded && horizonReducer > 0) {
    conditionalWarnings.push(`Trava 06: Redutor de horizonte (${(horizonReducer / 100).toFixed(2)}%) aplicado por distância do evento (${horizonDays} dias).`);
  }

  if (input.contractSigned === false) blockingReasons.push("Trava 07: Contrato do evento pendente de assinatura/vigência.");
  if (input.producerDocsValid === false) blockingReasons.push("Trava 08: Documentação cadastral/bancária do produtor pendente.");
  if (input.overdueExpensesActive === true) blockingReasons.push("Trava 10: Existem despesas críticas vencidas vinculadas ao evento.");

  const advCommitted = input.advanceCommittedCents ?? 0n;
  const maxAdv = input.maxAdvanceCents ?? 0n;
  const advanceCapExceeded = maxAdv > 0n && advCommitted > maxAdv;
  if (advanceCapExceeded) {
    blockingReasons.push("Trava 11: Limite máximo de antecipações concedidas para o evento foi ultrapassado.");
  }

  const prodScore = input.producerHistoryScore ?? 100;
  const minScore = input.minProducerHistoryScore ?? 60;
  const scoreBlocked = prodScore < minScore;
  if (scoreBlocked) {
    blockingReasons.push(`Trava 12: Score de histórico financeiro do produtor (${prodScore}) abaixo do mínimo exigido (${minScore}).`);
  }

  const cooldownMin = input.minCooldownHours ?? 0;
  const hoursSinceLast = input.hoursSinceLastRequest ?? null;
  const cooldownBlocked = cooldownMin > 0 && hoursSinceLast !== null && hoursSinceLast < cooldownMin;
  if (cooldownBlocked) {
    blockingReasons.push(`Trava 16: Intervalo mínimo entre solicitações (${cooldownMin}h) ainda não decorrido (${hoursSinceLast}h desde o último pedido).`);
  }

  if (input.hasEligibleApproverAuthority === false) {
    blockingReasons.push("Trava 17: Ausência de aprovador com alçada financeira ativa para autorizar a operação.");
  }

  if (input.manualBlockActive === true) blockingReasons.push(`Trava 20: Bloqueio manual justificado (${input.manualBlockReason || "Auditoria interna"}).`);

  if (input.criticalRiskActive === true || input.openRiskCents > 0n) {
    conditionalWarnings.push("Trava 09: Ocorrência de estorno/chargeback ativa — exige validação especial do Financeiro Interno.");
  }
  if (input.reconciliationApproved === false) {
    conditionalWarnings.push("Trava 13: Conciliação bancária pendente — sujeita à conferência do Financeiro antes da baixa.");
  }
  if (input.dualApprovalRequired === true) {
    conditionalWarnings.push("Trava 18: Política de dupla aprovação interna ativa — exige dois signatários internos distintos.");
  }

  if (blockingReasons.length > 0) {
    maxNewRequestCents = 0n;
  }

  const statusByCode: Record<string, { enforcementType: EvaluatedPayoutLock["enforcementType"]; status: EvaluatedPayoutLock["status"]; message: string }> = {
    MIN_TICKETS_SOLD_PCT: {
      enforcementType: "EFFECTIVE_BLOCK",
      status: input.soldPercentBps < triggerBps && !postClosed ? "BLOCKED" : "PASSED",
      message: `Vendido ${(input.soldPercentBps / 100).toFixed(2)}% vs gatilho ${(triggerBps / 100).toFixed(2)}%`
    },
    MAX_PAYOUT_PCT_TIER: {
      enforcementType: "ACTIVE_CEILING",
      status: commercialRemainingCents <= 0n && !postClosed ? "BLOCKED" : "LIMIT_APPLIED",
      message: `Faixa ${tier.label} autoriza ${(effectiveReleaseBps / 100).toFixed(2)}% sobre a base`
    },
    SETTLED_BALANCE_ONLY: {
      enforcementType: "EFFECTIVE_BLOCK",
      status: settledRight <= 0n || financialAvailableCents <= 0n ? "BLOCKED" : "PASSED",
      message: settledRight > 0n ? "Saldo efetivamente liquidado confirmado" : "Sem saldo liquidado disponível"
    },
    MANDATORY_RETENTION: {
      enforcementType: "EFFECTIVE_BLOCK",
      status: input.mandatoryRetentionsCents > 0n ? "LIMIT_APPLIED" : "PASSED",
      message: input.mandatoryRetentionsCents > 0n ? "Retenções obrigatórias deduzidas prioritariamente" : "Sem retenções obrigatórias pendentes"
    },
    EVENT_DATE_GATE: {
      enforcementType: "EFFECTIVE_BLOCK",
      status: dateGateBlocked ? "BLOCKED" : "PASSED",
      message: dateGateBlocked ? `Bloqueado até ${input.releaseGateDateIso!.slice(0, 10)}` : "Marco temporal atendido"
    },
    EVENT_HORIZON_LIMIT: {
      enforcementType: horizonHardBlocked ? "EFFECTIVE_BLOCK" : "ACTIVE_CEILING",
      status: horizonHardBlocked ? "BLOCKED" : horizonExceeded ? "LIMIT_APPLIED" : "PASSED",
      message: horizonExceeded ? `Evento a ${horizonDays} dias (limite ${maxHorizon}d)` : "Horizonte de realização regular"
    },
    SIGNED_CONTRACT_REQUIRED: {
      enforcementType: "EFFECTIVE_BLOCK",
      status: input.contractSigned === false ? "BLOCKED" : "PASSED",
      message: input.contractSigned === false ? "Contrato pendente de assinatura" : "Contrato assinado e vigente"
    },
    PRODUCER_DOCS_VALID: {
      enforcementType: "EFFECTIVE_BLOCK",
      status: input.producerDocsValid === false ? "BLOCKED" : "PASSED",
      message: input.producerDocsValid === false ? "Documentação cadastral/bancária pendente" : "Documentação do produtor validada"
    },
    CHARGEBACK_REFUND_HOLD: {
      enforcementType: "ADVISORY_WARNING",
      status: input.criticalRiskActive === true || input.openRiskCents > 0n ? "WARNING" : "PASSED",
      message: input.openRiskCents > 0n ? "Exposição de disputa retida cautelarmente" : "Sem disputas abertas"
    },
    OVERDUE_EXPENSES_BLOCK: {
      enforcementType: "EFFECTIVE_BLOCK",
      status: input.overdueExpensesActive === true ? "BLOCKED" : "PASSED",
      message: input.overdueExpensesActive === true ? "Despesas críticas vencidas bloqueiam liberação" : "Sem despesas críticas vencidas"
    },
    ADVANCE_LIMIT_CAP: {
      enforcementType: "ACTIVE_CEILING",
      status: advanceCapExceeded ? "BLOCKED" : advCommitted > 0n ? "LIMIT_APPLIED" : "PASSED",
      message: advanceCapExceeded ? "Limite de antecipações excedido" : "Antecipações dentro do teto"
    },
    FINANCIAL_HISTORY_SCORE: {
      enforcementType: "EFFECTIVE_BLOCK",
      status: scoreBlocked ? "BLOCKED" : "PASSED",
      message: `Score financeiro ${prodScore}/${minScore}`
    },
    BANK_RECONCILIATION_REQ: {
      enforcementType: "WORKFLOW_REQUIREMENT",
      status: input.reconciliationApproved === false ? "WARNING" : "PASSED",
      message: input.reconciliationApproved === false ? "Bloqueia a baixa final até conciliação bancária" : "Conciliação aprovada"
    },
    MAX_SINGLE_REQUEST: {
      enforcementType: "ACTIVE_CEILING",
      status: input.maxSingleRequestCents && input.maxSingleRequestCents > 0n ? "LIMIT_APPLIED" : "PASSED",
      message: input.maxSingleRequestCents && input.maxSingleRequestCents > 0n ? "Teto por operação individual ativo" : "Limitado pelo saldo comercial disponível"
    },
    MAX_CUMULATIVE_EVENT: {
      enforcementType: "ACTIVE_CEILING",
      status: input.maxCumulativeEventCents && input.maxCumulativeEventCents > 0n
        ? (input.previousPayoutsCents >= input.maxCumulativeEventCents ? "BLOCKED" : "LIMIT_APPLIED")
        : "PASSED",
      message: input.maxCumulativeEventCents && input.maxCumulativeEventCents > 0n ? "Teto acumulado por evento ativo" : "Limitado pela faixa progressiva do evento"
    },
    REQUEST_FREQUENCY_COOLDOWN: {
      enforcementType: "EFFECTIVE_BLOCK",
      status: cooldownBlocked ? "BLOCKED" : "PASSED",
      message: cooldownBlocked ? `Aguardar intervalo mínimo de ${cooldownMin}h` : "Frequência de solicitações regular"
    },
    FINANCE_AUTHORITY_APPROVAL: {
      enforcementType: "WORKFLOW_REQUIREMENT",
      status: input.hasEligibleApproverAuthority === false ? "BLOCKED" : "PASSED",
      message: "Exige alçada individual ativa do aprovador financeiro"
    },
    DUAL_APPROVAL_HIGH_VALUE: {
      enforcementType: "WORKFLOW_REQUIREMENT",
      status: input.dualApprovalRequired ? "WARNING" : "PASSED",
      message: input.dualApprovalRequired ? "Exige dois aprovadores internos distintos" : "Aprovação financeira padrão"
    },
    DIGITAL_SIGNATURES_FLOW: {
      enforcementType: "WORKFLOW_REQUIREMENT",
      status: input.requireDigitalSignatures === false ? "WARNING" : "PASSED",
      message: "Fluxo formal Aprovação -> Aceite do Produtor -> Assinatura SOUL ativo"
    },
    MANUAL_JUSTIFIED_BLOCK: {
      enforcementType: "EFFECTIVE_BLOCK",
      status: input.manualBlockActive === true ? "BLOCKED" : "PASSED",
      message: input.manualBlockActive === true ? `Bloqueado: ${input.manualBlockReason || "Auditoria interna"}` : "Sem bloqueio manual ativo"
    }
  };

  const evaluatedLocks: EvaluatedPayoutLock[] = PAYOUT_LOCK_CATALOG.map((def) => {
    const info = statusByCode[def.code] ?? {
      enforcementType: "EFFECTIVE_BLOCK",
      status: "PASSED",
      message: "Regra verificada"
    };
    return {
      code: def.code,
      number: def.number,
      title: def.title,
      category: def.category,
      enforcementType: info.enforcementType,
      status: info.status,
      message: info.message
    };
  });

  return {
    tierLabel: tier.label,
    releaseLimitBps: effectiveReleaseBps,
    calculationBase: calcBase,
    balanceAfterReservesCents,
    financialAvailableCents,
    cumulativeCommercialCeilingCents,
    commercialRemainingCents,
    maxNewRequestCents,
    eligible: blockingReasons.length === 0 && maxNewRequestCents > 0n,
    blockingReasons,
    conditionalWarnings,
    evaluatedLocks
  };
}

export type ProducerApprovalPolicy = "FINANCE_SOUL" | "DUAL_INTERNAL";

export function evaluateEventTransferEligibility(input: {
  sourceProducerId: string;
  targetProducerId: string;
  sourceEventId: string;
  targetEventId: string;
  amountCents: bigint;
  sourceFinancialAvailableCents: bigint;
  sourceLockBlockingReasons: readonly string[];
  allowEventTransfers: boolean;
  allowedTransferEventIds?: readonly string[];
  maxSingleTransferCents?: bigint;
  maxTransferPercentBps?: number;
  maxTransfersPerEvent?: number;
  currentSourceTransferCount?: number;
}) {
  const errors: string[] = [];
  if (input.sourceProducerId !== input.targetProducerId) {
    errors.push("Operação bloqueada: transferências entre produtores distintos são estritamente proibidas.");
  }
  if (input.sourceEventId === input.targetEventId) {
    errors.push("Operação inválida: o evento de origem e o evento de destino devem ser distintos.");
  }
  if (!input.allowEventTransfers) {
    errors.push("Permissão desabilitada: o Financeiro SOUL não habilitou transferências entre eventos para este produtor.");
  }
  const allowedIds = input.allowedTransferEventIds ?? [];
  if (allowedIds.length > 0 && (!allowedIds.includes(input.sourceEventId) || !allowedIds.includes(input.targetEventId))) {
    errors.push("Restrição contratual: um ou ambos os eventos selecionados não estão habilitados para transferência cruzada.");
  }
  for (const reason of input.sourceLockBlockingReasons) {
    errors.push(`Evento de origem bloqueado (${reason})`);
  }

  const pctBps = Math.min(10000, Math.max(0, input.maxTransferPercentBps ?? 10000));
  const pctCapCents = (input.sourceFinancialAvailableCents * BigInt(pctBps) + 5000n) / 10000n;
  let maxTransferableCents = pctCapCents < input.sourceFinancialAvailableCents ? pctCapCents : input.sourceFinancialAvailableCents;
  if (input.maxSingleTransferCents !== undefined && input.maxSingleTransferCents > 0n && input.maxSingleTransferCents < maxTransferableCents) {
    maxTransferableCents = input.maxSingleTransferCents;
  }

  const maxCount = input.maxTransfersPerEvent ?? 10;
  const currentCount = input.currentSourceTransferCount ?? 0;
  if (currentCount >= maxCount) {
    errors.push(`Limite de quantidade atingido: máximo de ${maxCount} transferência(s) para o evento de origem.`);
  }
  if (input.amountCents <= 0n) {
    errors.push("O valor da transferência deve ser maior que zero.");
  } else if (input.amountCents > maxTransferableCents) {
    errors.push("Valor solicitado excede o limite transferível do evento de origem após retenções obrigatórias (ECAD/locação) e riscos.");
  }

  return {
    allowed: errors.length === 0,
    maxTransferableCents,
    errors
  };
}

export function applyInternalEventTransfers(input: {
  sourceBalanceCents: bigint;
  targetBalanceCents: bigint;
  transferAmountCents: bigint;
}) {
  if (input.transferAmountCents <= 0n || input.transferAmountCents > input.sourceBalanceCents) {
    throw new Error("REGRA:Saldo insuficiente no evento de origem para transferência interna.");
  }
  const newSourceBalanceCents = input.sourceBalanceCents - input.transferAmountCents;
  const newTargetBalanceCents = input.targetBalanceCents + input.transferAmountCents;
  if (newSourceBalanceCents + newTargetBalanceCents !== input.sourceBalanceCents + input.targetBalanceCents) {
    throw new Error("Falha de conservação financeira na transferência entre eventos.");
  }
  return {
    newSourceBalanceCents,
    newTargetBalanceCents,
    consolidatedTotalCents: newSourceBalanceCents + newTargetBalanceCents
  };
}


