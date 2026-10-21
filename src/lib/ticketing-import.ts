import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseCents } from "@/lib/money";
import { extendedSaleBreakdown, ruleError } from "@/lib/split-calculation";
import { loadEventFeeExtension } from "@/lib/payout-locks";
import { emitAccountingBusinessEvent } from "@/lib/accounting-integration";

export const ticketingInput = z.object({
  externalReference: z.string().trim().min(3).max(150),
  producerName: z.string().trim().min(2).max(140),
  producerDocument: z.string().trim().min(5).max(30).nullable().optional(),
  eventName: z.string().trim().min(2).max(140),
  description: z.string().trim().min(3).max(180),
  amountCents: z.string().regex(/^[1-9]\d{0,15}$/),
  dueDate: z.string().date().nullable().optional()
}).strict();

export const integratedSaleInput = z.object({
  operation: z.literal("INTEGRATED_SALE").optional(),
  externalReference: z.string().trim().min(3).max(150),
  producerName: z.string().trim().min(2).max(140),
  producerDocument: z.string().trim().min(5).max(30).nullable().optional(),
  eventName: z.string().trim().min(2).max(140),
  gatewayName: z.string().trim().min(2).max(100),
  brandName: z.string().trim().min(2).max(100),
  installments: z.number().int().min(1).max(12).default(1),
  unitPriceCents: z.string().regex(/^[1-9]\d{0,15}$/),
  quantity: z.number().int().min(1).max(10000),
  mdrRateBps: z.number().int().min(0).max(5000).optional(),
  mdrFixedCents: z.string().regex(/^\d{1,15}$/).optional(),
  feeMode: z.enum(["PERCENT_BPS", "FIXED_PER_TICKET"]).optional(),
  feeValue: z.string().regex(/^\d{1,15}$/).optional(),
  producerPaysMdr: z.boolean().optional(),
  channel: z.enum(["ONLINE", "POS", "BILHETERIA"]).optional(),
  paymentMethod: z.enum(["PIX", "DEBIT", "CREDIT_SINGLE", "CREDIT_INSTALLMENT"]).optional(),
  costBearer: z.enum(["PRODUCER", "SOUL", "BUYER"]).optional(),
  spreadBps: z.number().int().min(0).max(5000).optional(),
  advancedBps: z.number().int().min(0).max(5000).optional(),
  rebateBps: z.number().int().min(0).max(5000).optional(),
  installmentInterestBps: z.number().int().min(0).max(5000).optional(),
  dueDate: z.string().date().nullable().optional()
}).strict();

