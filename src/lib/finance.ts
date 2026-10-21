import {emitAccountingBusinessEvent} from "@/lib/accounting-integration";
import { EntryDirection, TitleKind, TitleStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCents } from "@/lib/money";
import { isoDate, titleInput } from "@/lib/validation";
import type { SessionUser } from "@/lib/auth";
import { writableBankDates } from "@/lib/financial-close";

export const titleInclude = { producer: { select: { name: true } }, event: { select: { name: true } }, bankAccount: { select: { name: true } } } as const;

export async function titleAssignments(producerId?: string | null, eventId?: string | null) {
  if (eventId) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { producerId: true, producer: { select: { active: true } } } });
    if (!event || !event.producer.active) throw new Error("REGRA:Evento inexistente ou com produtor inativo.");
    if (producerId && producerId !== event.producerId) throw new Error("REGRA:Evento não pertence ao produtor selecionado.");
    return { eventId, producerId: event.producerId };
  }
  if (producerId) {
    const producer = await prisma.producer.findUnique({ where: { id: producerId }, select: { id: true, active: true } });
    if (!producer || !producer.active) throw new Error("REGRA:Produtor inexistente ou inativo.");
  }
  return { eventId: null, producerId: producerId ?? null };
}

export async function createTitle(kind: TitleKind, raw: unknown, user: SessionUser) {
  const input = titleInput.parse(raw);
  const amountCents = parseCents(input.amountCents);
  const assignment = await titleAssignments(input.producerId, input.eventId);
  return prisma.$transaction(async (tx) => {
    const title = await tx.financialTitle.create({ data: {
      kind, description: input.description, amountCents, dueDate: isoDate(input.dueDate), createdById: user.id,
      ...assignment
    } });
    await tx.auditLog.create({ data: { actorId: user.id, entity: "FinancialTitle", entityId: title.id,
      action: "TITLE_CREATED", summary: `${kind === "RECEIVABLE" ? "Recebível" : "Pagamento"} cadastrado (em aberto).` } });
    return title;
  });
}

export async function settleTitle(id: string, bankAccountId: string, user: SessionUser) {
  if (!id || !bankAccountId) throw new Error("REGRA:Informe título e conta.");
  return prisma.$transaction(async (tx) => {
    const title = await tx.financialTitle.findUnique({ where: { id } });
    if (!title) throw new Error("REGRA:Título não encontrado.");
    if (title.status !== TitleStatus.OPEN) throw new Error("REGRA:Título já liquidado ou cancelado.");
    await writableBankDates(tx,bankAccountId,[new Date()]);
    const account = await tx.bankAccount.findUnique({ where: { id: bankAccountId }, select: { id: true, active: true } });
    if (!account || !account.active) throw new Error("REGRA:Conta indisponível.");

    // Status, saldo, razão e auditoria são persistidos de maneira atômica.
    const claimed = await tx.financialTitle.updateMany({ where: { id, status: TitleStatus.OPEN },
      data: { status: TitleStatus.SETTLED, settledAt: new Date(), bankAccountId } });
    if (claimed.count !== 1) throw new Error("REGRA:O título foi liquidado por outra operação.");

    if (title.kind === TitleKind.RECEIVABLE) {
      await tx.bankAccount.update({ where: { id: bankAccountId }, data: { balanceCents: { increment: title.amountCents } } });
    } else {
      // Atualização condicional evita débito com saldo insuficiente, inclusive sob concorrência.
      const debited = await tx.bankAccount.updateMany({ where: { id: bankAccountId, active: true, balanceCents: { gte: title.amountCents } },
        data: { balanceCents: { decrement: title.amountCents } } });
      if (debited.count !== 1) throw new Error("REGRA:Saldo insuficiente na conta selecionada.");
    }
    const direction: EntryDirection = title.kind === TitleKind.RECEIVABLE ? "CREDIT" : "DEBIT";
    await tx.ledgerEntry.create({ data: {
      direction, origin: title.kind === TitleKind.RECEIVABLE ? "RECEIVABLE" : "PAYABLE",
      amountCents: title.amountCents, description: title.description, bankAccountId, titleId: title.id,
      producerId: title.producerId, eventId: title.eventId
    } });
    await tx.financialSale.updateMany({ where: { receivableTitleId: id, status: "AWAITING_SETTLEMENT" }, data: { status: "SETTLED", settledAt: new Date() } });
    await tx.auditLog.create({ data: {
      actorId: user.id, action: "TITLE_SETTLED", entity: "FinancialTitle", entityId: title.id,
      summary: `${title.kind === "RECEIVABLE" ? "Recebimento" : "Pagamento"} liquidado na conta ${bankAccountId}.`
    } });
    await emitAccountingBusinessEvent({externalKey:`title-settlement:${id}`,type:title.kind===TitleKind.RECEIVABLE?"ACQUIRER_SETTLEMENT_POSTED":"FINANCIAL_TITLE_SETTLED",source:"FINANCE",sourceId:id,eventId:title.eventId,producerId:title.producerId,amountCents:title.amountCents},tx);
    return { id, status: "SETTLED" };
  }, { maxWait: 5000, timeout: 10000 });
}

export const titleWhereFor = (user: SessionUser, kind?: TitleKind): Prisma.FinancialTitleWhereInput => ({
  ...(kind ? { kind } : {}), ...(user.role === "PRODUCER" ? { producerId: user.producerId!, sale: { is: null } } : {})
});

export function titleDTO(t: {
  id: string; kind: TitleKind; status: TitleStatus; description: string; amountCents: bigint;
  dueDate: Date | null; settledAt: Date | null; createdAt: Date; eventId: string | null;
  producerId: string | null; bankAccountId: string | null;
  producer?: { name: string } | null; event?: { name: string } | null; bankAccount?: { name: string } | null;
}, internal: boolean) {
  return {
    id: t.id, kind: t.kind, status: t.status, description: t.description, amountCents: t.amountCents.toString(),
    dueDate: t.dueDate?.toISOString() ?? null, settledAt: t.settledAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(),
    eventId: t.eventId, producerId: t.producerId, eventName: t.event?.name ?? "—", producerName: t.producer?.name ?? "—",
    ...(internal ? { bankAccountId: t.bankAccountId, bankAccountName: t.bankAccount?.name ?? "—" } : {})
  };
}
