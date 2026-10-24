import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import { z } from "zod";
import {authorize,fail} from "@/lib/auth";
import {apiCatch} from "@/lib/validation";
import {reconcileStatement} from "@/lib/control";
export const runtime="nodejs";
async function POSTHandler(req:NextRequest){
  const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
  try{const input=z.object({statementId:z.string().min(1),ledgerEntryId:z.string().min(1)}).strict().parse(await req.json());
    return NextResponse.json(await reconcileStatement(input.statementId,input.ledgerEntryId,user));}
  catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const POST=withMonitoring("/api/controle/conciliar",POSTHandler);
