import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type EmitAccountingBusinessEventInput = {
  externalKey: string;
  type:
    | "TICKET_SALE_CAPTURED"
    | "ACQUIRER_SETTLEMENT_POSTED"
    | "MANDATORY_RETENTION_CREATED"
    | "INTERNAL_EVENT_TRANSFER_EXECUTED"
    | "PRODUCER_PAYOUT_SETTLED"
    | "MANDATORY_RETENTION_RELEASED"
    | "INTERNAL_EVENT_TRANSFER_REVERSED"
    | "FINANCIAL_TITLE_SETTLED";
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
 * Registra de forma idempotente o fato econômico em `AccountingBusinessEvent` sem escrever
 * diretamente nos saldos operacionais e sem duplicar registros quando chamado mais de uma vez.
 */
export async function emitAccountingBusinessEvent(input: EmitAccountingBusinessEventInput, db: Prisma.TransactionClient = prisma) {
  if (input.amountCents <= 0n) return null;
  if(db===prisma)return prisma.$transaction(tx=>storeAccountingBusinessEvent(input,tx));
  return storeAccountingBusinessEvent(input,db);
}
export async function lockAccountingPeriod(tx:Prisma.TransactionClient,month:string){
  // Also coordinates facts that start before the monthly period is created.
  await tx.financeSetting.upsert({where:{key:`accounting_period_gate:${month}`},create:{key:`accounting_period_gate:${month}`,value:"locked"},update:{value:"locked"}});
}
function canonical(value:unknown):string{
  return JSON.stringify(value,(_key,item)=>typeof item==="bigint"?item.toString():item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}
export async function storeAccountingBusinessEvent(input:Omit<EmitAccountingBusinessEventInput,"type">&{type:string},db:Prisma.TransactionClient){
  const existing = await db.accountingBusinessEvent.findUnique({
    where: { externalKey: input.externalKey }
  });
  if (existing) {
    if(existing.type!==input.type||existing.source!==input.source||existing.sourceId!==input.sourceId||existing.amountCents!==input.amountCents||existing.eventId!==(input.eventId??null)||existing.producerId!==(input.producerId??null)||(input.occurredAt&&existing.occurredAt.getTime()!==input.occurredAt.getTime())||canonical(JSON.parse(existing.payloadJson))!==canonical(input.payload??{}))throw new Error("REGRA:Referência contábil já utilizada com outro conteúdo.");
    return { id: existing.id, status: existing.status, duplicate: true };
  }
  const occurredAt=input.occurredAt??new Date();
  await lockAccountingPeriod(db,occurredAt.toISOString().slice(0,7));
  const period=await db.accountingPeriod.findUnique({where:{name:occurredAt.toISOString().slice(0,7)}});
  if(period){
    if(occurredAt<period.startAt||occurredAt>=period.endAt)throw new Error("REGRA:Competência contábil incompatível com a data do fato.");
    const open=await db.accountingPeriod.updateMany({where:{id:period.id,status:"OPEN"},data:{status:"OPEN"}});
    if(open.count!==1)throw new Error("REGRA:Período contábil fechado para este fato financeiro.");
  }
  const created = await db.accountingBusinessEvent.upsert({
    where: { externalKey: input.externalKey },
    update: {},
    create: {
      externalKey: input.externalKey,
      type: input.type,
      source: input.source,
      sourceId: input.sourceId,
      eventId: input.eventId ?? null,
      producerId: input.producerId ?? null,
      amountCents: input.amountCents,
      occurredAt,
      payloadJson: canonical(input.payload ?? {}),
      status: "PENDING"
    }
  });
  return { id: created.id, status: created.status, duplicate: false };
}
