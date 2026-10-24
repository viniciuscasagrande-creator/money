import {withMonitoring} from "@/lib/observability";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registerRisk } from "@/lib/control";
import { apiCatch } from "@/lib/validation";
export const runtime="nodejs";
const schema=z.object({saleId:z.string().min(1),externalId:z.string().trim().min(4).max(100),type:z.enum(["REFUND","CHARGEBACK"]),
 exposureCents:z.string().regex(/^\d{1,16}$/),reason:z.string().trim().min(8).max(300)}).strict();
async function GETHandler(req:NextRequest){
 const {error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error)return error;
 const rows=await prisma.riskCase.findMany({take:150,orderBy:{createdAt:"desc"},include:{event:{select:{name:true}},sale:{select:{externalReference:true}}}});
 return NextResponse.json({items:rows.map(r=>({id:r.id,externalId:r.externalId,saleReference:r.sale.externalReference,
   eventName:r.event.name,type:r.type,status:r.status,reason:r.reason,exposureCents:r.exposureCents.toString(),createdAt:r.createdAt.toISOString()}))});
}
async function POSTHandler(req:NextRequest){
 const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try{const id=await registerRisk(schema.parse(await req.json()),user);return NextResponse.json({id},{status:201});}
 catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const GET=withMonitoring("/api/controle/riscos",GETHandler);
export const POST=withMonitoring("/api/controle/riscos",POSTHandler);
