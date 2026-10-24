import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {authorize,fail} from "@/lib/auth";
import {readSettings,validSetting} from "@/lib/governance";
import {prisma} from "@/lib/prisma";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
async function GETHandler(req:NextRequest){
 const {error}=await authorize(req,["ADMIN"]);if(error)return error;
 return NextResponse.json({settings:await readSettings(),description:"Os parâmetros afetam alertas consultados sob demanda, não programam disparos nem liberam transações."});
}
const schema=z.object({key:z.string(),value:z.number().int().min(0).max(90)}).strict();
async function POSTHandler(req:NextRequest){
 const {user,error}=await authorize(req,["ADMIN"]);if(error||!user)return error!;
 try{const x=schema.parse(await req.json());if(!validSetting(x.key,x.value))return fail("Parâmetro não autorizado.");
  await prisma.$transaction(async tx=>{
   await tx.financeSetting.upsert({where:{key:x.key},create:{key:x.key,value:String(x.value),changedById:user.id},update:{value:String(x.value),changedById:user.id}});
   await tx.auditLog.create({data:{actorId:user.id,action:"FINANCE_SETTING_CHANGED",entity:"FinanceSetting",entityId:x.key,summary:`Parâmetro de alerta atualizado para ${x.value} dia(s).`}});
  });return NextResponse.json({ok:true});
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const GET=withMonitoring("/api/governanca/configuracoes",GETHandler);
export const POST=withMonitoring("/api/governanca/configuracoes",POSTHandler);
