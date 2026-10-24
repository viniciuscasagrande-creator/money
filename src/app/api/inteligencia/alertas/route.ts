import {withMonitoring} from "@/lib/observability";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import {authorize,fail} from "@/lib/auth";
import {hasCapability,readSettings} from "@/lib/governance";
import {prisma} from "@/lib/prisma";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
const daysBefore=(n:number)=>new Date(Date.now()-n*86400000);
async function GETHandler(req:NextRequest){
 const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 if(!await hasCapability(user,"ALERT_VIEW"))return fail("Sem permissão para alertas.",403);
 const c=await readSettings();
 const [overdue,payouts,risks,statements,acks]=await Promise.all([
  prisma.financialTitle.findMany({where:{status:"OPEN",dueDate:{lt:daysBefore(c.overdueDays)}},select:{id:true,description:true,dueDate:true},orderBy:{dueDate:"asc"},take:100}),
  prisma.payoutRequest.findMany({where:{status:{in:["REQUESTED","APPROVED","PRODUCER_ACCEPTED","READY_TO_SETTLE"]},createdAt:{lt:daysBefore(c.payoutPendingDays)}},select:{id:true,type:true,createdAt:true},orderBy:{createdAt:"asc"},take:100}),
  prisma.riskCase.findMany({where:{status:"OPEN",createdAt:{lt:daysBefore(c.openRiskDays)}},select:{id:true,type:true,createdAt:true},orderBy:{createdAt:"asc"},take:100}),
  prisma.bankStatementLine.findMany({where:{status:"PENDING",createdAt:{lt:daysBefore(c.unmatchedDays)}},select:{id:true,description:true,createdAt:true},orderBy:{createdAt:"asc"},take:100}),
  prisma.alertAcknowledgement.findMany({where:{userId:user.id},select:{key:true}})
 ]);
 const acknowledged=new Set(acks.map(a=>a.key));
 const data=[
  ...overdue.map(r=>({key:`TITULO:${r.id}`,kind:"Título vencido",severity:"ALTA",message:r.description,date:r.dueDate?.toISOString()})),
  ...payouts.map(r=>({key:`REPASSE:${r.id}`,kind:"Aprovação pendente",severity:"MEDIA",message:r.type==="REPASSE"?"Repasse sem conclusão":"Antecipação sem conclusão",date:r.createdAt.toISOString()})),
  ...risks.map(r=>({key:`RISCO:${r.id}`,kind:"Ocorrência de risco",severity:"ALTA",message:r.type==="REFUND"?"Estorno em análise":"Chargeback em análise",date:r.createdAt.toISOString()})),
  ...statements.map(r=>({key:`EXTRATO:${r.id}`,kind:"Conciliação pendente",severity:"MEDIA",message:r.description,date:r.createdAt.toISOString()}))
 ];
 return NextResponse.json({items:data.map(a=>({...a,acknowledged:acknowledged.has(a.key)})),limits:{maxPerCategory:100},mode:"Consulta sob demanda, sem notificações agendadas."},{headers:{"Cache-Control":"no-store"}});
}
const input=z.object({key:z.string().regex(/^(TITULO|REPASSE|RISCO|EXTRATO):[\w-]{5,100}$/),acknowledged:z.boolean()}).strict();
async function POSTHandler(req:NextRequest){
 const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 if(!await hasCapability(user,"ALERT_VIEW"))return fail("Sem permissão para alertas.",403);
 try{const x=input.parse(await req.json());
  // Não permite escrever uma chave arbitrária ou referente a um objeto inexistente.
  const [kind,id]=x.key.split(":");
  const exists=kind==="TITULO"?await prisma.financialTitle.count({where:{id}}):kind==="REPASSE"?await prisma.payoutRequest.count({where:{id}}):kind==="RISCO"?await prisma.riskCase.count({where:{id}}):await prisma.bankStatementLine.count({where:{id}});
  if(!exists)return fail("Alerta não encontrado.",404);
  await prisma.$transaction(async tx=>{
   if(x.acknowledged)await tx.alertAcknowledgement.upsert({where:{key_userId:{key:x.key,userId:user.id}},create:{key:x.key,userId:user.id},update:{}});
   else await tx.alertAcknowledgement.deleteMany({where:{key:x.key,userId:user.id}});
   await tx.auditLog.create({data:{actorId:user.id,entity:"AlertAcknowledgement",entityId:x.key,action:x.acknowledged?"ALERT_ACK":"ALERT_UNACK",summary:"Usuário alterou confirmação de leitura de alerta. Não encerra a ocorrência."}});
  });return NextResponse.json({ok:true});
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const GET=withMonitoring("/api/inteligencia/alertas",GETHandler);
export const POST=withMonitoring("/api/inteligencia/alertas",POSTHandler);
