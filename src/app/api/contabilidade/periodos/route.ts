import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {closeAccountingPeriod} from "@/lib/accounting-close";
import {apiCatch} from "@/lib/validation";
async function PATCHHandler(req:NextRequest){
 const {error,user}=await authorize(req,["ADMIN"]);if(error||!user)return error!;
 try{const input=z.object({periodId:z.string().min(1),status:z.literal("CLOSED")}).strict().parse(await req.json());return NextResponse.json(await closeAccountingPeriod(prisma,input.periodId,user.id));}
 catch(e){if(e instanceof Error&&e.message.startsWith("REGRA:"))return fail(e.message.slice(6));const x=apiCatch(e);return fail(x.message,x.status);}
}

export const PATCH=withMonitoring("/api/contabilidade/periodos",PATCHHandler);
