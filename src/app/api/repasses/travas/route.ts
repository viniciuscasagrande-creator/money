import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requestEventTransfer, actOnEventTransfer, createEventReserve, changeEventReserve } from "@/lib/event-finance";
import { hasCapability } from "@/lib/governance";
import { z } from "zod";
import { authorize, fail, isInternal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import { DEFAULT_PROGRESSIVE_TIERS, PAYOUT_LOCK_CATALOG, evaluateEventTransferEligibility } from "@/lib/control-math";
import {
  RETENTION_CATEGORY_LABELS,
  loadEventFeeExtension,
  loadEventLockPolicy,
  loadEventRetentions,
  loadEventTransfers,
  loadProducerFinancialPolicy,
  type EventRetentionItem,
  type EventTransferRecord
} from "@/lib/payout-locks";
import { eventAvailability, eventAvailabilityDTO, ruleError } from "@/lib/operations";

export const runtime = "nodejs";

const retentionCreateSchema = z.object({
  kind: z.literal("RETENTION_CREATE"),
  eventId: z.string().min(1),
  category: z.enum(["ECAD", "ALUGUEL_ESPACO", "EQUIPE_PRODUCAO", "TRIBUTOS_ENCARGOS", "RESERVA_RISCO", "OUTRAS_DESPESAS"]),
  description: z.string().min(3).max(160),
  beneficiary: z.string().min(2).max(120),
  documentRef: z.string().min(2).max(100),
  ownerName: z.string().min(2).max(100),
  dueDate: z.string().nullable().optional(),
  amountCents: z.string().regex(/^\d{1,16}$/)
}).strict();

const retentionStatusSchema = z.object({
  kind: z.literal("RETENTION_STATUS"),
  eventId: z.string().min(1),
  retentionId: z.string().min(1),
  status: z.enum(["ACTIVE", "RELEASED", "CANCELED"]),
  reason: z.string().min(5).max(200)
}).strict();

const lockPolicySaveSchema = z.object({
  kind: z.literal("LOCK_POLICY_SAVE"),
  eventId: z.string().min(1),
  active: z.boolean(),
  capacityTickets: z.number().int().min(1).max(1000000),
  soldTicketsOverride: z.number().int().min(0).max(1000000).nullable().optional(),
  salesTriggerBps: z.number().int().min(0).max(10000),
  customReleaseLimitBps: z.number().int().min(0).max(10000).nullable().optional(),
  calculationBase: z.enum(["PRODUCER_NET_AFTER_RETENTIONS", "GROSS_SOLD", "POTENTIAL_TOTAL"]),
  potentialEventCents: z.string().regex(/^\d{1,16}$/).optional(),
  contractSigned: z.boolean(),
  producerDocsValid: z.boolean(),
  reconciliationApproved: z.boolean(),
  overdueExpensesActive: z.boolean(),
  manualBlockActive: z.boolean(),
  manualBlockReason: z.string().max(200).optional(),
  maxSingleRequestCents: z.string().regex(/^\d{1,16}$/).optional(),
  maxCumulativeEventCents: z.string().regex(/^\d{1,16}$/).optional(),
  postEventClosed: z.boolean().optional()
}).strict();

const feeExtensionSaveSchema = z.object({
  kind: z.literal("FEE_EXTENSION_SAVE"),
  eventId: z.string().min(1),
  channel: z.enum(["ONLINE", "POS", "BILHETERIA"]),
  costBearer: z.enum(["PRODUCER", "SOUL", "BUYER"]),
  spreadBps: z.number().int().min(0).max(5000),
  advancedBps: z.number().int().min(0).max(5000),
  rebateBps: z.number().int().min(0).max(5000),
  installmentInterestBps: z.number().int().min(0).max(5000)
}).strict();

const producerPolicySaveSchema = z.object({
  kind: z.literal("PRODUCER_POLICY_SAVE"),
  producerId: z.string().min(1),
  allowPayoutRequests: z.boolean(),
  allowAdvanceRequests: z.boolean(),
  allowEventTransfers: z.boolean(),
  allowedTransferEventIds: z.array(z.string()).optional(),
  maxSingleTransferCents: z.string().regex(/^\d{1,16}$/).optional(),
  maxTransferPercentBps: z.number().int().min(0).max(10000).optional(),
  maxTransfersPerEvent: z.number().int().min(1).max(100).optional(),
  approvalPolicy: z.enum(["FINANCE_SOUL", "DUAL_INTERNAL"]).optional()
}).strict();

const transferRequestSchema = z.object({
  kind: z.literal("TRANSFER_REQUEST"),
  sourceEventId: z.string().min(1),
  targetEventId: z.string().min(1),
  amountCents: z.string().regex(/^\d{1,16}$/),
  reason: z.string().min(5).max(200)
}).strict();

const transferActionSchema = z.object({
  kind: z.literal("TRANSFER_ACTION"),
  transferId: z.string().min(1),
  action: z.enum(["APPROVE", "REJECT", "PRODUCER_ACCEPT", "EXECUTE", "REVERSE"]),
  reason: z.string().max(200).optional()
}).strict();

const postSchema = z.discriminatedUnion("kind", [
  retentionCreateSchema,
  retentionStatusSchema,
  lockPolicySaveSchema,
  feeExtensionSaveSchema,
  producerPolicySaveSchema,
  transferRequestSchema,
  transferActionSchema
]);

export async function GET(request: NextRequest) {
  const { user, error } = await authorize(request);
  if (error || !user) return error!;
  const internal = isInternal(user.role);
  const [events, producers, allTransfers] = await Promise.all([
    prisma.event.findMany({
      where: internal ? {} : { producerId: user.producerId! },
      include: { producer: { select: { name: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.producer.findMany({
      where: internal ? { active: true } : { id: user.producerId! },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    }),
    loadEventTransfers(prisma)
  ]);
  const [items, producerPolicies] = await Promise.all([
    Promise.all(events.map(async e => {
      const [avail, retentions, policy, feeExt] = await Promise.all([
        eventAvailability(prisma, e.id),
        loadEventRetentions(prisma, e.id),
        loadEventLockPolicy(prisma, e.id),
        internal ? loadEventFeeExtension(prisma, e.id) : Promise.resolve(null)
      ]);
      return {
        ...eventAvailabilityDTO(e.id, e.name, avail),
        producerId: e.producerId,
        producerName: e.producer.name,
        allRetentions: internal ? retentions : retentions.filter(r => r.status === "ACTIVE"),
        lockPolicy: internal ? policy : {
          eventId: e.id,
          active: policy.active,
          salesTriggerBps: policy.salesTriggerBps,
          calculationBase: policy.calculationBase,
          contractSigned: policy.contractSigned,
          producerDocsValid: policy.producerDocsValid
        },
        ...(internal ? { feeExtension: feeExt } : {})
      };
    })),
    Promise.all(producers.map(async p => ({
      id: p.id,
      name: p.name,
      policy: await loadProducerFinancialPolicy(prisma, p.id)
    })))
  ]);
  const visibleTransfers = internal
    ? allTransfers
    : allTransfers.filter(t => t.producerId === user.producerId);
  return NextResponse.json({
    role: user.role,
    catalog: PAYOUT_LOCK_CATALOG,
    progressiveTiers: DEFAULT_PROGRESSIVE_TIERS,
    retentionCategories: RETENTION_CATEGORY_LABELS,
    events: items,
    producers: producerPolicies,
    transfers: visibleTransfers
  });
}

export async function POST(request: NextRequest) {
  const { user, error } = await authorize(request);
  if (error || !user) return error!;
  const internal = isInternal(user.role);
  try {
    const input = postSchema.parse(await request.json());

    if (input.kind === "TRANSFER_REQUEST") return NextResponse.json(await requestEventTransfer(input,user),{status:201});
    if (input.kind === "TRANSFER_ACTION") return NextResponse.json(await actOnEventTransfer(input.transferId,input.action,user,input.reason),{status:201});
    if (!internal) return fail("Acesso restrito ao Financeiro.",403);
    const result = await prisma.$transaction(async tx => {
      if (!await hasCapability(user,"PAYOUT_APPROVE",tx)) return ruleError("Sem permissão para alterar políticas financeiras.");
      const now = new Date().toISOString();
      if (input.kind === "PRODUCER_POLICY_SAVE") {
        const producer = await tx.producer.findUnique({where:{id:input.producerId}});
        if(!producer)return ruleError("Produtor inexistente.");
        const current=await loadProducerFinancialPolicy(tx,input.producerId);
        const saved={...current,...input,updatedAt:now};
        const key=`producer_policy:${input.producerId}`;
        await tx.financeSetting.upsert({where:{key},create:{key,value:JSON.stringify(saved),changedById:user.id},update:{value:JSON.stringify(saved),changedById:user.id}});
        await tx.auditLog.create({data:{actorId:user.id,entity:"ProducerFinancialPolicy",entityId:producer.id,action:"PRODUCER_FINANCIAL_POLICY_SAVED",summary:"Política financeira atualizada."}});
        return {id:producer.id,policy:saved};
      }
      const event = await tx.event.findUnique({ where: { id: input.eventId } });
      if (!event) return ruleError("Evento não encontrado.");

      if (input.kind === "RETENTION_CREATE") return createEventReserve(tx,input,user);
      if (input.kind === "RETENTION_STATUS") return changeEventReserve(tx,input.retentionId,input.status,input.reason,user,input.eventId);

      if (input.kind === "LOCK_POLICY_SAVE") {
        if (input.manualBlockActive && (!input.manualBlockReason || input.manualBlockReason.trim().length < 5)) {
          return ruleError("Informe o motivo justificativo para o bloqueio manual (mínimo 5 caracteres).");
        }
        const current = await loadEventLockPolicy(tx, input.eventId);
        const saved = {
          ...current,
          active: input.active,
          capacityTickets: input.capacityTickets,
          soldTicketsOverride: input.soldTicketsOverride ?? null,
          salesTriggerBps: input.salesTriggerBps,
          customReleaseLimitBps: input.customReleaseLimitBps ?? null,
          calculationBase: input.calculationBase,
          potentialEventCents: input.potentialEventCents ?? current.potentialEventCents,
          contractSigned: input.contractSigned,
          producerDocsValid: input.producerDocsValid,
          reconciliationApproved: input.reconciliationApproved,
          overdueExpensesActive: input.overdueExpensesActive,
          manualBlockActive: input.manualBlockActive,
          manualBlockReason: input.manualBlockReason?.trim() ?? "",
          maxSingleRequestCents: input.maxSingleRequestCents ?? "0",
          maxCumulativeEventCents: input.maxCumulativeEventCents ?? "0",
          postEventClosed: input.postEventClosed ?? false,
          updatedAt: now
        };
        await tx.financeSetting.upsert({
          where: { key: `locks:${input.eventId}` },
          create: { key: `locks:${input.eventId}`, value: JSON.stringify(saved), changedById: user.id },
          update: { value: JSON.stringify(saved), changedById: user.id }
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "PAYOUT_LOCK_POLICY_SAVED",
            entity: "EventLockPolicy",
            entityId: input.eventId,
            summary: `Política de travas de repasse atualizada para ${event.name} (ativa=${input.active}, gatilho=${input.salesTriggerBps}bps, base=${input.calculationBase}).`
          }
        });
        return { id: input.eventId, active: saved.active };
      }

      const ext = {
        eventId: input.eventId,
        channel: input.channel,
        costBearer: input.costBearer,
        spreadBps: input.spreadBps,
        advancedBps: input.advancedBps,
        rebateBps: input.rebateBps,
        installmentInterestBps: input.installmentInterestBps,
        updatedAt: now
      };
      await tx.financeSetting.upsert({
        where: { key: `fee_ext:${input.eventId}` },
        create: { key: `fee_ext:${input.eventId}`, value: JSON.stringify(ext), changedById: user.id },
        update: { value: JSON.stringify(ext), changedById: user.id }
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "FEE_EXTENSION_SAVED",
          entity: "EventFeeExtension",
          entityId: input.eventId,
          summary: `Configuração de Canal (${input.channel}), Responsável (${input.costBearer}), Spread (${input.spreadBps}bps), Advanced (${input.advancedBps}bps) e Rebate (${input.rebateBps}bps) salva para ${event.name}.`
        }
      });
      return { id: input.eventId, channel: ext.channel };
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
}
