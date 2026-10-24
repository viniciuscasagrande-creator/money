import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { authorize, fail } from "@/lib/auth";
import { hasCapability } from "@/lib/governance";
import { reportData } from "@/lib/report-service";
import { encodeReportCsv } from "@/lib/report-math";
import { apiCatch } from "@/lib/validation";
export const runtime="nodejs";
async function GETHandler(request:NextRequest) {
 const {user,error}=await authorize(request);if(error||!user)return error!;
 if(!await hasCapability(user,"REPORT_VIEW"))return fail("Acesso negado à central de relatórios.",403);
 const q=request.nextUrl.searchParams;
 const start=q.get("inicio")??"",end=q.get("fim")??"";
 const group=q.get("agrupar")??"EVENT";
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||!["EVENT","PRODUCER","MONTH"].includes(group))return fail("Informe período e agrupamento válidos.");
 const a=new Date(`${start}T00:00:00.000Z`),b=new Date(`${end}T00:00:00.000Z`);
 if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||a.toISOString().slice(0,10)!==start||b.toISOString().slice(0,10)!==end||b<a||b.getTime()-a.getTime()>366*86400000)
  return fail("Período inválido ou superior a 366 dias.");
 const producerId=user.role==="PRODUCER"?user.producerId!:(q.get("produtorId")||undefined);
 try {
  const result=await reportData(user,{start,end,producerId,eventId:q.get("eventoId")||undefined,group:group as "EVENT"|"PRODUCER"|"MONTH"});
  if(q.get("formato")==="csv"){
   const internal=user.role!=="PRODUCER";
   const headings=["Agrupamento","Vendas","Venda bruta (centavos)","Direitos produtor (centavos)","Direitos liquidados (centavos)","Repasses efetuados (centavos)","Repasses pendentes (centavos)",...(internal?["Receita Disk (centavos)","MDR (centavos)"]:[])];
   const rows=result.rows.map(r=>[r.label,r.quantity,r.grossCents,r.producerCents,r.settledCents,r.paidCents,r.committedCents,...(internal?[r.diskCents!,r.mdrCents!]:[])]);
   return new NextResponse(encodeReportCsv([headings,...rows]),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=relatorio-financeiro.csv","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"}});
  }
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store, private"}});
 }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}

export const GET=withMonitoring("/api/inteligencia/relatorios",GETHandler);
