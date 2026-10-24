import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {accountingSource} from "@/lib/accounting-posting";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
async function GETHandler(req:NextRequest){
 const {error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error)return error;
 const id=req.nextUrl.searchParams.get("journalId");if(!id||id.length>100)return fail("Informe o lançamento contábil.");
 try{
  const result=await prisma.$transaction(async tx=>{
   const journal=await tx.accountingJournal.findUnique({where:{id},include:{businessEvent:true,period:true,postings:{include:{account:{select:{id:true,code:true,name:true,type:true}}}}}});
   if(!journal)return null;
   let snapshot:unknown=null;try{snapshot=journal.ruleSnapshotJson?JSON.parse(journal.ruleSnapshotJson):null;}catch{}
   const operator=journal.postedById?await tx.user.findUnique({where:{id:journal.postedById},select:{id:true,name:true}}):null;
   const {ruleSnapshotJson:_,...record}=journal;
   return {journal:record,origin:await accountingSource(tx,journal.businessEvent),snapshot,operator,legacySnapshotUnavailable:snapshot===null};
  },{timeout:30000});
  if(!result)return fail("Lançamento não encontrado.",404);
  return NextResponse.json(JSON.parse(JSON.stringify(result,(_k,v)=>typeof v==="bigint"?v.toString():v)),{headers:{"Cache-Control":"no-store"}});
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const GET=withMonitoring("/api/contabilidade/trilha",GETHandler);
