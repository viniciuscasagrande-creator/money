import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import {jobSelection,processIntegrationQueue,retryIntegrationJob} from "@/lib/integration-queue";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:NextRequest){
  const {error}=await authorize(request,["ADMIN","FINANCE_DISK"]);if(error)return error;
  try{
    const page=z.coerce.number().int().min(1).max(1000).parse(request.nextUrl.searchParams.get("page")??1);
    const [items,total]=await prisma.$transaction([
      prisma.integrationJob.findMany({orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*20,take:20,select:jobSelection}),
      prisma.integrationJob.count()
    ]);
    return NextResponse.json({items,total,page,pageSize:20},{headers:{"Cache-Control":"no-store"}});
  }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("PROCESS")}).strict(),
  z.object({action:z.literal("RETRY"),id:z.string().min(1).max(100),reason:z.string().trim().min(5).max(200)}).strict()
]);
export async function POST(request:NextRequest){
  const {user,error}=await authorize(request,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
  try{
    const input=schema.parse(await request.json().catch(()=>null));
    if(input.action==="RETRY"){
      if(user.role!=="ADMIN")return fail("Somente Administrador pode reabrir uma falha.",403);
      return NextResponse.json({job:await retryIntegrationJob(prisma,input.id,user.id,input.reason)});
    }
    return NextResponse.json({results:await processIntegrationQueue(prisma,1)});
  }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
