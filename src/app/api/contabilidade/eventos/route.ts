import {Prisma} from "@prisma/client";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {currencyCents} from "@/lib/accounting-core";
import {storeAccountingBusinessEvent} from "@/lib/accounting-integration";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
const schema=z.object({externalKey:z.string().min(8).max(150),type:z.string().regex(/^[A-Z_]{3,60}$/),source:z.enum(["ONLINE","POS","BOX_OFFICE","FINANCE"]),sourceId:z.string().min(1).max(100),eventId:z.string().nullable().optional(),amountCents:z.string(),occurredAt:z.string().datetime()}).strict();
export async function POST(req:NextRequest){
 const {error,user}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try{
  const x=schema.parse(await req.json());let amount:bigint;
  try{amount=currencyCents(x.amountCents);}catch{return fail("Valor inválido em centavos.");}
  if(/^(sale|title-settlement|payout|reserve|reserve-status|transfer|transfer-reversal):/.test(x.externalKey))return fail("Prefixo reservado às operações financeiras integradas.");
  const result=await prisma.$transaction(async tx=>{
   const event=x.eventId?await tx.event.findUnique({where:{id:x.eventId},select:{producerId:true}}):null;
   if(x.eventId&&!event)throw new Error("REGRA:Evento inexistente.");
   const item=await storeAccountingBusinessEvent({...x,amountCents:amount,occurredAt:new Date(x.occurredAt),producerId:event?.producerId},tx);
   if(!item.duplicate)await tx.auditLog.create({data:{actorId:user.id,action:"ACCOUNTING_EVENT_REGISTERED",entity:"AccountingBusinessEvent",entityId:item.id,summary:"Evento manual recebido; ainda não contabilizado."}});
   return item;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  return NextResponse.json(result,{status:result.duplicate?200:201});
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}