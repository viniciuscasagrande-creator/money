/** Cálculos puros dos dashboards: BigInt centavos; nunca usar Number para somar dinheiro. */
export type ReportSale = { producerId: string; eventId: string; createdAt: Date; grossCents: bigint; feeCents: bigint; mdrCents: bigint; producerNetCents: bigint; diskNetCents: bigint; status: string };
export type ReportPayout = { producerId: string; eventId: string; type: string; status: string; amountCents: bigint; createdAt:Date };
export type ReportGroup = { key:string; quantity:number; grossCents:bigint; producerCents:bigint; diskCents:bigint; mdrCents:bigint; settledCents:bigint; paidCents:bigint; committedCents:bigint };
const fresh=(key:string):ReportGroup=>({key,quantity:0,grossCents:0n,producerCents:0n,diskCents:0n,mdrCents:0n,settledCents:0n,paidCents:0n,committedCents:0n});
export function summarizeFinancials(sales:ReportSale[], payouts:ReportPayout[], grouping:"EVENT"|"PRODUCER"|"MONTH") {
 const map=new Map<string,ReportGroup>();
 const groupFor=(s:ReportSale)=>grouping==="MONTH"?s.createdAt.toISOString().slice(0,7): grouping==="EVENT"?s.eventId:s.producerId;
 for(const s of sales){const key=groupFor(s);const row=map.get(key)??fresh(key);row.quantity++;row.grossCents+=s.grossCents;
  row.producerCents+=s.producerNetCents;row.diskCents+=s.diskNetCents;row.mdrCents+=s.mdrCents;
  if(s.status==="SETTLED")row.settledCents+=s.producerNetCents;map.set(key,row);
 }
 for(const p of payouts){const key=grouping==="MONTH"?p.createdAt.toISOString().slice(0,7):grouping==="EVENT"?p.eventId:p.producerId;const row=map.get(key)??fresh(key);
  if(p.status==="SETTLED")row.paidCents+=p.amountCents;
  if(["REQUESTED","APPROVED","PRODUCER_ACCEPTED","READY_TO_SETTLE"].includes(p.status))row.committedCents+=p.amountCents;
  map.set(key,row);
 }
 return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
}
export function totals(groups:ReportGroup[]) {return groups.reduce((a,b)=>({
  key:"TOTAL",quantity:a.quantity+b.quantity,grossCents:a.grossCents+b.grossCents,
  producerCents:a.producerCents+b.producerCents,diskCents:a.diskCents+b.diskCents,
  mdrCents:a.mdrCents+b.mdrCents,settledCents:a.settledCents+b.settledCents,
  paidCents:a.paidCents+b.paidCents,committedCents:a.committedCents+b.committedCents
 }),fresh("TOTAL"));}
export function safeCsv(value:string|number|bigint) {
 const s=String(value);
 // Evita execução de fórmulas em Excel, inclusive com tabs/espaços antes do sinal.
 const sanitized=/^[\s]*[=+\-@]/.test(s)?`'${s}`:s;
 return `"${sanitized.replaceAll('"','""')}"`;
}
export function encodeReportCsv(rows:(string|number|bigint)[][]) {
 return "\uFEFF"+rows.map(row=>row.map(safeCsv).join(";")).join("\r\n")+"\r\n";
}
