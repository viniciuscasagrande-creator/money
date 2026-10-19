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
}) {
  const confirmedLoss = input.confirmedLossCents ?? 0n;
  const settledRight = input.settledProducerCents > confirmedLoss ? input.settledProducerCents - confirmedLoss : 0n;
  const totalReserves = input.mandatoryRetentionsCents + input.openRiskCents;
  const balanceAfterReservesCents = settledRight > totalReserves ? settledRight - totalReserves : 0n;
  const financialAvailableCents = balanceAfterReservesCents > input.previousPayoutsCents
    ? balanceAfterReservesCents - input.previousPayoutsCents
    : 0n;

  const tier = progressiveReleaseRateBps(input.soldPercentBps, input.postEventClosed ?? false);
  const triggerBps = input.salesTriggerBps ?? 3000;
  const effectiveReleaseBps = input.soldPercentBps < triggerBps && !(input.postEventClosed ?? false)
    ? 0
    : (input.customReleaseLimitBps ?? tier.releaseLimitBps);

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
  if (input.soldPercentBps < triggerBps && !(input.postEventClosed ?? false)) {
    blockingReasons.push(`Trava 01: Percentual de ingressos vendidos (${(input.soldPercentBps / 100).toFixed(2)}%) abaixo do gatilho mínimo (${(triggerBps / 100).toFixed(2)}%).`);
  }
  if (input.contractSigned === false) blockingReasons.push("Trava 07: Contrato do evento pendente de assinatura/vigência.");
  if (input.producerDocsValid === false) blockingReasons.push("Trava 08: Documentação cadastral/bancária do produtor pendente.");
  if (input.overdueExpensesActive === true) blockingReasons.push("Trava 10: Existem despesas críticas vencidas vinculadas ao evento.");
  if (input.manualBlockActive === true) blockingReasons.push(`Trava 20: Bloqueio manual justificado (${input.manualBlockReason || "Auditoria interna"}).`);

  if (input.criticalRiskActive === true || input.openRiskCents > 0n) {
    conditionalWarnings.push("Trava 09: Ocorrência de estorno/chargeback ativa — exige validação especial do Financeiro Interno.");
  }
  if (input.reconciliationApproved === false) {
    conditionalWarnings.push("Trava 13: Conciliação bancária pendente — sujeita à conferência do Financeiro antes da baixa.");
  }

  if (blockingReasons.length > 0) {
    maxNewRequestCents = 0n;
  }

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
    conditionalWarnings
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