export async function importIntegratedTicketingSale(raw: unknown, actorId: string) {
  const input = integratedSaleInput.parse(raw);
  const unitPriceCents = parseCents(input.unitPriceCents);
  const provider = "ticketing";
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ ...input, producerDocument: input.producerDocument ?? null, dueDate: input.dueDate ?? null }))
    .digest("hex");
  const key = { provider_externalReference: { provider, externalReference: input.externalReference } };

  const existing = async () => {
    const found = await prisma.integrationDelivery.findUnique({ where: key });
    if (!found) return null;
    if (found.payloadHash !== payloadHash) return ruleError("Referência externa já utilizada com outro conteúdo.");
    const title = await prisma.financialTitle.findUniqueOrThrow({
      where: { id: found.titleId },
      include: { producer: true, event: true, sale: true }
    });
    const memRow = title.sale
      ? await prisma.financeSetting.findUnique({ where: { key: `sale_memory:${title.sale.id}` } })
      : null;
    return {
      ok: true,
      titleId: title.id,
      saleId: title.sale?.id ?? null,
      accountingBusinessEventId: null,
      producerName: title.producer?.name,
      eventName: title.event?.name,
      gatewayName: null,
      brandName: null,
      installments: input.installments,
      grossCents: title.sale?.grossCents.toString() ?? "0",
      netSettlementCents: title.sale?.netSettlementCents.toString() ?? title.amountCents.toString(),
      producerNetCents: title.sale?.producerNetCents.toString() ?? "0",
      diskNetCents: title.sale?.diskNetCents.toString() ?? "0",
      duplicate: true,
      operation: "INTEGRATED_SALE",
      calculationMemory: memRow ? JSON.parse(memRow.value) : null
    };
  };

  const found = await existing();
  if (found) return found;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          let producer = input.producerDocument
            ? await tx.producer.findUnique({ where: { document: input.producerDocument } })
            : await tx.producer.findFirst({ where: { name: input.producerName } });
          if (!producer) {
            producer = await tx.producer.create({ data: { name: input.producerName, document: input.producerDocument } });
          }
          if (!producer.active) return ruleError("Produtor inativo.");

          let event = await tx.event.findFirst({ where: { producerId: producer.id, name: input.eventName } });
          if (!event) {
            event = await tx.event.create({ data: { name: input.eventName, producerId: producer.id, status: "ACTIVE" } });
          }
          if (event.status === "CLOSED") return ruleError("Evento encerrado.");

          let gateway = await tx.gateway.findUnique({ where: { name: input.gatewayName } });
          if (!gateway) {
            gateway = await tx.gateway.create({ data: { name: input.gatewayName, active: true } });
          }
          if (!gateway.active) return ruleError("Gateway/adquirente inativo.");

          let brand = await tx.cardBrand.findUnique({ where: { name: input.brandName } });
          if (!brand) {
            brand = await tx.cardBrand.create({ data: { name: input.brandName, active: true } });
          }
          if (!brand.active) return ruleError("Bandeira inativa.");

          let mdr = await tx.mdrRule.findUnique({
            where: {
              gatewayId_brandId_installments: {
                gatewayId: gateway.id,
                brandId: brand.id,
                installments: input.installments
              }
            }
          });
          if (!mdr) {
            mdr = await tx.mdrRule.create({
              data: {
                gatewayId: gateway.id,
                brandId: brand.id,
                installments: input.installments,
                rateBps: input.mdrRateBps ?? 250,
                fixedCents: input.mdrFixedCents ? BigInt(input.mdrFixedCents) : 0n,
                active: true
              }
            });
          }
          if (!mdr.active) return ruleError("Regra de MDR inativa.");

          let feePolicy = await tx.eventFeePolicy.findUnique({ where: { eventId: event.id } });
          if (!feePolicy) {
            feePolicy = await tx.eventFeePolicy.create({
              data: {
                eventId: event.id,
                mode: input.feeMode ?? "PERCENT_BPS",
                value: input.feeValue ? BigInt(input.feeValue) : 1000n,
                producerPaysMdr: input.producerPaysMdr ?? true,
                active: true
              }
            });
          }
          if (!feePolicy.active) return ruleError("Política de taxa do evento inativa.");

          const [extraFixedSetting, feeExt] = await Promise.all([
            tx.financeSetting.findUnique({ where: { key: `fee_fixed_extra:${event.id}` } }),
            loadEventFeeExtension(tx, event.id)
          ]);
          const extraFixedCents =
            extraFixedSetting?.value && /^\d+$/.test(extraFixedSetting.value) ? BigInt(extraFixedSetting.value) : 0n;

          const spreadBps = input.spreadBps ?? feeExt.spreadBps ?? 0;
          const advancedBps = input.advancedBps ?? feeExt.advancedBps ?? 0;
          const rebateBps = input.rebateBps ?? feeExt.rebateBps ?? 0;
          const installmentInterestBps = input.installmentInterestBps ?? feeExt.installmentInterestBps ?? 0;
          const hasExtended =
            spreadBps > 0 || advancedBps > 0 || rebateBps > 0 || installmentInterestBps > 0 || input.costBearer !== undefined;
          const costBearer =
            input.costBearer ?? (hasExtended ? feeExt.costBearer : feePolicy.producerPaysMdr ? "PRODUCER" : "SOUL");

          const parts = extendedSaleBreakdown({
            unitPriceCents,
            quantity: input.quantity,
            feeMode: feePolicy.mode,
            feeValue: feePolicy.value,
            feeExtraFixedCents: extraFixedCents,
            mdrRateBps: mdr.rateBps,
            mdrFixedCents: mdr.fixedCents,
            producerPaysMdr: feePolicy.producerPaysMdr,
            channel: input.channel ?? feeExt.channel,
            paymentMethod: input.paymentMethod,
            installments: input.installments,
            installmentInterestBps,
            costBearer,
            spreadBps,
            advancedBps,
            rebateBps
          });

          const title = await tx.financialTitle.create({
            data: {
              kind: "RECEIVABLE",
              description: `Venda integrada · ${input.externalReference}`,
              amountCents: parts.netSettlement,
              dueDate: input.dueDate ? new Date(`${input.dueDate}T12:00:00.000Z`) : null,
              producerId: producer.id,
              eventId: event.id,
              createdById: actorId
            }
          });

          const sale = await tx.financialSale.create({
            data: {
              externalReference: input.externalReference,
              producerId: producer.id,
              eventId: event.id,
              gatewayId: gateway.id,
              brandId: brand.id,
              mdrRuleId: mdr.id,
              feePolicyId: feePolicy.id,
              quantity: input.quantity,
              unitPriceCents,
              grossCents: parts.gross,
              feeModeAtSale: feePolicy.mode,
              feeValueAtSale: feePolicy.value,
              producerPaysMdrAtSale: feePolicy.producerPaysMdr,
              mdrRateBpsAtSale: mdr.rateBps,
              mdrFixedCentsAtSale: mdr.fixedCents,
              feeCents: parts.fee,
              mdrCents: parts.mdr,
              netSettlementCents: parts.netSettlement,
              producerNetCents: parts.producerNet,
              diskNetCents: parts.diskNet,
              receivableTitleId: title.id,
              createdById: actorId
            }
          });

          const historicalMemory = {
            ...parts.memory,
            saleId: sale.id,
            externalReference: input.externalReference,
            gatewayName: gateway.name,
            brandName: brand.name,
            feeModeAtSale: feePolicy.mode,
            feeValueAtSale: feePolicy.value.toString(),
            feeExtraFixedCentsAtSale: extraFixedCents.toString(),
            mdrRateBpsAtSale: mdr.rateBps,
            mdrFixedCentsAtSale: mdr.fixedCents.toString(),
            spreadBpsAtSale: spreadBps,
            advancedBpsAtSale: advancedBps,
            rebateBpsAtSale: rebateBps,
            installmentInterestBpsAtSale: installmentInterestBps,
            recordedAt: sale.createdAt.toISOString()
          };

          await tx.financeSetting.upsert({
            where: { key: `sale_memory:${sale.id}` },
            create: { key: `sale_memory:${sale.id}`, value: JSON.stringify(historicalMemory), changedById: actorId },
            update: { value: JSON.stringify(historicalMemory), changedById: actorId }
          });

          await tx.integrationDelivery.create({
            data: {
              provider,
              externalReference: input.externalReference,
              payloadHash,
              titleId: title.id
            }
          });

          const bizEvent = await emitAccountingBusinessEvent(
            {
              externalKey: `sale:${sale.id}`,
              type: "TICKET_SALE_CAPTURED",
              source: parts.channel === "POS" ? "POS" : parts.channel === "BILHETERIA" ? "BOX_OFFICE" : "ONLINE",
              sourceId: sale.id,
              eventId: event.id,
              producerId: producer.id,
              amountCents: parts.gross,
              payload: {
                producerNetCents: parts.producerNet.toString(),
                feeCents: parts.fee.toString(),
                mdrCents: parts.mdr.toString(),
                spreadCents: parts.spreadCents.toString(),
                advancedCents: parts.advancedCents.toString(),
                rebateCents: parts.rebateCents.toString(),
                netSettlementCents: parts.netSettlement.toString(),
                diskNetCents: parts.diskNet.toString(),
                memory: historicalMemory
              }
            },
            tx
          );

          await tx.auditLog.create({
            data: {
              actorId,
              entity: "FinancialSale",
              entityId: sale.id,
              action: "INTEGRATED_SALE_IMPORTED",
              summary: `Venda integrada ponta a ponta (${input.externalReference}): Bruto=${parts.gross}, Líquido Adquirente=${parts.netSettlement}, Direito Produtor=${parts.producerNet}, Resultado SOUL=${parts.diskNet}.`
            }
          });

          return {
            ok: true,
            titleId: title.id,
            saleId: sale.id,
            accountingBusinessEventId: bizEvent?.id ?? null,
            producerName: producer.name,
            eventName: event.name,
            gatewayName: gateway.name,
            brandName: brand.name,
            installments: input.installments,
            grossCents: parts.gross.toString(),
            netSettlementCents: parts.netSettlement.toString(),
            producerNetCents: parts.producerNet.toString(),
            diskNetCents: parts.diskNet.toString(),
            calculationMemory: historicalMemory,
            duplicate: false,
            operation: "INTEGRATED_SALE"
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(e.code)) {
        const duplicate = await existing();
        if (duplicate) return duplicate;
        if (attempt < 2) continue;
      }
      throw e;
    }
  }
  throw new Error("Importação de venda integrada não concluída.");
}

