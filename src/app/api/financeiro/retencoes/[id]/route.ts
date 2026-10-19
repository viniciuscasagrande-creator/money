import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,fail } from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try {const {id}=await params;const {reason}=z.object({reason:z.string().trim().min(10)}).strict().parse(await req.json());
 await prisma.$transaction(async tx=>{const result=await tx.eventReserve.updateMany({where:{id,status:"ACTIVE"},data:{status:"RELEASED",releaseReason:reason,releasedAt:new Date()}});
 if(result.count!==1)throw new Error("REGRA:Reserva inexistente ou já liberada.");
 await tx.auditLog.create({data:{actorId:user.id,entity:"EventReserve",entityId:id,action:"RESERVE_RELEASED",summary:`Retenção liberada mediante justificativa: ${reason}`}});
 });return NextResponse.json({ok:true});}catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
