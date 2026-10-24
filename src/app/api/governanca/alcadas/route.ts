import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
async function GETHandler(req:NextRequest){
 const {error}=await authorize(req,["ADMIN"]);if(error)return error;
 const grants=await prisma.approvalAuthority.findMany({include:{user:{select:{name:true,email:true}}},orderBy:[{updatedAt:"desc"}]});
 return NextResponse.json({items:grants.map(g=>({id:g.id,userId:g.userId,userName:g.user.name,type:g.type,maxCents:g.maxCents.toString(),active:g.active,updatedAt:g.updatedAt.toISOString()}))});
}
const schema=z.object({userId:z.string().min(1),type:z.enum(["REPASSE","ANTECIPACAO"]),maxCents:z.string().regex(/^\d{1,15}$/),active:z.boolean()}).strict();
async function POSTHandler(req:NextRequest){
 const {error,user}=await authorize(req,["ADMIN"]);if(error||!user)return error!;
 try{const x=schema.parse(await req.json());const amount=BigInt(x.maxCents);
  const subject=await prisma.user.findUnique({where:{id:x.userId},select:{role:true,active:true}});
  if(!subject||subject.role!=="FINANCE_DISK"||!subject.active)return fail("Alçada só pode ser atribuída a usuário ativo do Financeiro Interno.");
  await prisma.$transaction(async tx=>{
   await tx.approvalAuthority.upsert({where:{userId_type:{userId:x.userId,type:x.type}},create:{userId:x.userId,type:x.type,maxCents:amount,active:x.active,changedById:user.id},update:{maxCents:amount,active:x.active,changedById:user.id}});
   await tx.auditLog.create({data:{actorId:user.id,action:"APPROVAL_AUTHORITY_CHANGED",entity:"User",entityId:x.userId,summary:`Alçada de ${x.type}: ${amount} centavos; ativa: ${x.active}.`}});
  });return NextResponse.json({ok:true});
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const GET=withMonitoring("/api/governanca/alcadas",GETHandler);
export const POST=withMonitoring("/api/governanca/alcadas",POSTHandler);
