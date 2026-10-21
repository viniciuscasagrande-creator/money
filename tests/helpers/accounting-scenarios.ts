import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type {PrismaClient} from "@prisma/client";
import {postAccounting,previewAccounting,changeAccountingRule} from "../../src/lib/accounting-posting";
import {accountingReport} from "../../src/lib/accounting-reports";
import {storeAccountingBusinessEvent} from "../../src/lib/accounting-integration";
import {closeAccountingPeriod} from "../../src/lib/accounting-close";
export async function accountingRegressions(db:PrismaClient,adminId:string,financeId:string){
 const bankBefore=await db.bankAccount.findMany({select:{id:true,balanceCents:true},orderBy:{id:"asc"}}),ledgerBefore=await db.ledgerEntry.count();
 const make=(code:string,type:string)=>db.accountingAccount.create({data:{code,name:`Conta teste ${code}`,type}});
 const asset=await make("9.91.1","ASSET"),liability=await make("9.91.2","LIABILITY"),revenue=await make("9.91.3","REVENUE"),deduction=await make("9.91.4","DEDUCTION"),expense=await make("3.2.991","EXPENSE"),assetTrap=await make("3.10.991","ASSET");
 const periods=[];
 for(const month of ["2002-01","2002-02"]){const startAt=new Date(`${month}-01T00:00:00Z`),endAt=new Date(startAt);endAt.setUTCMonth(endAt.getUTCMonth()+1);periods.push(await db.accountingPeriod.create({data:{name:month,startAt,endAt}}));}
 const rule=await db.accountingRule.create({data:{eventType:"PACKAGE_FIVE_TEST",version:1,debitAccountId:asset.id,creditAccountId:liability.id,validFrom:new Date("2000-01-01")}});
 await changeAccountingRule(db,rule.id,true,adminId);
 const event=async(month:string,amountCents:bigint)=>db.$transaction(tx=>storeAccountingBusinessEvent({externalKey:`pkg5-${randomUUID()}`,type:"PACKAGE_FIVE_TEST",source:"FINANCE",sourceId:"manual-reviewed-test",amountCents,occurredAt:new Date(`${month}-10T12:00:00Z`)},tx));
 const january=await event("2002-01",1000n),input={businessEventId:january.id,ruleId:rule.id};
 const first=await previewAccounting(db,input);assert.equal(await db.accountingJournal.count({where:{businessEventId:january.id}}),0);
 await db.accountingAccount.update({where:{id:asset.id},data:{name:"Conta revisada antes da confirmação"}});
 await assert.rejects(postAccounting(db,{...input,previewHash:first.previewHash},adminId),/prévia mudou/);
 const preview=await previewAccounting(db,input);
 await assert.rejects(postAccounting(db,{...input,previewHash:preview.previewHash},financeId),/Administrador/);
 const posted=await postAccounting(db,{...input,previewHash:preview.previewHash},adminId);
 assert.equal((await postAccounting(db,input,adminId)).journalId,posted.journalId);
 const saved=await db.accountingJournal.findUniqueOrThrow({where:{id:posted.journalId}});assert.equal(saved.ruleId,rule.id);assert.equal(saved.postedById,adminId);assert.ok(saved.ruleSnapshotJson?.includes("Conta revisada antes da confirmação"));
 await db.accountingAccount.update({where:{id:asset.id},data:{name:"Nome posterior à contabilização"}});
 assert.equal((await db.accountingJournal.findUniqueOrThrow({where:{id:saved.id}})).ruleSnapshotJson,saved.ruleSnapshotJson);
 const original=await db.accountingBusinessEvent.findUniqueOrThrow({where:{id:january.id}});
 const repeated={externalKey:original.externalKey,type:original.type,source:"FINANCE" as const,sourceId:original.sourceId,amountCents:original.amountCents,occurredAt:original.occurredAt};
 assert.equal((await db.$transaction(tx=>storeAccountingBusinessEvent(repeated,tx))).duplicate,true);
 await assert.rejects(db.$transaction(tx=>storeAccountingBusinessEvent({...repeated,amountCents:1001n},tx)),/outro conteúdo/);
 const february=await event("2002-02",400n);
 await postAccounting(db,{businessEventId:february.id,ruleId:rule.id,customPostings:[{accountId:liability.id,debitCents:"400",creditCents:"0"},{accountId:asset.id,debitCents:"0",creditCents:"400"}]},adminId);
 const sale=await event("2002-02",300n);
 await postAccounting(db,{businessEventId:sale.id,ruleId:rule.id,customPostings:[{accountId:assetTrap.id,debitCents:"300",creditCents:"0"},{accountId:revenue.id,debitCents:"0",creditCents:"300"}]},adminId);
 const costs=await event("2002-02",70n);
 const costInput={businessEventId:costs.id,ruleId:rule.id,customPostings:[{accountId:expense.id,debitCents:"50",creditCents:"0"},{accountId:deduction.id,debitCents:"20",creditCents:"0"},{accountId:asset.id,debitCents:"0",creditCents:"70"}]};
 const race=await Promise.allSettled([postAccounting(db,costInput,adminId),postAccounting(db,costInput,adminId)]);
 assert.ok(race.some(r=>r.status==="fulfilled"));assert.equal(await db.accountingJournal.count({where:{businessEventId:costs.id}}),1);
 const trial=await accountingReport(db,"balancete","2002-02");assert.ok("balanced" in trial&&trial.balanced&&trial.openingBalanced&&trial.closingBalanced);
 const liabilities=await accountingReport(db,"passivos","2002-02");
 assert.ok("basis" in liabilities);const liabilityRow=liabilities.items.find((r:Record<string,unknown>)=>r.accountId===liability.id) as Record<string,unknown>;assert.equal(liabilityRow.saldoInicialCredorCents,"1000");assert.equal(liabilityRow.saldoCredorCents,"600");
 const dre=await accountingReport(db,"dre","2002-02");assert.ok("resultadoCents" in dre);assert.equal(dre.receitaBrutaCents,"300");assert.equal(dre.deducoesCents,"20");assert.equal(dre.despesasCents,"50");assert.equal(dre.resultadoCents,"230");
 const march=await accountingReport(db,"passivos","2002-03");assert.equal((march.items.find((r:Record<string,unknown>)=>r.accountId===liability.id) as Record<string,unknown>).saldoCredorCents,"600");
 const actualSale=await db.accountingBusinessEvent.findFirst({where:{type:"TICKET_SALE_CAPTURED",externalKey:{startsWith:"sale:"},status:"PENDING"}});
 if(actualSale){
  const salesRule=await db.accountingRule.create({data:{eventType:"TICKET_SALE_CAPTURED",version:98765,active:true,debitAccountId:asset.id,creditAccountId:liability.id,validFrom:new Date("2000-01-01")}});
  await db.accountingBusinessEvent.update({where:{id:actualSale.id},data:{occurredAt:new Date("2002-02-11T12:00:00Z")}});
  try{
   await assert.rejects(previewAccounting(db,{businessEventId:actualSale.id,ruleId:salesRule.id}),/partidas explícitas/);
   const sourcePreview=await previewAccounting(db,{businessEventId:actualSale.id,ruleId:salesRule.id,customPostings:[{accountId:asset.id,debitCents:actualSale.amountCents.toString(),creditCents:"0"},{accountId:liability.id,debitCents:"0",creditCents:actualSale.amountCents.toString()}]});
   assert.equal(sourcePreview.origin.kind,"SALE");assert.equal(sourcePreview.origin.id,actualSale.sourceId);
   const alternative=await db.event.findFirst({where:{producerId:actualSale.producerId!,id:{not:actualSale.eventId!}}});
   if(alternative)await assert.rejects(previewAccounting(db,{businessEventId:actualSale.id,ruleId:salesRule.id,customPostings:[{accountId:asset.id,debitCents:actualSale.amountCents.toString(),creditCents:"0",eventId:alternative.id},{accountId:liability.id,debitCents:"0",creditCents:actualSale.amountCents.toString()}]}),/evento da operação/);
  }finally{await db.accountingBusinessEvent.update({where:{id:actualSale.id},data:{occurredAt:actualSale.occurredAt}});await db.accountingRule.update({where:{id:salesRule.id},data:{active:false}});}
 }
 const transfer=await db.accountingBusinessEvent.findFirst({where:{type:"INTERNAL_EVENT_TRANSFER_EXECUTED",status:"PENDING"}});
 if(transfer){
  const originalTransfer=await db.eventTransfer.findUniqueOrThrow({where:{id:transfer.sourceId}});
  const transferRule=await db.accountingRule.create({data:{eventType:transfer.type,version:98765,active:true,debitAccountId:asset.id,creditAccountId:liability.id,validFrom:new Date("2000-01-01")}});
  await db.accountingBusinessEvent.update({where:{id:transfer.id},data:{occurredAt:new Date("2002-02-12T12:00:00Z")}});
  try{
   const input={businessEventId:transfer.id,ruleId:transferRule.id,customPostings:[{accountId:asset.id,debitCents:transfer.amountCents.toString(),creditCents:"0",eventId:originalTransfer.originEventId},{accountId:liability.id,debitCents:"0",creditCents:transfer.amountCents.toString(),eventId:originalTransfer.destinationEventId}]};
   await assert.rejects(previewAccounting(db,input),/passivo/);
   const valid={...input,customPostings:input.customPostings.map(p=>({...p,accountId:liability.id}))};
   assert.equal((await previewAccounting(db,valid)).origin.kind,"TRANSFER");
  }finally{await db.accountingBusinessEvent.update({where:{id:transfer.id},data:{occurredAt:transfer.occurredAt}});await db.accountingRule.update({where:{id:transferRule.id},data:{active:false}});}
 }
 const pending=await event("2002-01",17n);await db.accountingBusinessEvent.update({where:{id:pending.id},data:{status:"ERROR"}});
 await assert.rejects(closeAccountingPeriod(db,periods[0].id,adminId),/não processados/);
 await db.accountingBusinessEvent.update({where:{id:pending.id},data:{status:"PENDING"}});await postAccounting(db,{businessEventId:pending.id,ruleId:rule.id},adminId);
 const broken=await db.accountingPosting.create({data:{journalId:saved.id,accountId:asset.id,debitCents:1n}});
 await assert.rejects(closeAccountingPeriod(db,periods[0].id,adminId),/iguais/);await db.accountingPosting.delete({where:{id:broken.id}});
 await closeAccountingPeriod(db,periods[0].id,adminId);
 await assert.rejects(event("2002-01",1n),/fechado/);
 const secondRule=await db.accountingRule.create({data:{eventType:rule.eventType,version:2,debitAccountId:asset.id,creditAccountId:liability.id,validFrom:new Date("2000-01-01")}});
 await Promise.allSettled([changeAccountingRule(db,rule.id,true,adminId),changeAccountingRule(db,secondRule.id,true,adminId)]);
 assert.equal(await db.accountingRule.count({where:{eventType:rule.eventType,active:true}}),1);
 const racePeriod=await db.accountingPeriod.create({data:{name:"2002-05",startAt:new Date("2002-05-01"),endAt:new Date("2002-06-01")}});
 let announce!:()=>void,release!:()=>void;
 const ready=new Promise<void>(resolve=>announce=resolve),permission=new Promise<void>(resolve=>release=resolve);
 const emission=db.$transaction(async tx=>{await storeAccountingBusinessEvent({externalKey:`pkg5-race-${randomUUID()}`,type:"PACKAGE_FIVE_TEST",source:"FINANCE",sourceId:"close-race",amountCents:1n,occurredAt:new Date("2002-05-10T12:00:00Z")},tx);announce();await permission;},{timeout:30000});
 await Promise.race([ready,emission.then(()=>{throw new Error("Emissão interrompida antes da barreira");})]);
 const concurrentClose=closeAccountingPeriod(db,racePeriod.id,adminId);release();
 const outcome=await Promise.allSettled([emission,concurrentClose]);assert.equal(outcome[0].status,"fulfilled");assert.equal(outcome[1].status,"rejected");assert.equal((await db.accountingPeriod.findUniqueOrThrow({where:{id:racePeriod.id}})).status,"OPEN");
 const bulkPeriod=await db.accountingPeriod.create({data:{name:"2002-04",startAt:new Date("2002-04-01"),endAt:new Date("2002-05-01")}});
 const bulkEvent=await event("2002-04",5001n);await db.accountingBusinessEvent.update({where:{id:bulkEvent.id},data:{status:"POSTED"}});
 const bulkJournal=await db.accountingJournal.create({data:{businessEventId:bulkEvent.id,periodId:bulkPeriod.id,description:"Teste de relatório acima de dez mil partidas",ruleVersion:0,occurredAt:new Date("2002-04-10T12:00:00Z")}});
 try{
  await db.accountingPosting.createMany({data:Array.from({length:10002},(_,i)=>({journalId:bulkJournal.id,accountId:i%2?liability.id:asset.id,debitCents:i%2?0n:1n,creditCents:i%2?1n:0n}))});
  const large=await accountingReport(db,"balancete","2002-04");assert.ok("totalDebitsCents" in large);assert.equal(large.totalDebitsCents,"5001");assert.equal(large.totalCreditsCents,"5001");
 }finally{await db.accountingPosting.deleteMany({where:{journalId:bulkJournal.id}});await db.accountingJournal.delete({where:{id:bulkJournal.id}});await db.accountingBusinessEvent.delete({where:{id:bulkEvent.id}});}
 assert.deepEqual(await db.bankAccount.findMany({select:{id:true,balanceCents:true},orderBy:{id:"asc"}}),bankBefore);assert.equal(await db.ledgerEntry.count(),ledgerBefore);
 return {journalId:posted.journalId,liabilityId:liability.id};
}
