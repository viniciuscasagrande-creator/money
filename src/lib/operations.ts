import { Prisma, PayoutStatus, PayoutType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCents } from "@/lib/money";
import { adjustedAvailability } from "@/lib/control-math";
import type { SessionUser } from "@/lib/auth";

import { ruleError, saleBreakdown } from "@/lib/split-calculation";
export { nonnegativeCents, percentageCents, ruleError, saleBreakdown } from "@/lib/split-calculation";

export async function registerSale(raw: {
  eventId: string; externalReference: string; mdrRuleId: string; unitPriceCents: string; quantity: number
}, user: SessionUser) {
  return prisma.$transaction(async tx => {
    const [event, mdr, fee] = await Promise.all([
      tx.event.findUnique({ where: { id: raw.eventId }, include: { producer: { select: { active: true } } } }),
      tx.mdrRule.findUnique({ where: { id: raw.mdrRuleId }, include: { gateway: true, brand: true } }),
      tx.eventFeePolicy.findUnique({ where: { eventId: raw.eventId } })
    ]);
    if (!event || !event.producer.active || event.status === "CLOSED") return ruleError("Evento indisponível.");
    if (!mdr || !mdr.active || !mdr.gateway.active || !mdr.brand.active) return ruleError("Regra de MDR indisponível.");
    if (!fee || !fee.active) return ruleError("Configure primeiro a taxa da Disk para este evento.");
    const parts = saleBreakdown({ unitPriceCents: parseCents(raw.unitPriceCents), quantity: raw.quantity,
      feeMode: fee.mode, feeValue: fee.value, mdrRateBps: mdr.rateBps, mdrFixedCents: mdr.fixedCents, producerPaysMdr: fee.producerPaysMdr });
    const title = await tx.financialTitle.create({ data: {
      kind: "RECEIVABLE", description: `Liquidação adquirente · ${raw.externalReference}`,
      amountCents: parts.netSettlement, producerId: event.producerId, eventId: event.id, createdById: user.id
    } });
    const sale = await tx.financialSale.create({ data: {
      externalReference: raw.externalReference, producerId: event.producerId, eventId: event.id,
      gatewayId: mdr.gatewayId, brandId: mdr.brandId, mdrRuleId: mdr.id, feePolicyId: fee.id,
      quantity: raw.quantity, unitPriceCents: parseCents(raw.unitPriceCents),
      grossCents: parts.gross, feeModeAtSale: fee.mode, feeValueAtSale: fee.value,
      producerPaysMdrAtSale: fee.producerPaysMdr, mdrRateBpsAtSale: mdr.rateBps, mdrFixedCentsAtSale: mdr.fixedCents,
      feeCents: parts.fee, mdrCents: parts.mdr,
      netSettlementCents: parts.netSettlement, producerNetCents: parts.producerNet,
      diskNetCents: parts.diskNet, receivableTitleId: title.id, createdById: user.id
    } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "SALE_REGISTERED", entity: "FinancialSale", entityId: sale.id,
      summary: `Venda registrada e recebível interno vinculado. Referência ${raw.externalReference}.` } });
    return sale;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

type Db = Prisma.TransactionClient;
const reservedStatuses: PayoutStatus[] = ["REQUESTED", "APPROVED", "PRODUCER_ACCEPTED", "READY_TO_SETTLE", "SETTLED"];
export async function eventAvailability(tx: Db, eventId: string) {
  const [total, settled, reserved, exposure] = await Promise.all([
    tx.financialSale.aggregate({ where: { eventId }, _sum: { producerNetCents: true } }),
    tx.financialSale.aggregate({ where: { eventId, status: "SETTLED" }, _sum: { producerNetCents: true } }),
    tx.payoutRequest.aggregate({ where: { eventId, status: { in: reservedStatuses } }, _sum: { amountCents: true } }),
    tx.riskCase.groupBy({ by: ["status"], where: { eventId, status: { in: ["OPEN", "CONFIRMED"] } }, _sum: { exposureCents: true } })
  ]);
  return adjustedAvailability({
    total: total._sum.producerNetCents ?? 0n,
    settled: settled._sum.producerNetCents ?? 0n,
    committed: reserved._sum.amountCents ?? 0n,
    openExposure: exposure.find(r => r.status === "OPEN")?._sum.exposureCents ?? 0n,
    confirmedExposure: exposure.find(r => r.status === "CONFIRMED")?._sum.exposureCents ?? 0n
  });
}
export const eventAvailabilityDTO = (id: string, name: string, a: Awaited<ReturnType<typeof eventAvailability>>) => ({
  id, name, totalCents: a.totalCents.toString(), settledCents: a.settledCents.toString(),
  committedCents: a.committedCents.toString(), blockedCents: a.blockedCents.toString(),
  confirmedLossCents: a.confirmedLossCents.toString(), repasseCents: a.repasseCents.toString(),
  antecipacaoCents: a.antecipacaoCents.toString()
});

export async function createPayout(raw: { eventId: string; type: PayoutType; amountCents: string }, user: SessionUser) {
  const amountCents = parseCents(raw.amountCents);
  return prisma.$transaction(async tx => {
    const event = await tx.event.findUnique({ where: { id: raw.eventId }, include: { producer: { select: { active: true } } } });
    if (!event || !event.producer.active) return ruleError("Evento indisponível.");
    if (user.role === "PRODUCER" && event.producerId !== user.producerId) return ruleError("Evento não pertence ao produtor autenticado.");
    const capacity = await eventAvailability(tx, event.id);
    const max = raw.type === "REPASSE" ? capacity.repasseCents : capacity.antecipacaoCents;
    if (amountCents > max) return ruleError("Valor superior ao limite apurado para esta operação.");
    const payout = await tx.payoutRequest.create({ data: {
      type: raw.type, amountCents, producerId: event.producerId, eventId: event.id, requestedById: user.id
    } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "PAYOUT_REQUESTED", entity: "PayoutRequest", entityId: payout.id,
      summary: `${raw.type === "REPASSE" ? "Repasse" : "Antecipação"} solicitado(a); saldo reservado para evitar solicitação duplicada.` } });
    return payout;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
}

type Action = "APPROVE" | "REJECT" | "PRODUCER_ACCEPT" | "FINANCE_SIGN" | "SETTLE";
export async function actOnPayout(id: string, action: Action, user: SessionUser, args: { reason?: string; bankAccountId?: string; settlementReference?: string }) {
  return prisma.$transaction(async tx => {
    const p = await tx.payoutRequest.findUnique({ where: { id } });
    if (!p) return ruleError("Solicitação não encontrada.");
    const internal = user.role === "ADMIN" || user.role === "FINANCE_DISK";
    const producer = user.role === "PRODUCER" && user.producerId === p.producerId;
    const now = new Date();
    const audit = async (name: string, summary: string) => tx.auditLog.create({ data: { actorId: user.id, entity: "PayoutRequest", entityId: id, action: name, summary } });
    let update: Prisma.PayoutRequestUncheckedUpdateManyInput;
    let expected: PayoutStatus;
    if (action === "APPROVE") {
      if (!internal || p.status !== "REQUESTED") return ruleError("Somente o Financeiro pode aprovar solicitações pendentes.");
      expected = "REQUESTED"; update = { status: "APPROVED", approvedAt: now, approvedById: user.id };
    } else if (action === "REJECT") {
      if (!internal || !["REQUESTED", "APPROVED"].includes(p.status)) return ruleError("Esta solicitação não pode ser reprovada.");
      if (!args.reason || args.reason.trim().length < 8) return ruleError("Informe o motivo da reprovação (mínimo de oito caracteres).");
      expected = p.status; update = { status: "REJECTED", rejectionReason: args.reason.trim(), rejectedAt: now };
    } else if (action === "PRODUCER_ACCEPT") {
      if (!producer || p.status !== "APPROVED") return ruleError("Aceite permitido apenas ao produtor titular após aprovação.");
      expected = "APPROVED"; update = { status: "PRODUCER_ACCEPTED", producerAcceptedById: user.id, producerAcceptedAt: now };
    } else if (action === "FINANCE_SIGN") {
      if (!internal || p.status !== "PRODUCER_ACCEPTED") return ruleError("O Financeiro só pode assinar após o aceite do produtor.");
      expected = "PRODUCER_ACCEPTED"; update = { status: "READY_TO_SETTLE", financeSignedById: user.id, financeSignedAt: now };
    } else {
      if (!internal || p.status !== "READY_TO_SETTLE") return ruleError("É necessário concluir as aprovações e aceites antes da baixa.");
      if (!args.settlementReference || args.settlementReference.trim().length < 8) return ruleError("Informe a referência de comprovação da transferência já realizada.");
      if (!args.bankAccountId) return ruleError("Selecione a conta da baixa.");
      const account = await tx.bankAccount.updateMany({ where: { id: args.bankAccountId, active: true, balanceCents: { gte: p.amountCents } },
        data: { balanceCents: { decrement: p.amountCents } } });
      if (account.count !== 1) return ruleError("Conta inexistente, inativa ou sem saldo registrado suficiente.");
      expected = "READY_TO_SETTLE";
      update = { status: "SETTLED", settledAt: now, bankAccountId: args.bankAccountId, settlementReference: args.settlementReference.trim() };
      await tx.ledgerEntry.create({ data: { bankAccountId: args.bankAccountId, payoutId: id, direction: "DEBIT", origin: "PAYOUT",
        amountCents: p.amountCents, description: `${p.type} · transferência comprovada ${args.settlementReference.trim()}`,
        producerId: p.producerId, eventId: p.eventId } });
    }
    const claimed = await tx.payoutRequest.updateMany({ where: { id, status: expected }, data: update });
    if (claimed.count !== 1) throw new Error("REGRA:O status foi alterado por outra operação. Atualize a tela.");
    await audit(`PAYOUT_${action}`, action === "SETTLE" ? "Baixa contábil manual de transferência externa já realizada; nenhuma ordem bancária foi enviada." :
      action === "REJECT" ? `Reprovado: ${args.reason}` : `Etapa ${action} realizada pelo perfil ${user.role}.`);
    return { id, status: action === "SETTLE" ? "SETTLED" : update.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
}

export async function producerEventAvailability(producerId: string) {
  const events = await prisma.event.findMany({ where: { producerId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return Promise.all(events.map(async e => eventAvailabilityDTO(e.id, e.name, await eventAvailability(prisma, e.id))));
}

export function payoutDTO(p: {
  id: string; amountCents: bigint; status: PayoutStatus; type: PayoutType; eventId: string; producerId: string; createdAt: Date;
  approvedAt: Date | null; producerAcceptedAt: Date | null; financeSignedAt: Date | null; settledAt: Date | null;
  event: { name: string }; producer: { name: string }; rejectionReason: string | null;
  settlementReference: string | null
}, internal: boolean) {
  return { id: p.id, type: p.type, status: p.status, amountCents: p.amountCents.toString(), eventId: p.eventId, producerId: p.producerId,
    eventName: p.event.name, producerName: p.producer.name, createdAt: p.createdAt.toISOString(),
    approvedAt: p.approvedAt?.toISOString() ?? null, producerAcceptedAt: p.producerAcceptedAt?.toISOString() ?? null,
    financeSignedAt: p.financeSignedAt?.toISOString() ?? null, settledAt: p.settledAt?.toISOString() ?? null,
    rejectionReason: p.rejectionReason, ...(internal ? { settlementReference: p.settlementReference } : {}) };
}
