import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {authorize,fail} from "@/lib/auth";
import {actOnEventTransfer} from "@/lib/event-finance";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
async function POSTHandler(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const {user,error}=await authorize(req);if(error||!user)return error!;
 try{const {id}=await params;const input=z.object({action:z.enum(["APPROVE","REJECT","PRODUCER_ACCEPT","EXECUTE","REVERSE"]),reason:z.string().optional()}).strict().parse(await req.json());
 return NextResponse.json(await actOnEventTransfer(id,input.action,user,input.reason));
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const POST=withMonitoring("/api/financeiro/transferencias/[id]",POSTHandler);
