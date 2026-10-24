import {NextRequest,NextResponse} from "next/server";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {collectMonitorSignals,monitorConfig,webhookConfig,retryOperationalNotification} from "@/lib/operational-monitor";
import {withMonitoring} from "@/lib/observability";
import {z} from "zod";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
async function GETHandler(request:NextRequest){
  const {error}=await authorize(request,["ADMIN"]);if(error)return error;
  const signals=await collectMonitorSignals(prisma,monitorConfig());
  const [pending,dead,recent,evaluation]=await Promise.all([
    prisma.operationalNotification.count({where:{status:{in:["PENDING","SENDING"]}}}),
    prisma.operationalNotification.count({where:{status:"DEAD"}}),
    prisma.operationalNotification.findMany({orderBy:[{createdAt:"desc"},{id:"desc"}],take:20,select:{id:true,signal:true,transition:true,status:true,attempts:true,createdAt:true,sentAt:true}}),
    prisma.financeSetting.findUnique({where:{key:"monitor:evaluation-lock"},select:{updatedAt:true}})
  ]);
  let channelConfigured=false;try{webhookConfig();channelConfigured=true;}catch{}
  const evaluationAge=evaluation?Date.now()-evaluation.updatedAt.getTime():Infinity;
  const evaluationFresh=evaluationAge>=-60000&&evaluationAge<10*60000;
  return NextResponse.json({checkedAt:new Date().toISOString(),lastEvaluationAt:evaluation?.updatedAt.toISOString()??null,evaluationFresh,status:signals.some(s=>s.active)||dead?"ATTENTION":evaluationFresh?"OK":"NOT_CHECKED",signals,notifications:{pending,dead,recent},channelConfigured},{headers:{"Cache-Control":"no-store, private"}});
}
export const GET=withMonitoring("/api/sistema/monitoramento",GETHandler);
async function POSTHandler(request:NextRequest){
  const {error,user}=await authorize(request,["ADMIN"]);if(error||!user)return error!;
  try{
    const input=z.object({action:z.literal("RETRY"),id:z.string().min(1).max(100)}).strict().parse(await request.json().catch(()=>null));
    return NextResponse.json(await retryOperationalNotification(prisma,input.id,user.id));
  }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
export const POST=withMonitoring("/api/sistema/monitoramento",POSTHandler);
