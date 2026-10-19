import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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

    // Only TRANSFER_REQUEST and TRANSFER_ACTION (PRODUCER_ACCEPT) can be called by PRODUCER
    if (!internal) {
      if (input.kind === "TRANSFER_REQUEST") {
        // Allowed for producer (validated inside transaction)
      } else if (input.kind === "TRANSFER_ACTION" && input.action === "PRODUCER_ACCEPT") {
        // Allowed for producer (validated inside transaction)
      } else {
        return fail("Acesso restrito ao Financeiro Interno SOUL.", 403);
      }
    }

    const result = await prisma.$transaction(async tx => {
      const now = new Date().toISOString();

      if (input.kind === "PRODUCER_POLICY_SAVE") {
        const producer = await tx.producer.findUnique({ where: { id: input.producerId } });
        if (!producer) return ruleError("Produtor não encontrado.");
        const current = await loadProducerFinancialPolicy(tx, input.producerId);
        const saved = {
          ...current,
          allowPayoutRequests: input.allowPayoutRequests,
          allowAdvanceRequests: input.allowAdvanceRequests,
          allowEventTransfers: input.allowEventTransfers,
          allowedTransferEventIds: input.allowedTransferEventIds ?? current.allowedTransferEventIds,
          maxSingleTransferCents: input.maxSingleTransferCents ?? current.maxSingleTransferCents,
          maxTransferPercentBps: input.maxTransferPercentBps ?? current.maxTransferPercentBps,
          maxTransfersPerEvent: input.maxTransfersPerEvent ?? current.maxTransfersPerEvent,
          approvalPolicy: input.approvalPolicy ?? current.approvalPolicy,
          updatedAt: now
        };
        await tx.financeSetting.upsert({
          where: { key: `producer_policy:${input.producerId}` },
          create: { key: `producer_policy:${input.producerId}`, value: JSON.stringify(saved), changedById: user.id },
          update: { value: JSON.stringify(saved), changedById: user.id }
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "PRODUCER_FINANCIAL_POLICY_SAVED",
            entity: "ProducerFinancialPolicy",
            entityId: input.producerId,
            summary: `Política financeira do produtor ${producer.name} atualizada (repasses=${saved.allowPayoutRequests}, antecipações=${saved.allowAdvanceRequests}, transferências=${saved.allowEventTransfers}).`
          }
        });
        return { id: input.producerId, policy: saved };
      }

      if (input.kind === "TRANSFER_REQUEST") {
        const [sourceEv, targetEv] = await Promise.all([
          tx.event.findUnique({ where: { id: input.sourceEventId }, include: { producer: { select: { name: true, active: true } } } }),
          tx.event.findUnique({ where: { id: input.targetEventId } })
        ]);
        if (!sourceEv || !targetEv || !sourceEv.producer.active) return ruleError("Evento de origem ou destino indisponível.");
        if (!internal && sourceEv.producerId !== user.producerId) return ruleError("Evento de origem não pertence ao produtor autenticado.");

        const [prodPolicy, sourceAvail, allTransfers] = await Promise.all([
          loadProducerFinancialPolicy(tx, sourceEv.producerId),
          eventAvailability(tx, sourceEv.id),
          loadEventTransfers(tx)
        ]);
        const check = evaluateEventTransferEligibility({
          sourceProducerId: sourceEv.producerId,
          targetProducerId: targetEv.producerId,
          sourceEventId: sourceEv.id,
          targetEventId: targetEv.id,
          amountCents: BigInt(input.amountCents),
          sourceFinancialAvailableCents: sourceAvail.repasseCents,
          sourceLockBlockingReasons: sourceAvail.lockPolicy.active ? sourceAvail.lockEvaluation.blockingReasons : [],
          allowEventTransfers: prodPolicy.allowEventTransfers,
          allowedTransferEventIds: prodPolicy.allowedTransferEventIds,
          maxSingleTransferCents: /^\d+$/.test(prodPolicy.maxSingleTransferCents) ? BigInt(prodPolicy.maxSingleTransferCents) : 0n,
          maxTransferPercentBps: prodPolicy.maxTransferPercentBps,
          maxTransfersPerEvent: prodPolicy.maxTransfersPerEvent,
          currentSourceTransferCount: sourceAvail.outgoingTransferCount
        });
        if (!check.allowed) return ruleError(check.errors[0]);

        const record: EventTransferRecord = {
          id: randomUUID(),
          producerId: sourceEv.producerId,
          producerName: sourceEv.producer.name,
          sourceEventId: sourceEv.id,
          sourceEventName: sourceEv.name,
          targetEventId: targetEv.id,
          targetEventName: targetEv.name,
          amountCents: input.amountCents,
          reason: input.reason.trim(),
          status: "REQUESTED",
          requestedById: user.id,
          approvedById: null,
          producerAcceptedById: null,
          executedById: null,
          rejectionReason: null,
          createdAt: now,
          updatedAt: now
        };
        const nextList = [record, ...allTransfers];
        await tx.financeSetting.upsert({
          where: { key: "event_transfers:all" },
          create: { key: "event_transfers:all", value: JSON.stringify(nextList), changedById: user.id },
          update: { value: JSON.stringify(nextList), changedById: user.id }
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "EVENT_TRANSFER_REQUESTED",
            entity: "EventTransfer",
            entityId: record.id,
            summary: `Transferência interna solicitada (${sourceEv.name} -> ${targetEv.name}, ${input.amountCents} centavos). Saldo reservado na origem.`
          }
        });
        return { id: record.id, status: record.status };
      }

      if (input.kind === "TRANSFER_ACTION") {
        const allTransfers = await loadEventTransfers(tx);
        const idx = allTransfers.findIndex(t => t.id === input.transferId);
        if (idx === -1) return ruleError("Transferência entre eventos não encontrada.");
        const current = allTransfers[idx];
        if (!internal && current.producerId !== user.producerId) return ruleError("Operação não pertence ao produtor autenticado.");

        if (input.action === "APPROVE") {
          if (!internal || current.status !== "REQUESTED") return ruleError("Apenas solicitações pendentes podem ser aprovadas pelo Financeiro SOUL.");
          allTransfers[idx] = { ...current, status: "APPROVED", approvedById: user.id, updatedAt: now };
        } else if (input.action === "REJECT") {
          if (!internal || !["REQUESTED", "APPROVED"].includes(current.status)) return ruleError("Esta transferência não pode ser reprovada no estado atual.");
          if (!input.reason || input.reason.trim().length < 5) return ruleError("Informe o motivo da reprovação (mínimo 5 caracteres).");
          allTransfers[idx] = { ...current, status: "REJECTED", rejectionReason: input.reason.trim(), updatedAt: now };
        } else if (input.action === "PRODUCER_ACCEPT") {
          if (current.status !== "APPROVED") return ruleError("O aceite do produtor exige aprovação prévia do Financeiro SOUL.");
          allTransfers[idx] = { ...current, status: "PRODUCER_ACCEPTED", producerAcceptedById: user.id, updatedAt: now };
        } else if (input.action === "EXECUTE") {
          if (!internal || !["APPROVED", "PRODUCER_ACCEPTED"].includes(current.status)) {
            return ruleError("A execução atômica exige aprovação financeira prévia.");
          }
          allTransfers[idx] = { ...current, status: "EXECUTED", executedById: user.id, updatedAt: now };
        } else {
          if (!internal || current.status !== "EXECUTED") return ruleError("Apenas transferências concluídas podem sofrer estorno compensatório.");
          if (!input.reason || input.reason.trim().length < 5) return ruleError("Informe a justificativa do estorno compensatório.");
          allTransfers[idx] = { ...current, status: "REVERSED", rejectionReason: input.reason.trim(), updatedAt: now };
        }

        await tx.financeSetting.upsert({
          where: { key: "event_transfers:all" },
          create: { key: "event_transfers:all", value: JSON.stringify(allTransfers), changedById: user.id },
          update: { value: JSON.stringify(allTransfers), changedById: user.id }
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: `EVENT_TRANSFER_${input.action}`,
            entity: "EventTransfer",
            entityId: current.id,
            summary: `Transferência entre eventos (${current.sourceEventName} -> ${current.targetEventName}) atualizada para ${allTransfers[idx].status}.`
          }
        });
        return { id: current.id, status: allTransfers[idx].status };
      }

      const event = await tx.event.findUnique({ where: { id: input.eventId } });
      if (!event) return ruleError("Evento não encontrado.");

      if (input.kind === "RETENTION_CREATE") {
        if (BigInt(input.amountCents) <= 0n) return ruleError("O valor da retenção deve ser maior que zero.");
        const current = await loadEventRetentions(tx, input.eventId);
        const created: EventRetentionItem = {
          id: randomUUID(),
          eventId: input.eventId,
          category: input.category,
          description: input.description.trim(),
          beneficiary: input.beneficiary.trim(),
          documentRef: input.documentRef.trim(),
          ownerName: input.ownerName.trim(),
          dueDate: input.dueDate ?? null,
          amountCents: input.amountCents,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now
        };
        const updated = [created, ...current];
        await tx.financeSetting.upsert({
          where: { key: `retentions:${input.eventId}` },
          create: { key: `retentions:${input.eventId}`, value: JSON.stringify(updated), changedById: user.id },
          update: { value: JSON.stringify(updated), changedById: user.id }
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "RETENTION_CREATED",
            entity: "EventRetention",
            entityId: created.id,
            summary: `Retenção obrigatória (${input.category}) registrada no evento ${event.name}: ${input.description} (${input.amountCents} centavos).`
          }
        });
        return { id: created.id, status: created.status };
      }

      if (input.kind === "RETENTION_STATUS") {
        const current = await loadEventRetentions(tx, input.eventId);
        const idx = current.findIndex(r => r.id === input.retentionId);
        if (idx === -1) return ruleError("Retenção não encontrada para este evento.");
        current[idx] = { ...current[idx], status: input.status, updatedAt: now };
        await tx.financeSetting.upsert({
          where: { key: `retentions:${input.eventId}` },
          create: { key: `retentions:${input.eventId}`, value: JSON.stringify(current), changedById: user.id },
          update: { value: JSON.stringify(current), changedById: user.id }
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: `RETENTION_${input.status}`,
            entity: "EventRetention",
            entityId: input.retentionId,
            summary: `Status da retenção alterado para ${input.status} no evento ${event.name}. Justificativa: ${input.reason.trim()}`
          }
        });
        return { id: input.retentionId, status: input.status };
      }

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
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
}
