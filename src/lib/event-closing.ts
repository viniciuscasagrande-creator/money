import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { eventAvailability } from "@/lib/operations";
import { loadEventLockPolicy } from "@/lib/payout-locks";
import { ruleError } from "@/lib/split-calculation";

type Db = Prisma.TransactionClient;

export type EventClosingReport = {
  eventId: string;
  eventName: string;
  eventStatus: string;
  producerId: string;
  producerName: string;
  sales: {
    totalSalesCount: number;
    soldTickets: number;
    grossSoldCents: string;
    mdrCents: string;
    soulFeeCents: string;
    netSettlementCents: string;
    producerNetCents: string;
    soulResultCents: string;
    settledSalesCount: number;
    awaitingSettlementCount: number;
    awaitingSettlementCents: string;
  };
  titles: {
    openReceivablesCount: number;
    openReceivablesCents: string;
    settledReceivablesCents: string;
    openPayablesCount: number;
    openPayablesCents: string;
    settledPayablesCents: string;
  };
  retentions: {
    activeCount: number;
    activeCents: string;
    releasedCount: number;
    releasedCents: string;
    canceledCount: number;
  };
  risks: {
    openCount: number;
    openExposureCents: string;
    confirmedCount: number;
    confirmedLossCents: string;
  };
  transfers: {
    reservedOutCents: string;
    executedOutCents: string;
    executedInCents: string;
  };
  payouts: {
    pendingCount: number;
    pendingCents: string;
    settledCount: number;
    settledCents: string;
  };
  accounting: {
    pendingEventsCount: number;
    postedEventsCount: number;
    errorEventsCount: number;
  };
  finalPosition: {
    producerTotalEarnedCents: string;
    confirmedLossesCents: string;
    activeRetentionsCents: string;
    settledPayoutsCents: string;
    netTransfersOutCents: string;
    netTransfersInCents: string;
    remainingPayableToProducerCents: string;
    soulFinalNetCents: string;
    readyToClose: boolean;
    closingBlockers: string[];
  };
  closingCertificate: {
    closedAt: string;
    closedById: string;
    statementHash: string;
    notes: string;
  } | null;
};