export async function importTicketingReceivable(raw:unknown,actorId:string) {
  if (raw && typeof raw === "object" && ("unitPriceCents" in raw || "gatewayName" in raw || (raw as Record<string, unknown>).operation === "INTEGRATED_SALE")) {
    return importIntegratedTicketingSale(raw, actorId);
  }
  const input=ticketingInput.parse(raw),amountCents=parseCents(input.amountCents),provider="ticketing";
  const payloadHash=createHash("sha256").update(JSON.stringify({...input,producerDocument:input.producerDocument??null,dueDate:input.dueDate??null})).digest("hex");
  const key={provider_externalReference:{provider,externalReference:input.externalReference}};
  const existing=async()=>{
    const found=await prisma.integrationDelivery.findUnique({where:key});if(!found)return null;
    if(found.payloadHash!==payloadHash)return ruleError("Referência externa já utilizada com outro conteúdo.");
    const title=await prisma.financialTitle.findUniqueOrThrow({where:{id:found.titleId},include:{producer:true,event:true}});
    return {ok:true,titleId:title.id,producerName:title.producer?.name,eventName:title.event?.name,duplicate:true,operation:"RECEIVABLE_IMPORT"};
  };
  const found=await existing();if(found)return found;
  for(let attempt=0;attempt<3;attempt++)try {
    return await prisma.$transaction(async tx=>{
      let producer=input.producerDocument?await tx.producer.findUnique({where:{document:input.producerDocument}}):await tx.producer.findFirst({where:{name:input.producerName}});
      if(!producer)producer=await tx.producer.create({data:{name:input.producerName,document:input.producerDocument}});
      if(!producer.active)return ruleError("Produtor inativo.");
      let event=await tx.event.findFirst({where:{producerId:producer.id,name:input.eventName}});
      if(!event)event=await tx.event.create({data:{name:input.eventName,producerId:producer.id,status:"ACTIVE"}});
      if(event.status==="CLOSED")return ruleError("Evento encerrado.");
      const title=await tx.financialTitle.create({data:{kind:"RECEIVABLE",description:input.description,amountCents,dueDate:input.dueDate?new Date(`${input.dueDate}T12:00:00.000Z`):null,producerId:producer.id,eventId:event.id,createdById:actorId}});
      await tx.integrationDelivery.create({data:{provider,externalReference:input.externalReference,payloadHash,titleId:title.id}});
      await tx.auditLog.create({data:{actorId,entity:"FinancialTitle",entityId:title.id,action:"API_INGRESSOS_SYNC",summary:`Recebível importado: ${input.externalReference}. Não representa venda com split.`}});
      return {ok:true,titleId:title.id,producerName:producer.name,eventName:event.name,duplicate:false,operation:"RECEIVABLE_IMPORT"};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:15000});
  }catch(e){
    if(e instanceof Prisma.PrismaClientKnownRequestError&&["P2002","P2034"].includes(e.code)) {
      const duplicate=await existing();if(duplicate)return duplicate;if(attempt<2)continue;
    }
    throw e;
  }
  throw new Error("Importação não concluída.");
}

