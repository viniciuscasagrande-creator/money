import { Prisma, type RiskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCents } from "@/lib/money";
import { allocateReconciliation,writableBankDates } from "@/lib/financial-close";
import { eventAvailability } from "@/lib/operations";
import { isoDate } from "@/lib/validation";
import type { SessionUser } from "@/lib/auth";

const reject = (message: string): never => { throw new Error(`REGRA:${message}`); };
export async function importStatement(input: { bankAccountId: string; externalId: string; date: string; description: string;
  direction: "CREDIT"|"DEBIT"; amountCents:string }, user: SessionUser) {
  return prisma.$transaction(async tx => {
    await writableBankDates(tx,input.bankAccountId,[isoDate(input.date)!]);
    const account = await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, active: true } });
    if (!account) return reject("Conta bancária não encontrada ou inativa.");
    const row = await tx.bankStatementLine.create({ data: {
      bankAccountId: account.id, externalId: input.externalId, postedAt: isoDate(input.date)!,
      description: input.description, direction: input.direction, amountCents: parseCents(input.amountCents)
    } });
    await tx.auditLog.create({ data: { actorId:user.id, action:"STATEMENT_IMPORTED", entity:"BankStatementLine", entityId:row.id,
      summary:"Linha de extrato externo importada para conferência. Nenhum saldo foi alterado." } });
    return row.id;
  });
}
export async function reconcileStatement(statementId: string, ledgerEntryId: string, user: SessionUser) {
  const statement=await prisma.bankStatementLine.findUnique({where:{id:statementId}});
  if(!statement)return reject("Extrato inexistente.");
  return allocateReconciliation(prisma,{statementId,ledgerEntryId,amountCents:statement.amountCents,requestKey:`exact:${statementId}:${ledgerEntryId}`,exact:true},user.id);
}
export async function registerRisk(input: {saleId:string;externalId:string;type:"REFUND"|"CHARGEBACK";
  exposureCents:string;reason:string},user:SessionUser) {
  return prisma.$transaction(async tx => {
    const sale = await tx.financialSale.findUnique({where:{id:input.saleId}});
    if (!sale) return reject("Venda não encontrada.");
    const amount = parseCents(input.exposureCents);
    const cases = await tx.riskCase.aggregate({where:{saleId:sale.id,status:{in:["OPEN","CONFIRMED"]}},_sum:{exposureCents:true}});
    if (amount + (cases._sum.exposureCents??0n) > sale.producerNetCents) return reject("Exposição excede o direito da venda.");
    const capacity = await eventAvailability(tx, sale.eventId);
    if (amount > capacity.antecipacaoCents) return reject("Evento sem capacidade livre para reservar esse risco. Encaminhe para tratamento manual.");
    const row = await tx.riskCase.create({data:{...input,exposureCents:amount, eventId:sale.eventId,producerId:sale.producerId,createdById:user.id}});
    await tx.auditLog.create({data:{actorId:user.id,entity:"RiskCase",entityId:row.id,action:"RISK_OPENED",
      summary:`Exposição cautelar registrada no evento; tipo ${input.type}. Nenhum estorno bancário foi iniciado.`}});
    return row.id;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
export async function decideRisk(id:string,decision:Extract<RiskStatus,"CONFIRMED"|"REJECTED">,user:SessionUser){
  return prisma.$transaction(async tx=>{
    const row = await tx.riskCase.findUnique({where:{id}});
    if (!row || row.status !== "OPEN") return reject("Ocorrência não encontrada ou já decidida.");
    const claimed = await tx.riskCase.updateMany({where:{id,status:"OPEN"},data:{status:decision,decidedAt:new Date()}});
    if(claimed.count!==1)return reject("Ocorrência alterada por outra sessão.");
    await tx.auditLog.create({data:{actorId:user.id,entity:"RiskCase",entityId:id,action:`RISK_${decision}`,
      summary:decision==="CONFIRMED"?"Perda confirmada e abatida do direito do produtor; sem execução bancária.":"Exposição reprovada e reserva liberada."}});
    return {id,status:decision};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