export async function buildEventClosingPosition(db: Db, eventId: string): Promise<EventClosingReport> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { producer: { select: { id: true, name: true } } }
  });
  if (!event) return ruleError("Evento não encontrado.");

  const [
    availability,
    sales,
    titles,
    reserves,
    risks,
    payouts,
    acctEvents,
    closingCertRow
  ] = await Promise.all([
    eventAvailability(db, eventId),
    db.financialSale.findMany({ where: { eventId } }),
    db.financialTitle.findMany({ where: { eventId } }),
    db.eventReserve.findMany({ where: { eventId } }),
    db.riskCase.findMany({ where: { eventId } }),
    db.payoutRequest.findMany({ where: { eventId } }),
    db.accountingBusinessEvent.findMany({ where: { eventId } }),
    db.financeSetting.findUnique({ where: { key: `event_closing:${eventId}` } })
  ]);

  let soldTickets = 0;
  let grossSoldCents = 0n;
  let mdrCents = 0n;
  let soulFeeCents = 0n;
  let netSettlementCents = 0n;
  let producerNetCents = 0n;
  let soulResultCents = 0n;
  let settledSalesCount = 0;
  let awaitingSettlementCount = 0;
  let awaitingSettlementCents = 0n;

  for (const s of sales) {
    soldTickets += s.quantity;
    grossSoldCents += s.grossCents;
    mdrCents += s.mdrCents;
    soulFeeCents += s.feeCents;
    netSettlementCents += s.netSettlementCents;
    producerNetCents += s.producerNetCents;
    soulResultCents += s.diskNetCents;
    if (s.status === "SETTLED") {
      settledSalesCount++;
    } else {
      awaitingSettlementCount++;
      awaitingSettlementCents += s.netSettlementCents;
    }
  }

  let openReceivablesCount = 0;
  let openReceivablesCents = 0n;
  let settledReceivablesCents = 0n;
  let openPayablesCount = 0;
  let openPayablesCents = 0n;
  let settledPayablesCents = 0n;

  for (const t of titles) {
    if (t.kind === "RECEIVABLE") {
      if (t.status === "OPEN") {
        openReceivablesCount++;
        openReceivablesCents += t.amountCents;
      } else if (t.status === "SETTLED") {
        settledReceivablesCents += t.amountCents;
      }
    } else {
      if (t.status === "OPEN") {
        openPayablesCount++;
        openPayablesCents += t.amountCents;
      } else if (t.status === "SETTLED") {
        settledPayablesCents += t.amountCents;
      }
    }
  }

  let activeRetCount = 0;
  let activeRetCents = 0n;
  let releasedRetCount = 0;
  let releasedRetCents = 0n;
  let canceledRetCount = 0;
  for (const r of reserves) {
    if (r.status === "ACTIVE") {
      activeRetCount++;
      activeRetCents += r.amountCents;
    } else if (r.status === "RELEASED") {
      releasedRetCount++;
      releasedRetCents += r.amountCents;
    } else {
      canceledRetCount++;
    }
  }

  let openRisksCount = 0;
  let openRisksCents = 0n;
  let confirmedRisksCount = 0;
  let confirmedRisksCents = 0n;
  for (const rk of risks) {
    if (rk.status === "OPEN") {
      openRisksCount++;
      openRisksCents += rk.exposureCents;
    } else if (rk.status === "CONFIRMED") {
      confirmedRisksCount++;
      confirmedRisksCents += rk.exposureCents;
    }
  }

  let pendingPayoutsCount = 0;
  let pendingPayoutsCents = 0n;
  let settledPayoutsCount = 0;
  let settledPayoutsCents = 0n;
  for (const p of payouts) {
    if (p.status === "SETTLED") {
      settledPayoutsCount++;
      settledPayoutsCents += p.amountCents;
    } else if (p.status !== "REJECTED") {
      pendingPayoutsCount++;
      pendingPayoutsCents += p.amountCents;
    }
  }

  const pendingAccountingCount = acctEvents.filter((a) => a.status === "PENDING").length;
  const postedAccountingCount = acctEvents.filter((a) => a.status === "POSTED").length;
  const errorAccountingCount = acctEvents.filter((a) => a.status === "ERROR").length;

  const netEarnedAfterLosses = producerNetCents > confirmedRisksCents ? producerNetCents - confirmedRisksCents : 0n;
  const totalOutflows = settledPayoutsCents + availability.transferExecutedCents + activeRetCents;
  const remainingPayableToProducerCents =
    netEarnedAfterLosses + availability.transferInCents > totalOutflows
      ? netEarnedAfterLosses + availability.transferInCents - totalOutflows
      : 0n;

  const closingBlockers: string[] = [];
  if (awaitingSettlementCount > 0) {
    closingBlockers.push(`Existem ${awaitingSettlementCount} venda(s) aguardando liquidação da adquirente.`);
  }
  if (openReceivablesCount > 0) {
    closingBlockers.push(`Existem ${openReceivablesCount} título(s) a receber em aberto vinculados ao evento.`);
  }
  if (openPayablesCount > 0) {
    closingBlockers.push(`Existem ${openPayablesCount} despesa(s)/título(s) a pagar em aberto vinculados ao evento.`);
  }
  if (openRisksCount > 0) {
    closingBlockers.push(`Existem ${openRisksCount} ocorrência(s) de risco (chargeback/estorno) pendentes de decisão.`);
  }
  if (activeRetCount > 0) {
    closingBlockers.push(`Existem ${activeRetCount} retenção(ões) obrigatória(s) ativa(s) aguardando liberação ou baixa.`);
  }
  if (pendingPayoutsCount > 0) {
    closingBlockers.push(`Existem ${pendingPayoutsCount} solicitação(ões) de repasse/antecipação em fluxo de aprovação.`);
  }
  if (availability.transferReservedCents > 0n) {
    closingBlockers.push("Existem transferências entre eventos reservadas e ainda não executadas.");
  }
  if (pendingAccountingCount > 0 || errorAccountingCount > 0) {
    closingBlockers.push(`Existem ${pendingAccountingCount + errorAccountingCount} evento(s) contábil(is) pendente(s) de contabilização.`);
  }
  if (remainingPayableToProducerCents > 0n) {
    closingBlockers.push("Existe saldo residual líquido a repassar ao produtor antes do encerramento definitivo.");
  }

  let closingCertificate: EventClosingReport["closingCertificate"] = null;
  if (closingCertRow) {
    try {
      closingCertificate = JSON.parse(closingCertRow.value);
    } catch {
      closingCertificate = null;
    }
  }

  return {
    eventId: event.id,
    eventName: event.name,
    eventStatus: event.status,
    producerId: event.producer.id,
    producerName: event.producer.name,
    sales: {
      totalSalesCount: sales.length,
      soldTickets,
      grossSoldCents: grossSoldCents.toString(),
      mdrCents: mdrCents.toString(),
      soulFeeCents: soulFeeCents.toString(),
      netSettlementCents: netSettlementCents.toString(),
      producerNetCents: producerNetCents.toString(),
      soulResultCents: soulResultCents.toString(),
      settledSalesCount,
      awaitingSettlementCount,
      awaitingSettlementCents: awaitingSettlementCents.toString()
    },
    titles: {
      openReceivablesCount,
      openReceivablesCents: openReceivablesCents.toString(),
      settledReceivablesCents: settledReceivablesCents.toString(),
      openPayablesCount,
      openPayablesCents: openPayablesCents.toString(),
      settledPayablesCents: settledPayablesCents.toString()
    },
    retentions: {
      activeCount: activeRetCount,
      activeCents: activeRetCents.toString(),
      releasedCount: releasedRetCount,
      releasedCents: releasedRetCents.toString(),
      canceledCount: canceledRetCount
    },
    risks: {
      openCount: openRisksCount,
      openExposureCents: openRisksCents.toString(),
      confirmedCount: confirmedRisksCount,
      confirmedLossCents: confirmedRisksCents.toString()
    },
    transfers: {
      reservedOutCents: availability.transferReservedCents.toString(),
      executedOutCents: availability.transferExecutedCents.toString(),
      executedInCents: availability.transferInCents.toString()
    },
    payouts: {
      pendingCount: pendingPayoutsCount,
      pendingCents: pendingPayoutsCents.toString(),
      settledCount: settledPayoutsCount,
      settledCents: settledPayoutsCents.toString()
    },
    accounting: {
      pendingEventsCount: pendingAccountingCount,
      postedEventsCount: postedAccountingCount,
      errorEventsCount: errorAccountingCount
    },
    finalPosition: {
      producerTotalEarnedCents: producerNetCents.toString(),
      confirmedLossesCents: confirmedRisksCents.toString(),
      activeRetentionsCents: activeRetCents.toString(),
      settledPayoutsCents: settledPayoutsCents.toString(),
      netTransfersOutCents: availability.transferExecutedCents.toString(),
      netTransfersInCents: availability.transferInCents.toString(),
      remainingPayableToProducerCents: remainingPayableToProducerCents.toString(),
      soulFinalNetCents: soulResultCents.toString(),
      readyToClose: closingBlockers.length === 0,
      closingBlockers
    },
    closingCertificate
  };
}

