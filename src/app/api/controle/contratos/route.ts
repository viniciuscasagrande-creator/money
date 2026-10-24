import {withMonitoring} from "@/lib/observability";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch,isoDate } from "@/lib/validation";
export const runtime="nodejs";
const schema=z.object({title:z.string().trim().min(3).max(140),counterparty:z.string().trim().min(3).max(140),
 eventId:z.string().optional().nullable(),producerId:z.string().optional().nullable(),
 status:z.enum(["DRAFT","ACTIVE","EXPIRED"]),startDate:z.string().date(),endDate:z.string().date().optional().nullable(),
 terms:z.string().trim().min(6).max(3000)}).strict();
async function GETHandler(req:NextRequest){
 const {error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error)return error;
 const rows=await prisma.financialContract.findMany({take:150,orderBy:{createdAt:"desc"},include:{event:{select:{name:true}}}});
 return NextResponse.json({items:rows.map(x=>({id:x.id,title:x.title,counterparty:x.counterparty,eventName:x.event?.name??"—",status:x.status,
 startDate:x.startDate.toISOString(),endDate:x.endDate?.toISOString()??null,terms:x.terms}))});
}
async function POSTHandler(req:NextRequest){
 const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try{const input=schema.parse(await req.json());if(input.endDate&&input.endDate<input.startDate)throw new Error("REGRA:O vencimento não pode anteceder o início.");
   let producerId=input.producerId||null;
   if(input.eventId){const ev=await prisma.event.findUnique({where:{id:input.eventId}});if(!ev)throw new Error("REGRA:Evento inexistente.");
     if(producerId&&producerId!==ev.producerId)throw new Error("REGRA:Produtor e evento incompatíveis.");producerId=ev.producerId;}
   if(producerId&&!await prisma.producer.findUnique({where:{id:producerId}}))throw new Error("REGRA:Produtor não encontrado.");
   const row=await prisma.$transaction(async tx=>{const contract=await tx.financialContract.create({data:{
     title:input.title,counterparty:input.counterparty,status:input.status,producerId,eventId:input.eventId||null,
     startDate:isoDate(input.startDate)!,endDate:isoDate(input.endDate),terms:input.terms,createdById:user.id}});
     await tx.auditLog.create({data:{actorId:user.id,action:"CONTRACT_CREATED",entity:"FinancialContract",entityId:contract.id,
      summary:"Contrato cadastrado para controle documental; não altera taxas, saldos ou repasses."}});return contract;});
   return NextResponse.json({id:row.id},{status:201});
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const GET=withMonitoring("/api/controle/contratos",GETHandler);
export const POST=withMonitoring("/api/controle/contratos",POSTHandler);
