import {createEventReserve} from "@/lib/event-finance";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
export const runtime = "nodejs";
const add = z.object({ eventId:z.string().min(1), purpose:z.string().trim().min(3).max(150), amountCents:z.string().regex(/^[1-9]\d{0,15}$/) }).strict();
export async function GET(request:NextRequest){
 const {user,error}=await authorize(request,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 const items=await prisma.eventReserve.findMany({include:{event:{select:{name:true,producer:{select:{name:true}}}}},orderBy:{createdAt:"desc"},take:200});
 return NextResponse.json({items:items.map(r=>({id:r.id,eventId:r.eventId,eventName:r.event.name,producerName:r.event.producer.name,purpose:r.purpose,amountCents:r.amountCents.toString(),status:r.status}))});
}
export async function POST(request:NextRequest){
 const {user,error}=await authorize(request,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try { const v=add.parse(await request.json());const reserve=await prisma.$transaction(tx=>createEventReserve(tx,{eventId:v.eventId,description:v.purpose,amountCents:v.amountCents},user));return NextResponse.json({id:reserve.id},{status:201});
 } catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
