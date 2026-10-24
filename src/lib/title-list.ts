import {Prisma,type PrismaClient,type TitleKind} from "@prisma/client";
import {z} from "zod";
import type {SessionUser} from "./auth";
import {titleDTO,titleInclude,titleWhereFor} from "./finance";

export function titleListQuery(params:URLSearchParams){
  return z.object({page:z.coerce.number().int().min(1).max(10000),size:z.coerce.number().int().min(1).max(100),q:z.string().trim().max(100),status:z.enum(["ALL","OPEN","SETTLED","CANCELED"])}).parse({page:params.get("pagina")??1,size:params.get("limite")??25,q:params.get("q")??"",status:params.get("status")??"ALL"});
}
export async function listTitles(db:PrismaClient,user:SessionUser,kind:TitleKind,params:URLSearchParams){
  const query=titleListQuery(params);
  const runtimeUrl=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL||process.env.POSTGRES_URL||process.env.NEON_DATABASE_URL||"";
  const text={contains:query.q,...(/^postgres(?:ql)?:/.test(runtimeUrl)?{mode:"insensitive" as const}:{})};
  const search:Prisma.FinancialTitleWhereInput=query.q?{OR:[{description:text},{producer:{name:text}},{event:{name:text}},...(/^\d{1,16}$/.test(query.q)?[{amountCents:BigInt(query.q)}]:[])]}:{};
  const base:Prisma.FinancialTitleWhereInput={AND:[titleWhereFor(user,kind),search]};
  const where:Prisma.FinancialTitleWhereInput={AND:[base,...(query.status==="ALL"?[]:[{status:query.status}])]};
  return db.$transaction(async tx=>{
    const [count,items,groups]=await Promise.all([
      tx.financialTitle.count({where}),
      tx.financialTitle.findMany({where,include:titleInclude,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(query.page-1)*query.size,take:query.size}),
      tx.financialTitle.groupBy({by:["status"],where:base,_sum:{amountCents:true},_count:{_all:true}})
    ]);
    const get=(status:string)=>groups.find(g=>g.status===status);
    return {items:items.map(t=>titleDTO(t,user.role!=="PRODUCER")),count,page:query.page,size:query.size,pages:Math.max(1,Math.ceil(count/query.size)),summary:{total:groups.reduce((n,g)=>n+g._count._all,0),open:get("OPEN")?._count._all??0,settled:get("SETTLED")?._count._all??0,canceled:get("CANCELED")?._count._all??0,openCents:(get("OPEN")?._sum.amountCents??0n).toString(),settledCents:(get("SETTLED")?._sum.amountCents??0n).toString()}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:15000});
}
