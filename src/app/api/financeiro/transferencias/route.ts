import {NextRequest,NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {authorize,fail,isInternal} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {eventAvailability} from "@/lib/operations";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
const input=z.object({originEventId:z.string().min(1),destinationEventId:z.string().min(1),amountCents:z.string().regex(/^[1-9]\d{0,15}$/),reason:z.string().trim().min(8)}).strict();
export async function GET(req:NextRequest){const {user,error}=await authorize(req);if(error||!user)return error!;
 const where=isInternal(user.role)?{}:{producerId:user.producerId!};
 const items=await prisma.eventTransfer.findMany({where,include:{originEvent:{select:{name:true}},destinationEvent:{select:{name:true}}},orderBy:{createdAt:"desc"},take:100});
 return NextResponse.json({items:items.map(x=>({id:x.id,origin:x.originEvent.name,destination:x.destinationEvent.name,status:x.status,amountCents:x.amountCents.toString(),reason:x.reason}))});}
export async function POST(req:NextRequest){const {user,error}=await authorize(req);if(error||!user)return error!;
 try{const v=input.parse(await req.json());if(v.originEventId===v.destinationEventId)return fail("Eventos devem ser distintos.");
 const item=await prisma.$transaction(async tx=>{
  const [origin,dest]=await Promise.all([tx.event.findUnique({where:{id:v.originEventId}}),tx.event.findUnique({where:{id:v.destinationEventId}})]);
  if(!origin||!dest||origin.producerId!==dest.producerId||origin.status==="CLOSED"||dest.status==="CLOSED")throw new Error("REGRA:Eventos incompatíveis para transferência.");
  if(!isInternal(user.role)&&origin.producerId!==user.producerId)throw new Error("REGRA:Acesso negado aos eventos.");
  const permission=await tx.producerTransferPermission.findUnique({where:{producerId:origin.producerId}});
  const amount=BigInt(v.amountCents);
  if(!permission?.enabled||amount>permission.maxPerTransferCents)throw new Error("REGRA:Transferência não habilitada ou acima do limite deste produtor.");
  const available=await eventAvailability(tx,v.originEventId);
  if(amount>available.repasseCents)throw new Error("REGRA:Saldo disponível insuficiente após as retenções e travas.");
  const t=await tx.eventTransfer.create({data:{producerId:origin.producerId,originEventId:v.originEventId,destinationEventId:v.destinationEventId,amountCents:amount,reason:v.reason,requestedById:user.id}});
  await tx.auditLog.create({data:{actorId:user.id,entity:"EventTransfer",entityId:t.id,action:"TRANSFER_REQUESTED",summary:`Transferência solicitada entre eventos ${origin.id} → ${dest.id}.`}});return t;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 return NextResponse.json({id:item.id},{status:201});}catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
