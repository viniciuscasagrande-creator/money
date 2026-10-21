import {Prisma,type PrismaClient} from "@prisma/client";
import {financialMonth} from "@/lib/financial-close";
export async function accountingReport(db:PrismaClient,view:"balancete"|"dre"|"passivos",month:string){
  const {start,end}=financialMonth(month);
  return db.$transaction(async tx=>{
    const by=view==="passivos"?["accountId","eventId","producerId"] as const:["accountId"] as const;
    const filter=view==="passivos"?{account:{type:"LIABILITY"}}:{};
    const [opening,movement]=await Promise.all([
      tx.accountingPosting.groupBy({by:[...by],where:{...filter,journal:{occurredAt:{lt:start}}},_sum:{debitCents:true,creditCents:true}}),
      tx.accountingPosting.groupBy({by:[...by],where:{...filter,journal:{occurredAt:{gte:start,lt:end}}},_sum:{debitCents:true,creditCents:true}})
    ]);
    const accounts=await tx.accountingAccount.findMany({where:{id:{in:[...new Set([...opening,...movement].map(r=>r.accountId))]}}});
    const accountMap=new Map(accounts.map(a=>[a.id,a]));
    const totals=new Map<string,{accountId:string;eventId:string|null;producerId:string|null;opening:bigint;debit:bigint;credit:bigint}>();
    for(const [isOpening,rows] of [[true,opening],[false,movement]] as const)for(const r of rows){
      const key=JSON.stringify([r.accountId,view==="passivos"?r.eventId:null,view==="passivos"?r.producerId:null]);
      const item=totals.get(key)??{accountId:r.accountId,eventId:view==="passivos"?r.eventId:null,producerId:view==="passivos"?r.producerId:null,opening:0n,debit:0n,credit:0n};
      if(isOpening)item.opening+=(r._sum.debitCents??0n)-(r._sum.creditCents??0n);else{item.debit+=r._sum.debitCents??0n;item.credit+=r._sum.creditCents??0n;}totals.set(key,item);
    }
    const rows=[...totals.values()].map(t=>({...t,account:accountMap.get(t.accountId)!})).sort((a,b)=>a.account.code.localeCompare(b.account.code)||String(a.eventId).localeCompare(String(b.eventId))||String(a.producerId).localeCompare(String(b.producerId)));
    if(view==="dre"){
      let revenue=0n,deductions=0n,expenses=0n;
      for(const row of rows){if(row.account.type==="REVENUE")revenue+=row.credit-row.debit;if(row.account.type==="DEDUCTION")deductions+=row.debit-row.credit;if(row.account.type==="EXPENSE")expenses+=row.debit-row.credit;}
      return {period:month,basis:"PERIOD_MOVEMENT",items:[{linha:"1. Receita operacional bruta",valorCents:revenue.toString()},{linha:"2. (-) Deduções",valorCents:(-deductions).toString()},{linha:"3. Receita líquida",valorCents:(revenue-deductions).toString()},{linha:"4. (-) Despesas",valorCents:(-expenses).toString()},{linha:"5. Resultado do período",valorCents:(revenue-deductions-expenses).toString()}],receitaBrutaCents:revenue.toString(),deducoesCents:deductions.toString(),receitaLiquidaCents:(revenue-deductions).toString(),despesasCents:expenses.toString(),resultadoCents:(revenue-deductions-expenses).toString()};
    }
    if(view==="passivos")return {period:month,basis:"CUMULATIVE_CLOSING",items:rows.map(r=>({accountId:r.accountId,eventId:r.eventId??"CONSOLIDADO",producerId:r.producerId,accountCode:r.account.code,accountName:r.account.name,saldoInicialCredorCents:(-r.opening).toString(),debitCents:r.debit.toString(),creditCents:r.credit.toString(),movimentoCredorCents:(r.credit-r.debit).toString(),saldoCredorCents:(-r.opening+r.credit-r.debit).toString()}))};
    const debit=rows.reduce((n,r)=>n+r.debit,0n),credit=rows.reduce((n,r)=>n+r.credit,0n),initial=rows.reduce((n,r)=>n+r.opening,0n);
    return {period:month,basis:"OPENING_MOVEMENT_CLOSING",items:rows.map(r=>({accountId:r.accountId,code:r.account.code,name:r.account.name,type:r.account.type,saldoInicialDevedorCents:r.opening.toString(),debitCents:r.debit.toString(),creditCents:r.credit.toString(),movimentoDevedorCents:(r.debit-r.credit).toString(),saldoDevedorCents:(r.opening+r.debit-r.credit).toString()})),totalDebitsCents:debit.toString(),totalCreditsCents:credit.toString(),balanced:debit===credit,openingBalanced:initial===0n,closingBalanced:initial+debit-credit===0n};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}
