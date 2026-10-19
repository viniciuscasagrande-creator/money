import {NextRequest,NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {eventAvailability} from "@/lib/operations";
import {hasCapability} from "@/lib/governance";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try {const {id}=await params;const input=z.object({action:z.enum(["APPROVE","REJECT","EXECUTE"]),reason:z.string().optional()}).strict().parse(await req.json());
 const item=await prisma.$transaction(async tx=>{
  const t=await tx.eventTransfer.findUnique({where:{id}});if(!t)throw new Error("REGRA:Transferência inexistente.");
  if(input.action==="REJECT"){
   if(t.status!=="REQUESTED"&&t.status!=="APPROVED")throw new Error("REGRA:Status impede reprovação.");
   if((input.reason||"").trim().length<8)throw new Error("REGRA:Justificativa obrigatória.");
   const changed=await tx.eventTransfer.updateMany({where:{id,status:t.status},data:{status:"REJECTED",rejectedAt:new Date(),rejectionReason:input.reason}});
   if(changed.count!==1)throw new Error("REGRA:Operação concorrente.");
  }else if(input.action==="APPROVE"){
   if(!await hasCapability(user,"PAYOUT_APPROVE",tx))throw new Error("REGRA:Sem alçada de aprovação financeira.");
   if(t.status!=="REQUESTED"||t.requestedById===user.id)throw new Error("REGRA:Solicitante não pode aprovar.");
   const changed=await tx.eventTransfer.updateMany({where:{id,status:"REQUESTED"},data:{status:"APPROVED",approvedAt:new Date(),approvedById:user.id}});
   if(changed.count!==1)throw new Error("REGRA:Operação concorrente.");
  }else{
   if(!await hasCapability(user,"PAYOUT_SETTLE",tx))throw new Error("REGRA:Sem permissão para executar transferência interna.");
   if(t.status!=="APPROVED"||t.approvedById===user.id||t.requestedById===user.id)throw new Error("REGRA:Execução exige pessoa distinta do solicitante e aprovador.");
   // O pedido atual já consome o saldo disponível. Se outras reservas surgirem,
   // não é permitido executar sem recompor a margem correspondente.
   const cap=await eventAvailability(tx,t.originEventId);
   if(cap.transferMarginCents<0n)throw new Error("REGRA:Saldo insuficiente.");
   const permission=await tx.producerTransferPermission.findUnique({where:{producerId:t.producerId}});
   if(!permission?.enabled || t.amountCents>permission.maxPerTransferCents)
    throw new Error("REGRA:Permissão revogada ou limite reduzido.");
   const changed=await tx.eventTransfer.updateMany({where:{id,status:"APPROVED"},data:{status:"EXECUTED",executedAt:new Date(),executedById:user.id}});
   if(changed.count!==1)throw new Error("REGRA:Operação concorrente.");
  }
  await tx.auditLog.create({data:{actorId:user.id,entity:"EventTransfer",entityId:id,action:`TRANSFER_${input.action}`,summary:`Ação ${input.action} aplicada à transferência entre eventos. ${input.reason||""}`}});
  return {id,status:input.action==="EXECUTE"?"EXECUTED":input.action==="APPROVE"?"APPROVED":"REJECTED"};
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});return NextResponse.json(item);
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