export type IntegrationQueueEntry = {
  externalReference: string;
  status: "QUEUED" | "FAILED" | "PROCESSED" | "DEAD_LETTER";
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  payload: Record<string, unknown>;
  titleId: string | null;
  saleId: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function processIntegrationWithResilience(raw: Record<string, unknown>, actorId: string) {
  const extRef = typeof raw.externalReference === "string" ? raw.externalReference.trim() : "";
  const queueKey = extRef ? `integration_queue:${extRef}` : null;
  const existingQueueRow = queueKey ? await prisma.financeSetting.findUnique({ where: { key: queueKey } }) : null;
  let currentEntry: IntegrationQueueEntry | null = null;
  if (existingQueueRow) {
    try {
      currentEntry = JSON.parse(existingQueueRow.value) as IntegrationQueueEntry;
    } catch {
      currentEntry = null;
    }
  }
  const attempts = (currentEntry?.attempts ?? 0) + 1;
  const maxAttempts = currentEntry?.maxAttempts ?? 5;
  const now = new Date();

  try {
    const res = await importTicketingReceivable(raw, actorId);
    if (queueKey) {
      const successEntry: IntegrationQueueEntry = {
        externalReference: extRef,
        status: "PROCESSED",
        attempts,
        maxAttempts,
        nextRetryAt: null,
        lastError: null,
        payload: raw,
        titleId: res.titleId,
        saleId: "saleId" in res && typeof res.saleId === "string" ? res.saleId : null,
        createdAt: currentEntry?.createdAt ?? now.toISOString(),
        updatedAt: now.toISOString()
      };
      await prisma.financeSetting.upsert({
        where: { key: queueKey },
        create: { key: queueKey, value: JSON.stringify(successEntry), changedById: actorId },
        update: { value: JSON.stringify(successEntry), changedById: actorId }
      });
    }
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro na integração.";
    if (queueKey) {
      const isDead = attempts >= maxAttempts;
      const backoffMs = Math.min(3600_000, Math.pow(2, attempts) * 15_000);
      const failedEntry: IntegrationQueueEntry = {
        externalReference: extRef,
        status: isDead ? "DEAD_LETTER" : "FAILED",
        attempts,
        maxAttempts,
        nextRetryAt: isDead ? null : new Date(now.getTime() + backoffMs).toISOString(),
        lastError: message.replace(/^REGRA:/, ""),
        payload: raw,
        titleId: null,
        saleId: null,
        createdAt: currentEntry?.createdAt ?? now.toISOString(),
        updatedAt: now.toISOString()
      };
      await prisma.financeSetting.upsert({
        where: { key: queueKey },
        create: { key: queueKey, value: JSON.stringify(failedEntry), changedById: actorId },
        update: { value: JSON.stringify(failedEntry), changedById: actorId }
      });
    }
    throw err;
  }
}

export async function reprocessFailedIntegration(externalReference: string, actorId: string, overridePayload?: Record<string, unknown>) {
  const key = `integration_queue:${externalReference.trim()}`;
  const row = await prisma.financeSetting.findUnique({ where: { key } });
  if (!row) return ruleError("Registro não encontrado na fila de integração.");
  const entry = JSON.parse(row.value) as IntegrationQueueEntry;
  const payloadToUse = overridePayload ? { ...entry.payload, ...overridePayload, externalReference: entry.externalReference } : entry.payload;
  const res = await processIntegrationWithResilience(payloadToUse, actorId);
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "INTEGRATION_REPROCESSED",
      entity: "IntegrationDelivery",
      entityId: res.titleId,
      summary: `Reprocessamento controlado concluído sem duplicação para referência ${externalReference} (tentativa #${entry.attempts + 1}).`
    }
  });
  return res;
}

export async function getIntegrationQueueSummary() {
  const rows = await prisma.financeSetting.findMany({
    where: { key: { startsWith: "integration_queue:" } },
    orderBy: { updatedAt: "desc" },
    take: 100
  });
  const items: IntegrationQueueEntry[] = [];
  for (const r of rows) {
    try {
      items.push(JSON.parse(r.value) as IntegrationQueueEntry);
    } catch {
      // ignora
    }
  }
  return {
    processedCount: items.filter((i) => i.status === "PROCESSED").length,
    failedCount: items.filter((i) => i.status === "FAILED").length,
    deadLetterCount: items.filter((i) => i.status === "DEAD_LETTER").length,
    queuedCount: items.filter((i) => i.status === "QUEUED").length,
    items
  };
}
