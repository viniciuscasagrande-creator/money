import {withMonitoring} from "@/lib/observability";
import {loadProducerFinancialPolicy} from "@/lib/payout-locks";
import {hasCapability} from "@/lib/governance";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
async function GETHandler(req:NextRequest){const {error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error)return error;
 const [items, allProducers]=await Promise.all([
  prisma.producerTransferPermission.findMany({include:{producer:{select:{name:true}}}}),
  prisma.producer.findMany({where:{active:true},orderBy:{name:"asc"},select:{id:true,name:true}})
 ]);
 return NextResponse.json({
  items:await Promise.all(allProducers.map(async p=>{const v=await loadProducerFinancialPolicy(prisma,p.id);return {producerId:p.id,name:p.name,enabled:v.allowEventTransfers,maxPerTransferCents:v.maxSingleTransferCents};})),
  producers:allProducers
 });}
async function POSTHandler(req:NextRequest){const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 try{const v=z.object({producerId:z.string().min(1),enabled:z.boolean(),maxPerTransferCents:z.string().regex(/^\d{1,16}$/)}).strict().parse(await req.json());
 const permission=await prisma.$transaction(async tx=>{const prod=await tx.producer.findUnique({where:{id:v.producerId}});if(!prod)throw new Error("REGRA:Produtor inexistente.");
 if(!await hasCapability(user,"PAYOUT_APPROVE",tx))throw new Error("REGRA:Sem permissão para alterar políticas.");
 const current=await loadProducerFinancialPolicy(tx,v.producerId);
 const policy={...current,allowEventTransfers:v.enabled,maxSingleTransferCents:v.maxPerTransferCents,updatedAt:new Date().toISOString()};
 await tx.financeSetting.upsert({where:{key:`producer_policy:${v.producerId}`},create:{key:`producer_policy:${v.producerId}`,value:JSON.stringify(policy),changedById:user.id},update:{value:JSON.stringify(policy),changedById:user.id}});
 const p=await tx.producerTransferPermission.upsert({where:{producerId:v.producerId},create:{producerId:v.producerId,enabled:v.enabled,maxPerTransferCents:BigInt(v.maxPerTransferCents)},update:{enabled:v.enabled,maxPerTransferCents:BigInt(v.maxPerTransferCents)}});
 await tx.auditLog.create({data:{actorId:user.id,entity:"ProducerTransferPermission",entityId:v.producerId,action:"TRANSFER_PERMISSION_CHANGED",summary:`Permissão de transferência ${v.enabled?"ativada":"desativada"} para o produtor.`}});return p;
 });return NextResponse.json({producerId:permission.producerId});}catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const GET=withMonitoring("/api/financeiro/permissoes-transferencia",GETHandler);
export const POST=withMonitoring("/api/financeiro/permissoes-transferencia",POSTHandler);
