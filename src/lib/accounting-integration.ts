import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EmitAccountingBusinessEventInput = {
  externalKey: string;
  type:
    | "TICKET_SALE_CAPTURED"
    | "ACQUIRER_SETTLEMENT_POSTED"
    | "MANDATORY_RETENTION_CREATED"
    | "INTERNAL_EVENT_TRANSFER_EXECUTED"
    | "PRODUCER_PAYOUT_SETTLED";
  source: "ONLINE" | "POS" | "BOX_OFFICE" | "FINANCE";
  sourceId: string;
  eventId?: string | null;
  producerId?: string | null;
  amountCents: bigint;
  occurredAt?: Date;
  payload?: Record<string, unknown>;
};

/**
 * Barramento centralizado de Eventos de Negócio (Financeiro / Tesouraria / Conciliação -> Contabilidade).
 * Registra de forma idempotente o fato econômico em `AccountingBusinessEvent` na mesma transação operacional
 * sem escrever diretamente nos saldos operacionais e sem duplicar registros quando chamado mais de uma vez.
 */
export async function emitAccountingBusinessEvent(
  input: EmitAccountingBusinessEventInput,
  tx: Prisma.TransactionClient = prisma
) {
  if (input.amountCents <= 0n) return null;
  const existing = await tx.accountingBusinessEvent.findUnique({
    where: { externalKey: input.externalKey }
  });
  if (existing) {
    return { id: existing.id, status: existing.status, duplicate: true };
  }
  const created = await tx.accountingBusinessEvent.create({
    data: {
      externalKey: input.externalKey,
      type: input.type,
      source: input.source,
      sourceId: input.sourceId,
      eventId: input.eventId ?? null,
      producerId: input.producerId ?? null,
      amountCents: input.amountCents,
      occurredAt: input.occurredAt ?? new Date(),
      payloadJson: JSON.stringify(input.payload ?? {}),
      status: "PENDING"
    }
  });
  return { id: created.id, status: created.status, duplicate: false };
}
