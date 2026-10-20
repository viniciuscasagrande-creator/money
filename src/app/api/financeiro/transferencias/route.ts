import {NextRequest,NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {authorize,fail,isInternal} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {requestEventTransfer} from "@/lib/event-finance";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
const input=z.object({originEventId:z.string().min(1),destinationEventId:z.string().min(1),amountCents:z.string().regex(/^[1-9]\d{0,15}$/),reason:z.string().trim().min(8)}).strict();
export async function GET(req:NextRequest){const {user,error}=await authorize(req);if(error||!user)return error!;
 const where=isInternal(user.role)?{}:{producerId:user.producerId!};
 const items=await prisma.eventTransfer.findMany({where,include:{originEvent:{select:{name:true}},destinationEvent:{select:{name:true}}},orderBy:{createdAt:"desc"},take:100});
 return NextResponse.json({items:items.map(x=>({id:x.id,origin:x.originEvent.name,destination:x.destinationEvent.name,status:x.status,amountCents:x.amountCents.toString(),reason:x.reason}))});}
export async function POST(req:NextRequest){const {user,error}=await authorize(req);if(error||!user)return error!;
 try{const v=input.parse(await req.json());if(v.originEventId===v.destinationEventId)return fail("Eventos devem ser distintos.");
 const item=await requestEventTransfer({sourceEventId:v.originEventId,targetEventId:v.destinationEventId,amountCents:v.amountCents,reason:v.reason},user);
 return NextResponse.json({id:item.id},{status:201});}catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
