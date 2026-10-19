import {NextRequest,NextResponse} from "next/server";import {z} from "zod";import {authorize,fail} from "@/lib/auth";import {prisma} from "@/lib/prisma";
export async function PATCH(req:NextRequest){const {error,user}=await authorize(req,["ADMIN"]);if(error||!user)return error!;
 try{const x=z.object({ruleId:z.string().min(1),active:z.boolean()}).strict().parse(await req.json());
 const changed=await prisma.$transaction(async tx=>{const target=await tx.accountingRule.findUnique({where:{id:x.ruleId}});if(!target)throw new Error("Regra não encontrada.");
 if(x.active){await tx.accountingRule.updateMany({where:{eventType:target.eventType,active:true},data:{active:false}});}
 const row=await tx.accountingRule.update({where:{id:x.ruleId},data:{active:x.active}});
 await tx.auditLog.create({data:{actorId:user.id,action:"ACCOUNTING_RULE_CHANGED",entity:"AccountingRule",entityId:row.id,summary:`Regra contábil ${x.active?"ativada":"desativada"}.`}});return row;});return NextResponse.json({id:changed.id,active:changed.active});
 }catch(e){return fail(e instanceof Error?e.message:"Erro.");}}
