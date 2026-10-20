import { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { isInternal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { eventAvailability } from "@/lib/operations";
import { ensureApprovalAuthority, hasCapability } from "@/lib/governance";
import { evaluateEventTransferEligibility } from "@/lib/control-math";
import { loadProducerFinancialPolicy, loadEventTransfers } from "@/lib/payout-locks";
import { ruleError } from "@/lib/split-calculation";
import { parseCents } from "@/lib/money";
import { emitAccountingBusinessEvent } from "@/lib/accounting-integration";

type Tx = Prisma.TransactionClient;
const options = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 };
const audit = (tx: Tx, user: SessionUser, id: string, action: string, summary: string) =>
  tx.auditLog.create({data:{actorId:user.id,entity:"EventTransfer",entityId:id,action,summary}});

async function checkTransfer(tx: Tx, originId: string, destinationId: string, amount: bigint, user: SessionUser, excludeId?: string) {
  const [origin, destination] = await Promise.all([
    tx.event.findUnique({where:{id:originId},include:{producer:true}}),
    tx.event.findUnique({where:{id:destinationId}})
  ]);
  if (!origin || !destination || !origin.producer.active || origin.status === "CLOSED" || destination.status === "CLOSED") return ruleError("Eventos indisponíveis para transferência.");
  if (!isInternal(user.role) && origin.producerId !== user.producerId) return ruleError("Acesso negado aos eventos.");
  const [policy, capacity, transfers] = await Promise.all([
    loadProducerFinancialPolicy(tx,origin.producerId), eventAvailability(tx,origin.id,{excludeTransferId:excludeId}), loadEventTransfers(tx)
  ]);
  const result = evaluateEventTransferEligibility({sourceProducerId:origin.producerId,targetProducerId:destination.producerId,
    sourceEventId:origin.id,targetEventId:destination.id,amountCents:amount,sourceFinancialAvailableCents:capacity.repasseCents,
    sourceLockBlockingReasons:capacity.lockPolicy.active?capacity.lockEvaluation.blockingReasons:[],allowEventTransfers:policy.allowEventTransfers,
    allowedTransferEventIds:policy.allowedTransferEventIds,maxSingleTransferCents:BigInt(policy.maxSingleTransferCents),
    maxTransferPercentBps:policy.maxTransferPercentBps,maxTransfersPerEvent:policy.maxTransfersPerEvent,
    currentSourceTransferCount:transfers.filter(t=>t.id!==excludeId&&t.sourceEventId===origin.id&&!["REJECTED","REVERSED"].includes(t.status)).length});
  if (!result.allowed) return ruleError(result.errors[0]);
  return {origin, policy};
}

export async function requestEventTransfer(input: {sourceEventId:string;targetEventId:string;amountCents:string;reason:string}, user:SessionUser) {
  const amount = parseCents(input.amountCents);
  if (input.reason.trim().length < 5) return ruleError("Justificativa obrigatória.");
  return prisma.$transaction(async tx=>{
    const {origin}=await checkTransfer(tx,input.sourceEventId,input.targetEventId,amount,user);
    const t=await tx.eventTransfer.create({data:{producerId:origin.producerId,originEventId:origin.id,destinationEventId:input.targetEventId,
      amountCents:amount,reason:input.reason.trim(),requestedById:user.id}});
    await audit(tx,user,t.id,"TRANSFER_REQUESTED","Transferência solicitada; valor reservado na origem.");
    return {id:t.id,status:t.status};
  },options);
}

export async function actOnEventTransfer(id:string, action:"APPROVE"|"REJECT"|"PRODUCER_ACCEPT"|"EXECUTE"|"REVERSE", user:SessionUser, reason?:string) {
  return prisma.$transaction(async tx=>{
    const t=await tx.eventTransfer.findUnique({where:{id}});
    if(!t)return ruleError("Transferência inexistente.");
    let data:Prisma.EventTransferUpdateManyMutationInput;
    if(action==="PRODUCER_ACCEPT") {
      if(user.role!=="PRODUCER"||user.producerId!==t.producerId||t.status!=="APPROVED")return ruleError("Aceite exige o produtor titular e aprovação prévia.");
      data={status:"PRODUCER_ACCEPTED",producerAcceptedById:user.id,producerAcceptedAt:new Date()};
    } else {
      if(!isInternal(user.role))return ruleError("Acesso restrito ao Financeiro.");
      if(action==="APPROVE") {
        if(t.status!=="REQUESTED"||t.requestedById===user.id)return ruleError("Solicitante não pode aprovar; pedido deve estar pendente.");
        await ensureApprovalAuthority(tx,user,"REPASSE",t.amountCents);
        await checkTransfer(tx,t.originEventId,t.destinationEventId,t.amountCents,user,t.id);
        data={status:"APPROVED",approvedById:user.id,approvedAt:new Date()};
      }else if(action==="EXECUTE") {
        if(t.status!=="PRODUCER_ACCEPTED")return ruleError("Execução exige o aceite do produtor.");
        if(t.requestedById===user.id||t.approvedById===user.id)return ruleError("Execução exige pessoa distinta do solicitante e aprovador.");
        if(!await hasCapability(user,"PAYOUT_SETTLE",tx))return ruleError("Sem permissão de execução financeira.");
        await checkTransfer(tx,t.originEventId,t.destinationEventId,t.amountCents,user,t.id);
        data={status:"EXECUTED",executedById:user.id,executedAt:new Date()};
        await emitAccountingBusinessEvent({externalKey:`transfer:${id}`,type:"INTERNAL_EVENT_TRANSFER_EXECUTED",source:"FINANCE",sourceId:id,
          eventId:t.originEventId,producerId:t.producerId,amountCents:t.amountCents,payload:{destinationEventId:t.destinationEventId}},tx);
      }else if(action==="REJECT") {
        if(!await hasCapability(user,"PAYOUT_APPROVE",tx))return ruleError("Sem permissão de decisão financeira.");
        if(!["REQUESTED","APPROVED","PRODUCER_ACCEPTED"].includes(t.status)||!reason||reason.trim().length<8)return ruleError("Estado ou justificativa de reprovação inválidos.");
        data={status:"REJECTED",rejectionReason:reason.trim(),rejectedAt:new Date()};
      }else {
        if(!await hasCapability(user,"PAYOUT_SETTLE",tx))return ruleError("Sem permissão de estorno.");
        if(t.status!=="EXECUTED"||!reason||reason.trim().length<8)return ruleError("Estorno exige transferência executada e justificativa.");
        const destination=await eventAvailability(tx,t.destinationEventId);
        if(destination.internalPositionCents<t.amountCents)return ruleError("Destino sem posição suficiente para estorno.");
        data={status:"REVERSED",reversalReason:reason.trim(),reversedAt:new Date()};
        await emitAccountingBusinessEvent({externalKey:`transfer-reversal:${id}`,type:"INTERNAL_EVENT_TRANSFER_REVERSED",source:"FINANCE",sourceId:id,
          eventId:t.originEventId,producerId:t.producerId,amountCents:t.amountCents},tx);
      }
    }
    const changed=await tx.eventTransfer.updateMany({where:{id,status:t.status},data});
    if(changed.count!==1)return ruleError("Operação concorrente. Atualize a tela.");
    await audit(tx,user,id,`TRANSFER_${action}`,`Transição ${action}. ${reason??""}`);
    return {id,status:data.status};
  },options);
}

export type ReserveInput={eventId:string;description:string;amountCents:string;category?:string;beneficiary?:string;documentRef?:string;ownerName?:string;dueDate?:string|null};
export async function createEventReserve(tx:Tx,input:ReserveInput,user:SessionUser) {
  if(!isInternal(user.role)||!await hasCapability(user,"PAYOUT_APPROVE",tx))return ruleError("Sem permissão para retenções.");
  const event=await tx.event.findUnique({where:{id:input.eventId}});
  if(!event||event.status==="CLOSED")return ruleError("Evento indisponível.");
  const dueDate=input.dueDate?new Date(input.dueDate):null;
  if(dueDate&&Number.isNaN(dueDate.valueOf()))return ruleError("Data inválida.");
  const r=await tx.eventReserve.create({data:{eventId:event.id,purpose:input.description,amountCents:parseCents(input.amountCents),category:input.category,
    beneficiary:input.beneficiary,documentRef:input.documentRef,ownerName:input.ownerName,dueDate,createdById:user.id}});
  await tx.auditLog.create({data:{actorId:user.id,entity:"EventReserve",entityId:r.id,action:"RESERVE_CREATED",summary:`Retenção: ${r.purpose}.`}});
  await emitAccountingBusinessEvent({externalKey:`reserve:${r.id}`,type:"MANDATORY_RETENTION_CREATED",source:"FINANCE",sourceId:r.id,eventId:event.id,producerId:event.producerId,amountCents:r.amountCents},tx);
  return {id:r.id,status:r.status};
}

export async function changeEventReserve(tx:Tx,id:string,status:"ACTIVE"|"RELEASED"|"CANCELED",reason:string,user:SessionUser,eventId?:string) {
  if(!isInternal(user.role)||!await hasCapability(user,"PAYOUT_APPROVE",tx))return ruleError("Sem permissão para retenções.");
  if(reason.trim().length<8)return ruleError("Justificativa deve ter pelo menos oito caracteres.");
  const r=await tx.eventReserve.findUnique({where:{id}});
  if(!r||(eventId&&r.eventId!==eventId)||r.status===status)return ruleError("Retenção inexistente ou já neste estado.");
  const changed=await tx.eventReserve.updateMany({where:{id,status:r.status},data:{status,releaseReason:reason.trim(),releasedAt:status==="ACTIVE"?null:new Date()}});
  if(changed.count!==1)return ruleError("Operação concorrente.");
  const event=await tx.event.findUniqueOrThrow({where:{id:r.eventId}});
  await emitAccountingBusinessEvent({externalKey:`reserve-status:${id}:${status}:${r.updatedAt.toISOString()}`,type:status==="ACTIVE"?"MANDATORY_RETENTION_CREATED":"MANDATORY_RETENTION_RELEASED",source:"FINANCE",sourceId:id,eventId:r.eventId,producerId:event.producerId,amountCents:r.amountCents},tx);
  await tx.auditLog.create({data:{actorId:user.id,entity:"EventReserve",entityId:id,action:`RESERVE_${status}`,summary:reason.trim()}});
  return {id,status};
}
