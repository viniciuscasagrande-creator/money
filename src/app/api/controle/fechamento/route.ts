import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import { allocateReconciliation,changeReconciliationIssue,closeFinancialMonth,financialMonth,financialCloseSummary } from "@/lib/financial-close";
export const runtime="nodejs";
export const maxDuration=60;
const id=z.string().min(1).max(100),reason=z.string().trim().min(5).max(300),cents=z.string().regex(/^[1-9]\d{0,15}$/);
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("ALLOCATE"),statementId:id,ledgerEntryId:id,amountCents:cents,requestKey:z.string().uuid()}).strict(),
  z.object({action:z.literal("ISSUE"),statementId:id,reason}).strict(),
  z.object({action:z.literal("RESOLVE"),statementId:id,issueId:id,reason}).strict(),
  z.object({action:z.literal("CLOSE"),bankAccountId:id,month:z.string(),declaredBalanceCents:z.string().regex(/^-?\d{1,16}$/)}).strict()
]);
const serialize=(value:unknown)=>JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==="bigint"?v.toString():v));
export async function GET(req:NextRequest){
  const {error,user}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
  try{
    const bankAccountId=id.parse(req.nextUrl.searchParams.get("bankAccountId")),month=req.nextUrl.searchParams.get("month")??"";
    const {start,end}=financialMonth(month);
    const result=await prisma.$transaction(async tx=>{
      const statements=await tx.bankStatementLine.findMany({where:{bankAccountId,postedAt:{gte:start,lt:end}},orderBy:{postedAt:"asc"},take:100,include:{allocations:{select:{id:true,ledgerEntryId:true,amountCents:true}},issues:{orderBy:{createdAt:"desc"}}}});
      const ledger=await tx.ledgerEntry.findMany({where:{bankAccountId,origin:{not:"OPENING"},createdAt:{gte:start,lt:end}},orderBy:{createdAt:"asc"},take:100,include:{allocations:{select:{amountCents:true}}}});
      const summary=await financialCloseSummary(tx,bankAccountId,month);
      const closed=await tx.financialClose.findUnique({where:{bankAccountId_month:{bankAccountId,month}}});
      return {statements:statements.map(s=>({...s,remainingCents:s.amountCents-s.allocations.reduce((n,a)=>n+a.amountCents,0n)})),ledger:ledger.map(l=>({...l,remainingCents:l.amountCents-l.allocations.reduce((n,a)=>n+a.amountCents,0n)})),summary,closed};
    },{timeout:30000});
    return NextResponse.json({...serialize(result),canClose:user.role==="ADMIN"},{headers:{"Cache-Control":"no-store"}});
  }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
export async function POST(req:NextRequest){
  const {error,user}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
  try{
    const input=schema.parse(await req.json().catch(()=>null));let result:unknown;
    if(input.action==="CLOSE"){
      if(user.role!=="ADMIN")return fail("Somente Administrador pode fechar uma competência.",403);
      result=await closeFinancialMonth(prisma,input.bankAccountId,input.month,BigInt(input.declaredBalanceCents),user.id);
    }else if(input.action==="ALLOCATE")result=await allocateReconciliation(prisma,{...input,amountCents:BigInt(input.amountCents)},user.id);
    else result=await changeReconciliationIssue(prisma,{statementId:input.statementId,reason:input.reason,...(input.action==="RESOLVE"?{resolveId:input.issueId}:{})},user.id);
    return NextResponse.json(serialize(result));
  }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
