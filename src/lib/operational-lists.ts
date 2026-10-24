import {Prisma, type PrismaClient} from "@prisma/client";
import {z} from "zod";
import type {SessionUser} from "./auth";
import {payoutDTO} from "./operations";

export const saleStatuses=["ALL","AWAITING_SETTLEMENT","SETTLED"] as const;
export const payoutStatuses=["ALL","REQUESTED","APPROVED","REJECTED","PRODUCER_ACCEPTED","READY_TO_SETTLE","SETTLED"] as const;
export const transferStatuses=["ALL","REQUESTED","APPROVED","PRODUCER_ACCEPTED","EXECUTED","REJECTED","REVERSED"] as const;
export function operationalListQuery<T extends readonly [string,...string[]]>(params:URLSearchParams,statuses:T){
  return z.object({page:z.coerce.number().int().min(1).max(10000),size:z.coerce.number().int().min(1).max(100),q:z.string().trim().max(100),status:z.enum(statuses)})
    .parse({page:params.get("pagina")??1,size:params.get("limite")??25,q:params.get("q")??"",status:params.get("status")??"ALL"});
}
function textSearch(q:string){
  const url=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL||process.env.POSTGRES_URL||process.env.NEON_DATABASE_URL||"";
  return {contains:q,...(/^postgres(?:ql)?:/.test(url)?{mode:"insensitive" as const}:{})};
}
function scope(user:SessionUser){
  if(user.role!=="PRODUCER")return {};
  // A producer without a linked identity must never fall back to an unrestricted query.
  if(!user.producerId)throw new Error("Produtor sem vínculo.");
  return {producerId:user.producerId};
}
const options={isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:15000};
function pagination(count:number,query:{page:number;size:number}){
  const pages=Math.max(1,Math.ceil(count/query.size)),page=Math.min(query.page,pages);
  return {count,page,size:query.size,pages};
}
export async function listSales(db:PrismaClient,user:SessionUser,params:URLSearchParams){
  if(user.role!=="ADMIN"&&user.role!=="FINANCE_DISK")throw new Error("Acesso restrito.");
  const query=operationalListQuery(params,saleStatuses),text=textSearch(query.q);
  const where:Prisma.FinancialSaleWhereInput={AND:[query.q?{OR:[{externalReference:text},{event:{name:text}},{producer:{name:text}},{gateway:{name:text}},{brand:{name:text}}]}:{},query.status==="ALL"?{}:{status:query.status}]};
  return db.$transaction(async tx=>{
    const count=await tx.financialSale.count({where}),meta=pagination(count,query);
    const [items,totals,settled]=await Promise.all([
      tx.financialSale.findMany({where,include:{event:{select:{name:true}},producer:{select:{name:true}},gateway:{select:{name:true}},brand:{select:{name:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(meta.page-1)*meta.size,take:meta.size}),
      tx.financialSale.aggregate({where,_sum:{quantity:true,grossCents:true,netSettlementCents:true,mdrCents:true,producerNetCents:true,diskNetCents:true}}),
      tx.financialSale.count({where:{AND:[where,{status:"SETTLED"}]}})
    ]);
    const s=totals._sum;
    return {...meta,summary:{total:count,quantity:s.quantity??0,settled,grossCents:(s.grossCents??0n).toString(),netSettlementCents:(s.netSettlementCents??0n).toString(),mdrCents:(s.mdrCents??0n).toString(),producerNetCents:(s.producerNetCents??0n).toString(),diskNetCents:(s.diskNetCents??0n).toString()},items:items.map(s=>({id:s.id,reference:s.externalReference,eventName:s.event.name,producerName:s.producer.name,gatewayName:s.gateway.name,brandName:s.brand.name,status:s.status,quantity:s.quantity,grossCents:s.grossCents.toString(),feeModeAtSale:s.feeModeAtSale,feeValueAtSale:s.feeValueAtSale.toString(),producerPaysMdrAtSale:s.producerPaysMdrAtSale,mdrRateBpsAtSale:s.mdrRateBpsAtSale,mdrFixedCentsAtSale:s.mdrFixedCentsAtSale.toString(),feeCents:s.feeCents.toString(),mdrCents:s.mdrCents.toString(),producerNetCents:s.producerNetCents.toString(),diskNetCents:s.diskNetCents.toString(),netSettlementCents:s.netSettlementCents.toString(),createdAt:s.createdAt.toISOString(),receivableTitleId:s.receivableTitleId}))};
  },options);
}
export async function listPayouts(db:PrismaClient,user:SessionUser,params:URLSearchParams){
  const query=operationalListQuery(params,payoutStatuses),text=textSearch(query.q);
  const where:Prisma.PayoutRequestWhereInput={AND:[scope(user),query.q?{OR:[{event:{name:text}},{producer:{name:text}},...(/^\d{1,16}$/.test(query.q)?[{amountCents:BigInt(query.q)}]:[])]}:{},query.status==="ALL"?{}:{status:query.status}]};
  return db.$transaction(async tx=>{
    const count=await tx.payoutRequest.count({where}),meta=pagination(count,query);
    const [items,total]=await Promise.all([
      tx.payoutRequest.findMany({where,include:{producer:{select:{name:true}},event:{select:{name:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(meta.page-1)*meta.size,take:meta.size}),
      tx.payoutRequest.aggregate({where,_sum:{amountCents:true}})
    ]);
    return {...meta,summary:{amountCents:(total._sum.amountCents??0n).toString()},items:items.map(p=>payoutDTO(p,user.role!=="PRODUCER"))};
  },options);
}
export async function listTransfers(db:PrismaClient,user:SessionUser,params:URLSearchParams){
  const query=operationalListQuery(params,transferStatuses),text=textSearch(query.q);
  const where:Prisma.EventTransferWhereInput={AND:[scope(user),query.q?{OR:[{originEvent:{name:text}},{destinationEvent:{name:text}},{reason:text},...(/^\d{1,16}$/.test(query.q)?[{amountCents:BigInt(query.q)}]:[])]}:{},query.status==="ALL"?{}:{status:query.status}]};
  return db.$transaction(async tx=>{
    const count=await tx.eventTransfer.count({where}),meta=pagination(count,query);
    const [items,groups]=await Promise.all([
      tx.eventTransfer.findMany({where,include:{originEvent:{select:{name:true}},destinationEvent:{select:{name:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(meta.page-1)*meta.size,take:meta.size}),
      tx.eventTransfer.groupBy({by:["status"],where,_count:{_all:true},_sum:{amountCents:true}})
    ]);
    const pending=groups.filter(g=>["REQUESTED","APPROVED","PRODUCER_ACCEPTED"].includes(g.status)),executed=groups.find(g=>g.status==="EXECUTED");
    return {...meta,summary:{pendingCount:pending.reduce((n,g)=>n+g._count._all,0),pendingCents:pending.reduce((n,g)=>n+(g._sum.amountCents??0n),0n).toString(),executedCount:executed?._count._all??0,executedCents:(executed?._sum.amountCents??0n).toString()},items:items.map(x=>({id:x.id,origin:x.originEvent.name,destination:x.destinationEvent.name,status:x.status,amountCents:x.amountCents.toString(),reason:x.reason}))};
  },options);
}
