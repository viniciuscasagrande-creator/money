import {withMonitoring} from "@/lib/observability";
import {changeEventReserve} from "@/lib/event-finance";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,fail } from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
async function POSTHandler(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try {const {id}=await params;const {reason}=z.object({reason:z.string().trim().min(10)}).strict().parse(await req.json());
 await prisma.$transaction(tx=>changeEventReserve(tx,id,"RELEASED",reason,user));return NextResponse.json({ok:true});}catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const POST=withMonitoring("/api/financeiro/retencoes/[id]",POSTHandler);
