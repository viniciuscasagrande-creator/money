import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {DEFAULT_TAX_PARAMETERS_BPS} from "@/lib/accounting-core";
import {accountingReport} from "@/lib/accounting-reports";
import {apiCatch} from "@/lib/validation";
export const runtime="nodejs";
async function GETHandler(req:NextRequest){
 const {error,user}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
 const view=req.nextUrl.searchParams.get("visao")||"resumo",month=req.nextUrl.searchParams.get("periodo");
 if(["razao","balancete","dre","passivos"].includes(view)&&(!month||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)))return fail("Informe período AAAA-MM.");
 try{
  if(view==="balancete"||view==="dre"||view==="passivos")return NextResponse.json(await accountingReport(prisma,view,month!),{headers:{"Cache-Control":"no-store"}});
  if(view==="contas")return NextResponse.json({items:await prisma.accountingAccount.findMany({orderBy:{code:"asc"},take:500})});
  if(view==="periodos")return NextResponse.json({canManage:user.role==="ADMIN",items:await prisma.accountingPeriod.findMany({orderBy:{name:"desc"},take:100})});
  if(view==="regras")return NextResponse.json({canManage:user.role==="ADMIN",items:await prisma.accountingRule.findMany({orderBy:[{eventType:"asc"},{version:"desc"}],take:200})});
  if(view==="eventos"){const items=await prisma.accountingBusinessEvent.findMany({orderBy:{createdAt:"desc"},take:100});return NextResponse.json({items:items.map(r=>({...r,amountCents:r.amountCents.toString()}))});}
  if(view==="razao"){
   const page=Number(req.nextUrl.searchParams.get("page")??1);if(!Number.isInteger(page)||page<1||page>100000)return fail("Página inválida.");
   const where={period:{name:month!}};
   const [items,total]=await prisma.$transaction([prisma.accountingJournal.findMany({where,orderBy:[{occurredAt:"desc"},{id:"desc"}],skip:(page-1)*100,take:100,include:{postings:{include:{account:{select:{code:true,name:true}}}},businessEvent:{select:{externalKey:true,source:true,sourceId:true,type:true}}}}),prisma.accountingJournal.count({where})]);
   return NextResponse.json({items:items.map(({ruleSnapshotJson:_,...r})=>({...r,postings:r.postings.map(p=>({...p,debitCents:p.debitCents.toString(),creditCents:p.creditCents.toString()}))})),page,pageSize:100,total});
  }
  if(view!=="resumo")return fail("Visão contábil inválida.");
  const [accounts,periods,events,journals,taxSetting]=await Promise.all([prisma.accountingAccount.count(),prisma.accountingPeriod.count(),prisma.accountingBusinessEvent.count(),prisma.accountingJournal.count(),prisma.financeSetting.findUnique({where:{key:"accounting_tax_bps"}})]);
  let taxRatesBps=DEFAULT_TAX_PARAMETERS_BPS;if(taxSetting?.value)try{taxRatesBps=JSON.parse(taxSetting.value);}catch{}
  return NextResponse.json({accounts,periods,events,journals,taxRatesBps,taxConfigured:!!taxSetting});
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const GET=withMonitoring("/api/contabilidade",GETHandler);
