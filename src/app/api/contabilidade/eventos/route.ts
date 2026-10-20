import {Prisma} from "@prisma/client";
import {NextRequest,NextResponse} from "next/server";import {z} from "zod";import {authorize,fail} from "@/lib/auth";import {prisma} from "@/lib/prisma";import {currencyCents} from "@/lib/accounting-core";
export const runtime="nodejs";
const schema=z.object({externalKey:z.string().min(8).max(150),type:z.string().regex(/^[A-Z_]{3,60}$/),source:z.enum(["ONLINE","POS","BOX_OFFICE","FINANCE"]),sourceId:z.string().min(1).max(100),eventId:z.string().nullable().optional(),amountCents:z.string(),occurredAt:z.string().datetime()}).strict();
export async function POST(req:NextRequest){const {error,user}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try{const x=schema.parse(await req.json());const amount=currencyCents(x.amountCents);
 if(x.eventId&&!await prisma.event.findUnique({where:{id:x.eventId}}))return fail("Evento inexistente.");
 const found=await prisma.accountingBusinessEvent.findUnique({where:{externalKey:x.externalKey}});if(found)return NextResponse.json({id:found.id,status:found.status,duplicate:true});
 const item=await prisma.$transaction(async tx=>{const period=await tx.accountingPeriod.findUnique({where:{name:x.occurredAt.slice(0,7)}});if(period){const open=await tx.accountingPeriod.updateMany({where:{id:period.id,status:"OPEN"},data:{status:"OPEN"}});if(open.count!==1)throw new Error("Período contábil fechado.");}const record=await tx.accountingBusinessEvent.create({data:{externalKey:x.externalKey,type:x.type,source:x.source,sourceId:x.sourceId,eventId:x.eventId||null,amountCents:amount,occurredAt:new Date(x.occurredAt)}});await tx.auditLog.create({data:{actorId:user.id,action:"ACCOUNTING_EVENT_REGISTERED",entity:"AccountingBusinessEvent",entityId:record.id,summary:"Evento de negócio recebido; ainda não contabilizado."}});return record;},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 return NextResponse.json({id:item.id,status:item.status},{status:201});
 }catch(e){return fail(e instanceof Error?e.message:"Falha no registro.",400);}}
