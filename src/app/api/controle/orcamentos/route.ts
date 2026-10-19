import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCents } from "@/lib/money";
import { apiCatch } from "@/lib/validation";
export const runtime="nodejs";
const schema=z.object({eventId:z.string().min(1),kind:z.enum(["REVENUE","EXPENSE"]),
  category:z.string().trim().min(2).max(80),description:z.string().trim().min(3).max(180),amountCents:z.string().regex(/^\d{1,16}$/)}).strict();
export async function GET(req:NextRequest){
 const {error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error)return error;
 const rows=await prisma.budgetLine.findMany({take:200,orderBy:{createdAt:"desc"},include:{event:{select:{name:true}}}});
 const byEvent=new Map<string,{eventId:string;eventName:string;revenue:bigint;expense:bigint}>();
 for(const r of rows){const obj=byEvent.get(r.eventId)??{eventId:r.eventId,eventName:r.event.name,revenue:0n,expense:0n};
   if(r.kind==="REVENUE")obj.revenue+=r.amountCents;else obj.expense+=r.amountCents;byEvent.set(r.eventId,obj);}
 return NextResponse.json({items:rows.map(r=>({id:r.id,eventId:r.eventId,eventName:r.event.name,kind:r.kind,category:r.category,
   description:r.description,amountCents:r.amountCents.toString()})),
   summaries:[...byEvent.values()].map(x=>({...x,revenue:x.revenue.toString(),expense:x.expense.toString(),result:(x.revenue-x.expense).toString()})),
   truncated: rows.length===200});
}
export async function POST(req:NextRequest){
 const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try{const a=schema.parse(await req.json());const id=await prisma.$transaction(async tx=>{
   if(!await tx.event.findUnique({where:{id:a.eventId}}))throw new Error("REGRA:Evento não encontrado.");
   const r=await tx.budgetLine.create({data:{...a,amountCents:parseCents(a.amountCents),createdById:user.id}});
   await tx.auditLog.create({data:{actorId:user.id,entity:"BudgetLine",entityId:r.id,action:"BUDGET_CREATED",
   summary:"Previsão orçamentária criada. Não movimenta caixa ou saldo do produtor."}});return r.id;});
 return NextResponse.json({id},{status:201});}catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
