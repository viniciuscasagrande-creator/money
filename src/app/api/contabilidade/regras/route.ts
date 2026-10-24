import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {apiCatch} from "@/lib/validation";
import {changeAccountingRule} from "@/lib/accounting-posting";
async function PATCHHandler(req:NextRequest){
 const {error,user}=await authorize(req,["ADMIN"]);if(error||!user)return error!;
 try{const input=z.object({ruleId:z.string().min(1),active:z.boolean()}).strict().parse(await req.json());return NextResponse.json(await changeAccountingRule(prisma,input.ruleId,input.active,user.id));}
 catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
export const PATCH=withMonitoring("/api/contabilidade/regras",PATCHHandler);
