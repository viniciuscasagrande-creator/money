import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {accountingAccounts,csvCell} from "@/lib/control-math";
export const runtime="nodejs";
async function GETHandler(req:NextRequest){
 const {error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error)return error;
 const params=req.nextUrl.searchParams;
 const start=params.get("inicio"),end=params.get("fim");
 if(!start||!end||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)
   return fail("Informe período válido de início e fim no formato AAAA-MM-DD.");
 const from=new Date(`${start}T00:00:00.000Z`),until=new Date(`${end}T23:59:59.999Z`);
 if(Number.isNaN(from.valueOf())||Number.isNaN(until.valueOf())||until.valueOf()-from.valueOf()>93*86400000)
   return fail("Período inválido ou superior a 93 dias.");
 const total=await prisma.ledgerEntry.count({where:{createdAt:{gte:from,lte:until}}});
 if(total>5000)return fail("Há mais de 5.000 movimentações. Reduza o período da exportação.",413);
 const entries=await prisma.ledgerEntry.findMany({where:{createdAt:{gte:from,lte:until}},
   orderBy:[{createdAt:"asc"},{id:"asc"}],include:{bankAccount:{select:{name:true}}}});
 const rows=entries.map(e=>({id:e.id,date:e.createdAt.toISOString(),bank:e.bankAccount.name,origin:e.origin,
   description:e.description,amountCents:e.amountCents.toString(),...accountingAccounts(e.origin,e.direction)}));
 if(params.get("formato")==="csv"){
   const cols=["ID","Data (UTC)","Conta bancária","Origem","Descrição","Débito (sugestão)","Crédito (sugestão)","Valor em centavos"];
   const values=rows.map(r=>[r.id,r.date,r.bank,r.origin,r.description,r.debit,r.credit,r.amountCents]);
   const csv="\uFEFF"+[cols,...values].map(line=>line.map(v=>csvCell(v)).join(";")).join("\r\n");
   return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":'attachment; filename="exportacao-contabil-conferencia.csv"',"Cache-Control":"no-store"}});
 }
 return NextResponse.json({period:{start,end},count:rows.length,totalDebitsCents:rows.reduce((a,r)=>a+BigInt(r.amountCents),0n).toString(),
   totalCreditsCents:rows.reduce((a,r)=>a+BigInt(r.amountCents),0n).toString(),
   qualification:"Pré-classificação gerencial para revisão do contador. Não gera lançamentos fiscais nem transmissão a ERP externo.",rows});
}

export const GET=withMonitoring("/api/controle/contabilidade",GETHandler);
