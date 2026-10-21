import {Prisma,type PrismaClient} from "@prisma/client";
import {validatePostings} from "@/lib/accounting-core";
import {lockAccountingPeriod} from "@/lib/accounting-integration";
export async function closeAccountingPeriod(db:PrismaClient,periodId:string,actorId:string){
 return db.$transaction(async tx=>{
  const actor=await tx.user.findUnique({where:{id:actorId}});if(!actor?.active||actor.role!=="ADMIN")throw new Error("REGRA:Somente Administrador pode fechar a contabilidade.");
  const initial=await tx.accountingPeriod.findUnique({where:{id:periodId}});if(!initial)throw new Error("REGRA:Período inexistente.");
  await lockAccountingPeriod(tx,initial.name);
  const period=await tx.accountingPeriod.findUnique({where:{id:periodId}});if(!period||period.status!=="OPEN")throw new Error("REGRA:Período inexistente ou já fechado.");
  const locked=await tx.accountingPeriod.updateMany({where:{id:period.id,status:"OPEN"},data:{status:"OPEN"}});if(!locked.count)throw new Error("REGRA:Fechamento concorrente.");
  const pending=await tx.accountingBusinessEvent.count({where:{occurredAt:{gte:period.startAt,lt:period.endAt},OR:[{status:{not:"POSTED"}},{journal:{is:null}}]}});
  if(pending)throw new Error("REGRA:Há eventos de negócio não processados ou inconsistentes neste período.");
  const journals=await tx.accountingJournal.findMany({where:{periodId:period.id},include:{postings:true,businessEvent:true}});
  for(const journal of journals){
   if(journal.occurredAt<period.startAt||journal.occurredAt>=period.endAt||journal.businessEvent.status!=="POSTED"||journal.occurredAt.getTime()!==journal.businessEvent.occurredAt.getTime())throw new Error("REGRA:Lançamento incompatível com a competência ou evento de origem.");
   let totals:ReturnType<typeof validatePostings>;try{totals=validatePostings(journal.postings);}catch(e){throw new Error(`REGRA:${e instanceof Error?e.message:"Partidas inválidas."}`);}if(totals.debit!==journal.businessEvent.amountCents)throw new Error("REGRA:Lançamento diverge do valor do fato de origem.");
  }
  const done=await tx.accountingPeriod.update({where:{id:period.id},data:{status:"CLOSED"}});
  await tx.auditLog.create({data:{actorId,action:"ACCOUNTING_PERIOD_CLOSED",entity:"AccountingPeriod",entityId:period.id,summary:`Competência ${period.name} fechada após conferir ${journals.length} lançamentos e seus fatos.`}});
  return {id:done.id,status:done.status};
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}
