import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { summarizeFinancials, totals, type ReportGroup } from "@/lib/report-math";

type Filters={start:string;end:string;producerId?:string;eventId?:string;group:"EVENT"|"PRODUCER"|"MONTH"};
const mapMetrics=(r:ReportGroup,internal:boolean)=>({
  key:r.key,quantity:r.quantity,grossCents:r.grossCents.toString(), producerCents:r.producerCents.toString(),
  settledCents:r.settledCents.toString(), paidCents:r.paidCents.toString(),committedCents:r.committedCents.toString(),
  ...(internal?{diskCents:r.diskCents.toString(),mdrCents:r.mdrCents.toString()}:{})
});
export async function reportData(user:SessionUser,filter:Filters){
 const internal=user.role!=="PRODUCER";
 const period={gte:new Date(`${filter.start}T00:00:00.000Z`),lte:new Date(`${filter.end}T23:59:59.999Z`)};
 const producers=user.role==="PRODUCER"?user.producerId!:filter.producerId;
 const eventWhere={...(producers?{producerId:producers}:{}),...(filter.eventId?{eventId:filter.eventId}:{})};
 if(filter.eventId){const exists=await prisma.event.findFirst({where:{id:filter.eventId,...(producers?{producerId:producers}:{})},select:{id:true}});
  if(!exists)throw new Error("REGRA:Evento não encontrado no escopo autorizado.");}
 const [sales,payouts,events,producerNames]=await Promise.all([
  prisma.financialSale.findMany({where:{...eventWhere,createdAt:period},orderBy:{createdAt:"asc"},take:5001,select:{producerId:true,eventId:true,createdAt:true,grossCents:true,feeCents:true,mdrCents:true,producerNetCents:true,diskNetCents:true,status:true}}),
  prisma.payoutRequest.findMany({where:{...eventWhere,createdAt:period},take:5001,select:{producerId:true,eventId:true,type:true,status:true,amountCents:true,createdAt:true}}),
  prisma.event.findMany({where:{...(producers?{producerId:producers}:{}),...(filter.eventId?{id:filter.eventId}:{})},select:{id:true,name:true,producerId:true},take:1001}),
  prisma.producer.findMany({where:producers?{id:producers}:{},select:{id:true,name:true},take:1001})
 ]);
 if(sales.length>5000||payouts.length>5000||events.length>1000||producerNames.length>1000)
   throw new Error("REGRA:Volume acima do limite de 5.000 registros por coleção. Reduza o período ou os filtros.");
 const eventMap=new Map(events.map(e=>[e.id,e.name]));const producerMap=new Map(producerNames.map(e=>[e.id,e.name]));
 const groups=summarizeFinancials(sales,payouts,filter.group);
 const rows=groups.map(g=>({...mapMetrics(g,internal),label:filter.group==="MONTH"?g.key:filter.group==="EVENT"?eventMap.get(g.key)??"Evento":producerMap.get(g.key)??"Produtor"}));
 return {filters:filter,group:filter.group,rows,total:mapMetrics(totals(groups),internal),
  note: "Período pelo registro da venda/solicitação (UTC), não pela liquidação. Posições históricas são calculadas com o status atual dos registros; não constituem fechamento contábil.",
  informationalOnly:!internal};
}
