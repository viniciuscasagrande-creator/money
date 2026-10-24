import {withMonitoring} from "@/lib/observability";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,fail } from "@/lib/auth";
import { apiCatch } from "@/lib/validation";
import { decideRisk } from "@/lib/control";
export const runtime="nodejs";
async function POSTHandler(req:NextRequest){
 const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try{const a=z.object({id:z.string().min(1),decision:z.enum(["CONFIRMED","REJECTED"])}).strict().parse(await req.json());
   return NextResponse.json(await decideRisk(a.id,a.decision,user));}
 catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const POST=withMonitoring("/api/controle/risco-decisao",POSTHandler);
