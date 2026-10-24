import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {authorize,fail,isInternal} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {requestEventTransfer} from "@/lib/event-finance";
import {apiCatch} from "@/lib/validation";
import {listTransfers} from "@/lib/operational-lists";
export const runtime="nodejs";
const input=z.object({originEventId:z.string().min(1),destinationEventId:z.string().min(1),amountCents:z.string().regex(/^[1-9]\d{0,15}$/),reason:z.string().trim().min(8)}).strict();
async function GETHandler(req:NextRequest){const {user,error}=await authorize(req);if(error||!user)return error!;
 try{return NextResponse.json(await listTransfers(prisma,user,req.nextUrl.searchParams),{headers:{"Cache-Control":"no-store, private"}});}
 catch(e){const x=apiCatch(e);return fail(x.message,x.status);}}
async function POSTHandler(req:NextRequest){const {user,error}=await authorize(req);if(error||!user)return error!;
 try{const v=input.parse(await req.json());if(v.originEventId===v.destinationEventId)return fail("Eventos devem ser distintos.");
 const item=await requestEventTransfer({sourceEventId:v.originEventId,targetEventId:v.destinationEventId,amountCents:v.amountCents,reason:v.reason},user);
 return NextResponse.json({id:item.id},{status:201});}catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const GET=withMonitoring("/api/financeiro/transferencias",GETHandler);
export const POST=withMonitoring("/api/financeiro/transferencias",POSTHandler);
