import { Prisma, type PrismaClient } from "@prisma/client";
type Tx=Prisma.TransactionClient;
const reject=(message:string):never=>{throw new Error(`REGRA:${message}`);};
export function financialMonth(month:string){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<1900)return reject("Competência inválida. Use AAAA-MM.");
  const start=new Date(`${month}-01T00:00:00.000Z`),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
  return {start,end};
}
/** All writers and closing operations lock the same bank row before checking the cutoff. */
export async function writableBankDates(tx:Tx,bankAccountId:string,dates:Date[]){
  if(dates.some(d=>!Number.isFinite(d.getTime())))return reject("Data financeira inválida.");
  const locked=await tx.bankAccount.updateMany({where:{id:bankAccountId},data:{id:bankAccountId}});
  if(!locked.count)return reject("Conta bancária inexistente.");
  const closed=await tx.financialClose.findFirst({where:{bankAccountId},orderBy:{endAt:"desc"},select:{endAt:true}});
  if(closed&&dates.some(d=>d<closed.endAt))return reject("Período financeiro fechado. Não altere registros anteriores ao fechamento.");
}
async function internalActor(tx:Tx,id:string,admin=false){
  const actor=await tx.user.findUnique({where:{id}});
  if(!actor?.active||!(admin?actor.role==="ADMIN":["ADMIN","FINANCE_DISK"].includes(actor.role)))return reject("Perfil sem permissão para esta operação financeira.");
}
export async function allocateReconciliation(db:PrismaClient,input:{statementId:string;ledgerEntryId:string;amountCents:bigint;requestKey:string;exact?:boolean},actorId:string){
  if(input.amountCents<=0n||input.amountCents>9999999999999999n||!input.requestKey||input.requestKey.length>150)return reject("Valor ou identificador de conciliação inválido.");
  return db.$transaction(async tx=>{
    await internalActor(tx,actorId);
    const initial=await tx.bankStatementLine.findUnique({where:{id:input.statementId}});
    if(!initial)return reject("Linha de extrato inexistente.");
    // Lock before totals are read. Serializable conflicts are reported as 409 by the API.
    await writableBankDates(tx,initial.bankAccountId,[]);
    const repeated=await tx.reconciliationAllocation.findUnique({where:{requestKey:input.requestKey}});
    if(repeated){
      if(input.exact||repeated.statementId!==input.statementId||repeated.ledgerEntryId!==input.ledgerEntryId||repeated.amountCents!==input.amountCents)return reject("Identificador de conciliação já utilizado ou linha já conciliada.");
      return {id:repeated.id,duplicate:true};
    }
    const statement=await tx.bankStatementLine.findUniqueOrThrow({where:{id:input.statementId},include:{allocations:true}});
    const ledger=await tx.ledgerEntry.findUnique({where:{id:input.ledgerEntryId},include:{allocations:true,statementLine:{select:{id:true}}}});
    if(!ledger||statement.bankAccountId!==ledger.bankAccountId||statement.direction!==ledger.direction||ledger.origin==="OPENING")return reject("Conta ou direção incompatível, ou lançamento de abertura.");
    await writableBankDates(tx,statement.bankAccountId,[statement.postedAt,ledger.createdAt]);
    if(await tx.reconciliationIssue.count({where:{statementId:statement.id,status:"OPEN"}}))return reject("Resolva a divergência desta linha antes de conciliar.");
    const statementUsed=statement.allocations.reduce((n,a)=>n+a.amountCents,0n),ledgerUsed=ledger.allocations.reduce((n,a)=>n+a.amountCents,0n);
    if(statement.status==="MATCHED"||statement.ledgerEntryId||(ledger.statementLine&&ledgerUsed===0n))return reject("Linha já conciliada ou vínculo histórico ainda não migrado.");
    if(input.exact&&(statementUsed>0n||ledgerUsed>0n||statement.amountCents!==ledger.amountCents||input.amountCents!==statement.amountCents))return reject("Conciliação integral exige valores idênticos e sem alocações anteriores.");
    if(input.amountCents>statement.amountCents-statementUsed||input.amountCents>ledger.amountCents-ledgerUsed)return reject("Valor excede o saldo ainda não conciliado do extrato ou do razão.");
    const allocation=await tx.reconciliationAllocation.create({data:{requestKey:input.requestKey,statementId:statement.id,ledgerEntryId:ledger.id,amountCents:input.amountCents,actorId}});
    const matched=statementUsed+input.amountCents===statement.amountCents;
    await tx.bankStatementLine.update({where:{id:statement.id},data:{status:matched?"MATCHED":"PENDING",matchedById:matched?actorId:null,matchedAt:matched?new Date():null,...(input.exact?{ledgerEntryId:ledger.id}:{})}});
    await tx.auditLog.create({data:{actorId,entity:"BankStatementLine",entityId:statement.id,action:"STATEMENT_MATCHED",summary:`Alocação ${allocation.id}: ${input.amountCents} centavos vinculados ao razão ${ledger.id}; sem movimentação bancária.`}});
    return {id:statement.id,status:matched?"MATCHED":"PENDING",allocationId:allocation.id,duplicate:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}
export async function changeReconciliationIssue(db:PrismaClient,input:{statementId:string;reason:string;resolveId?:string},actorId:string){
  if(input.reason.trim().length<5||input.reason.length>300)return reject("Informe uma justificativa de 5 a 300 caracteres.");
  return db.$transaction(async tx=>{
    await internalActor(tx,actorId);
    const statement=await tx.bankStatementLine.findUnique({where:{id:input.statementId}});if(!statement)return reject("Linha inexistente.");
    await writableBankDates(tx,statement.bankAccountId,[statement.postedAt]);
    let id:string;
    if(input.resolveId){
      const updated=await tx.reconciliationIssue.updateMany({where:{id:input.resolveId,statementId:statement.id,status:"OPEN"},data:{status:"RESOLVED",resolution:input.reason.trim(),resolvedById:actorId,resolvedAt:new Date()}});
      if(!updated.count)return reject("Divergência inexistente ou já resolvida.");id=input.resolveId;
    }else{
      if(await tx.reconciliationIssue.count({where:{statementId:statement.id,status:"OPEN"}}))return reject("Já existe divergência aberta para esta linha.");
      id=(await tx.reconciliationIssue.create({data:{statementId:statement.id,reason:input.reason.trim(),actorId}})).id;
    }
    await tx.auditLog.create({data:{actorId,entity:"ReconciliationIssue",entityId:id,action:input.resolveId?"RECONCILIATION_ISSUE_RESOLVED":"RECONCILIATION_ISSUE_OPENED",summary:input.reason.trim()}});
    return {id};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
async function netBalance(tx:Tx,bankAccountId:string,before?:Date){
  const rows=await tx.ledgerEntry.groupBy({by:["direction"],where:{bankAccountId,...(before?{createdAt:{lt:before}}:{})},_sum:{amountCents:true}});
  return rows.reduce((n,r)=>n+(r.direction==="CREDIT"?1n:-1n)*(r._sum.amountCents??0n),0n);
}
export async function financialCloseSummary(tx:Tx,bankAccountId:string,month:string){
  const {start,end}=financialMonth(month);
  const [statements,ledger,opening,closing,current,account]=await Promise.all([
    tx.bankStatementLine.findMany({where:{bankAccountId,postedAt:{gte:start,lt:end}},include:{allocations:{select:{amountCents:true}},issues:{where:{status:"OPEN"},select:{id:true}}}}),
    tx.ledgerEntry.findMany({where:{bankAccountId,createdAt:{gte:start,lt:end}},include:{allocations:{select:{amountCents:true}}}}),
    netBalance(tx,bankAccountId,start),netBalance(tx,bankAccountId,end),netBalance(tx,bankAccountId),tx.bankAccount.findUnique({where:{id:bankAccountId}})
  ]);
  if(!account)return reject("Conta inexistente.");
  const statementsPending=statements.filter(s=>s.amountCents!==s.allocations.reduce((n,a)=>n+a.amountCents,0n)).length;
  const ledgerPending=ledger.filter(l=>l.origin!=="OPENING"&&l.amountCents!==l.allocations.reduce((n,a)=>n+a.amountCents,0n)).length;
  return {month,end,opening,closing,credit:ledger.filter(l=>l.direction==="CREDIT").reduce((n,l)=>n+l.amountCents,0n),debit:ledger.filter(l=>l.direction==="DEBIT").reduce((n,l)=>n+l.amountCents,0n),statementsPending,ledgerPending,issuesOpen:statements.reduce((n,s)=>n+s.issues.length,0),bankLedgerBalanced:current===account.balanceCents};
}
export async function closeFinancialMonth(db:PrismaClient,bankAccountId:string,month:string,declaredBalance:bigint,actorId:string){
  if(declaredBalance < -9999999999999999n || declaredBalance>9999999999999999n)return reject("Saldo informado fora do limite financeiro.");
  const {start,end}=financialMonth(month);
  if(end>new Date())return reject("Aguarde o término do mês para fechar a competência (UTC).");
  return db.$transaction(async tx=>{
    await internalActor(tx,actorId,true);await writableBankDates(tx,bankAccountId,[start]);
    const summary=await financialCloseSummary(tx,bankAccountId,month);
    if(summary.statementsPending||summary.ledgerPending||summary.issuesOpen)return reject("Há extratos, lançamentos ou divergências pendentes nesta competência.");
    if(!summary.bankLedgerBalanced)return reject("Saldo bancário cadastrado diverge do razão. Revise a origem antes de fechar.");
    if(summary.closing!==declaredBalance)return reject("Saldo final informado diverge do saldo do razão no fim do período.");
    const closed=await tx.financialClose.create({data:{bankAccountId,month,endAt:end,openingBalanceCents:summary.opening,closingBalanceCents:summary.closing,declaredBalanceCents:declaredBalance,creditCents:summary.credit,debitCents:summary.debit,actorId}});
    await tx.auditLog.create({data:{actorId,entity:"FinancialClose",entityId:closed.id,action:"FINANCIAL_MONTH_CLOSED",summary:`Conta ${bankAccountId}: competência ${month} fechada; saldo ${declaredBalance} centavos.`}});
    return {id:closed.id,month};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}
