import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {authorize,fail} from "@/lib/auth";
import {CAPABILITIES,roleAllows} from "@/lib/governance";
import {prisma} from "@/lib/prisma";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
export async function GET(req:NextRequest){
 const {error}=await authorize(req,["ADMIN"]);if(error)return error;
 const users=await prisma.user.findMany({select:{id:true,name:true,email:true,role:true,active:true,producerId:true,permissionOverrides:{select:{permission:true,allowed:true}},approvalAuthorities:{select:{type:true,maxCents:true,active:true}}},orderBy:{name:"asc"}});
 return NextResponse.json({permissions:CAPABILITIES,items:users.map(u=>({...u,approvalAuthorities:u.approvalAuthorities.map(x=>({...x,maxCents:x.maxCents.toString()}))}))});
}
const schema=z.object({userId:z.string().min(1),permission:z.enum(CAPABILITIES),allowed:z.boolean()}).strict();
export async function POST(req:NextRequest){
 const {error,user}=await authorize(req,["ADMIN"]);if(error||!user)return error!;
 try{const x=schema.parse(await req.json());
  const subject=await prisma.user.findUnique({where:{id:x.userId},select:{role:true,active:true}});
  if(!subject)return fail("Usuário não encontrado.",404);
  if(subject.role==="ADMIN")return fail("As permissões administrativas são fixas. Altere o perfil somente por procedimento controlado.",403);
  if(x.allowed&&!roleAllows(subject.role,x.permission))return fail("Não é permitido ampliar privilégios além do perfil do usuário.",403);
  await prisma.$transaction(async tx=>{
   await tx.userPermissionOverride.upsert({where:{userId_permission:{userId:x.userId,permission:x.permission}},create:{userId:x.userId,permission:x.permission,allowed:x.allowed,changedById:user.id},update:{allowed:x.allowed,changedById:user.id}});
   await tx.auditLog.create({data:{actorId:user.id,action:"PERMISSION_CHANGED",entity:"User",entityId:x.userId,summary:`Permissão ${x.permission}: ${x.allowed?"liberada":"bloqueada"} dentro dos limites do perfil.`}});
  });return NextResponse.json({ok:true});
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
