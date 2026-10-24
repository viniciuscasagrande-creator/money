import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {previewAccounting} from "@/lib/accounting-posting";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
async function POSTHandler(req:NextRequest){
  const {error,user}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
  try{return NextResponse.json({...await previewAccounting(prisma,await req.json().catch(()=>null)),canPost:user.role==="ADMIN"},{headers:{"Cache-Control":"no-store"}});}
  catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const POST=withMonitoring("/api/contabilidade/previa",POSTHandler);