export async function executeAuditedEventClosing(
  db: Db,
  input: { eventId: string; notes: string; allowResidualBalanceWithJustification?: boolean },
  actor: { id: string; role: string }
) {
  if (actor.role !== "ADMIN" && actor.role !== "FINANCE_DISK") {
    return ruleError("Somente o Financeiro ou Administração podem encerrar eventos.");
  }
  if (input.notes.trim().length < 8) {
    return ruleError("Informe as notas de auditoria do fechamento do evento (mínimo de 8 caracteres).");
  }
  const report = await buildEventClosingPosition(db, input.eventId);
  if (report.eventStatus === "CLOSED") {
    return ruleError("Este evento já se encontra formalmente encerrado.");
  }
  const effectiveBlockers = input.allowResidualBalanceWithJustification && actor.role === "ADMIN"
    ? report.finalPosition.closingBlockers.filter(
        (b) => !b.includes("saldo residual líquido")
      )
    : report.finalPosition.closingBlockers;

  if (effectiveBlockers.length > 0) {
    return ruleError(`Fechamento bloqueado por pendências abertas: ${effectiveBlockers[0]}`);
  }

  const now = new Date().toISOString();
  const statementHash = createHash("sha256")
    .update(JSON.stringify({ eventId: report.eventId, sales: report.sales, finalPosition: report.finalPosition }))
    .digest("hex");

  const certificate = {
    closedAt: now,
    closedById: actor.id,
    statementHash,
    notes: input.notes.trim(),
    snapshot: report.finalPosition
  };

  await db.event.update({
    where: { id: input.eventId },
    data: { status: "CLOSED" }
  });

  const lockPolicy = await loadEventLockPolicy(db, input.eventId);
  const updatedPolicy = { ...lockPolicy, postEventClosed: true, updatedAt: now };
  await db.financeSetting.upsert({
    where: { key: `locks:${input.eventId}` },
    create: { key: `locks:${input.eventId}`, value: JSON.stringify(updatedPolicy), changedById: actor.id },
    update: { value: JSON.stringify(updatedPolicy), changedById: actor.id }
  });

  await db.financeSetting.upsert({
    where: { key: `event_closing:${input.eventId}` },
    create: { key: `event_closing:${input.eventId}`, value: JSON.stringify(certificate), changedById: actor.id },
    update: { value: JSON.stringify(certificate), changedById: actor.id }
  });

  await db.auditLog.create({
    data: {
      actorId: actor.id,
      action: "EVENT_CLOSED_AUDITED",
      entity: "Event",
      entityId: input.eventId,
      summary: `Fechamento financeiro auditado concluído para ${report.eventName} (Hash SHA-256 ${statementHash.slice(0, 12)}). Notas: ${input.notes.trim()}`
    }
  });

  return {
    eventId: input.eventId,
    status: "CLOSED",
    certificate
  };
}
