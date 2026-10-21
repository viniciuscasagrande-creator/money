import {createHash} from "node:crypto";
import {Prisma,type PrismaClient} from "@prisma/client";
import {z} from "zod";
import {periodName,validatePostings} from "@/lib/accounting-core";
type Tx=Prisma.TransactionClient;
const reject=(message:string):never=>{throw new Error(`REGRA:${message}`);};
export const accountingProcessInput=z.object({businessEventId:z.string().min(1),ruleId:z.string().min(1),previewHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),customPostings:z.array(z.object({accountId:z.string().min(1),debitCents:z.string().regex(/^\d{1,16}$/).default("0"),creditCents:z.string().regex(/^\d{1,16}$/).default("0"),eventId:z.string().nullable().optional()}).strict()).min(2).max(20).optional()}).strict();
type ProcessInput=z.infer<typeof accountingProcessInput>;
export async function accountingSource(tx:Tx,item:{type:string;sourceId:string;externalKey:string}){
  const id=item.sourceId,key=item.externalKey;
  if(item.type==="TICKET_SALE_CAPTURED"&&key===`sale:${id}`){const s=await tx.financialSale.findUnique({where:{id}});return s?{kind:"SALE",id:s.id,reference:s.externalReference,amountCents:s.grossCents,eventId:s.eventId,producerId:s.producerId,feeCents:s.feeCents,mdrCents:s.mdrCents,producerNetCents:s.producerNetCents,netSettlementCents:s.netSettlementCents}:{kind:"SOURCE_NOT_FOUND"};}
  if(["ACQUIRER_SETTLEMENT_POSTED","FINANCIAL_TITLE_SETTLED"].includes(item.type)&&key===`title-settlement:${id}`){const t=await tx.financialTitle.findUnique({where:{id}});return t?{kind:"TITLE",id:t.id,reference:t.description,amountCents:t.amountCents,eventId:t.eventId,producerId:t.producerId,status:t.status,bankAccountId:t.bankAccountId}:{kind:"SOURCE_NOT_FOUND"};}
  if(item.type==="PRODUCER_PAYOUT_SETTLED"&&key===`payout:${id}`){const p=await tx.payoutRequest.findUnique({where:{id}});return p?{kind:"PAYOUT",id:p.id,amountCents:p.amountCents,eventId:p.eventId,producerId:p.producerId,status:p.status,reference:p.settlementReference}:{kind:"SOURCE_NOT_FOUND"};}
  if(["MANDATORY_RETENTION_CREATED","MANDATORY_RETENTION_RELEASED"].includes(item.type)&&(key===`reserve:${id}`||key.startsWith(`reserve-status:${id}:`))){const r=await tx.eventReserve.findUnique({where:{id}});return r?{kind:"RESERVE",id:r.id,amountCents:r.amountCents,eventId:r.eventId,status:r.status,reference:r.purpose}:{kind:"SOURCE_NOT_FOUND"};}
  if(["INTERNAL_EVENT_TRANSFER_EXECUTED","INTERNAL_EVENT_TRANSFER_REVERSED"].includes(item.type)&&(key===`transfer:${id}`||key===`transfer-reversal:${id}`)){const t=await tx.eventTransfer.findUnique({where:{id}});return t?{kind:"TRANSFER",id:t.id,amountCents:t.amountCents,eventId:t.originEventId,destinationEventId:t.destinationEventId,producerId:t.producerId,status:t.status}:{kind:"SOURCE_NOT_FOUND"};}
  return {kind:"MANUAL",sourceId:id};
}
function serialize<T>(value:T){return JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==="bigint"?v.toString():v));}
async function prepare(tx:Tx,input:ProcessInput){
  const item=await tx.accountingBusinessEvent.findUnique({where:{id:input.businessEventId}});
  if(!item||item.status!=="PENDING")return reject("Evento contábil inexistente ou não pendente.");
  const rule=await tx.accountingRule.findUnique({where:{id:input.ruleId}});
  if(!rule?.active||rule.eventType!==item.type||rule.validFrom>item.occurredAt||(rule.validUntil&&rule.validUntil<item.occurredAt))return reject("Regra inativa, incompatível ou fora da vigência.");
  const period=await tx.accountingPeriod.findUnique({where:{name:periodName(item.occurredAt)}});
  if(!period||period.status!=="OPEN"||item.occurredAt<period.startAt||item.occurredAt>=period.endAt)return reject("Período contábil fechado ou inexistente.");
  const origin=await accountingSource(tx,item);
  if(origin.kind==="SOURCE_NOT_FOUND")return reject("Operação de origem não encontrada; revise a integração.");
  if("amountCents" in origin&&origin.amountCents!==item.amountCents)return reject("Valor do evento difere da operação de origem.");
  if(("eventId" in origin&&origin.eventId!==item.eventId)||("producerId" in origin&&origin.producerId!==item.producerId))return reject("Evento ou produtor incompatível com a operação de origem.");
  if(["SALE","TRANSFER"].includes(origin.kind)&&!input.customPostings)return reject("Vendas e transferências integradas exigem partidas explícitas revisadas.");
  const raw=input.customPostings??[{accountId:rule.debitAccountId,debitCents:item.amountCents.toString(),creditCents:"0"},{accountId:rule.creditAccountId,debitCents:"0",creditCents:item.amountCents.toString()}];
  const ids=[...new Set(raw.map(p=>p.accountId))];
  const accounts=await tx.accountingAccount.findMany({where:{id:{in:ids},active:true,postable:true},orderBy:{id:"asc"}});
  if(accounts.length!==ids.length||(ids.length<2&&origin.kind!=="TRANSFER"))return reject("Partidas exigem contas analíticas ativas e distintas.");
  if(origin.kind==="TRANSFER"&&accounts.some(a=>a.type!=="LIABILITY"))return reject("Transferências internas exigem contas do passivo; não geram receita, despesa ou caixa.");
  const postings=[];
  for(const p of raw){
    const eventId="eventId" in p&&p.eventId!==undefined?p.eventId:item.eventId;
    const event=eventId?await tx.event.findUnique({where:{id:eventId},select:{id:true,producerId:true}}):null;
    if(eventId&&!event)return reject("Evento da partida inexistente.");
    if(event&&item.producerId&&event.producerId!==item.producerId)return reject("Partida vinculada a outro produtor.");
    if(origin.kind!=="MANUAL"&&origin.kind!=="TRANSFER"&&eventId!==item.eventId)return reject("Mantenha o evento da operação de origem nas partidas integradas.");
    if(origin.kind==="TRANSFER"&&"destinationEventId" in origin&&![origin.eventId,origin.destinationEventId].includes(eventId??""))return reject("Transferência exige centros de origem e destino válidos.");
    if(origin.kind==="TRANSFER"&&"destinationEventId" in origin){const debitEvent=item.type==="INTERNAL_EVENT_TRANSFER_REVERSED"?origin.destinationEventId:origin.eventId,creditEvent=item.type==="INTERNAL_EVENT_TRANSFER_REVERSED"?origin.eventId:origin.destinationEventId;if((BigInt(p.debitCents)>0n&&eventId!==debitEvent)||(BigInt(p.creditCents)>0n&&eventId!==creditEvent))return reject("Sentido das partidas incompatível com a transferência ou sua reversão.");}
    postings.push({accountId:p.accountId,debitCents:BigInt(p.debitCents),creditCents:BigInt(p.creditCents),eventId:event?.id??null,producerId:event?.producerId??item.producerId});
  }
  let totals:ReturnType<typeof validatePostings>;
  try{totals=validatePostings(postings);}catch(e){return reject(e instanceof Error?e.message:"Partidas inválidas.");}
  if(totals.debit!==item.amountCents)return reject("Soma das partidas deve coincidir com o valor do evento de negócio.");
  if(postings.some(p=>p.debitCents>9999999999999999n||p.creditCents>9999999999999999n))return reject("Partida acima do limite financeiro.");
  if(origin.kind==="TRANSFER"&&"destinationEventId" in origin&&(!postings.some(p=>p.eventId===origin.eventId)||!postings.some(p=>p.eventId===origin.destinationEventId)))return reject("Distribua as partidas entre os eventos de origem e destino.");
  const snapshot=serialize({rule,accounts,period:{id:period.id,name:period.name,startAt:period.startAt,endAt:period.endAt},business:{id:item.id,externalKey:item.externalKey,type:item.type,source:item.source,sourceId:item.sourceId,amountCents:item.amountCents,eventId:item.eventId,producerId:item.producerId,occurredAt:item.occurredAt,payloadJson:item.payloadJson},postings,origin});
  const hash=createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return {item,rule,period,postings,snapshot,hash};
}
export async function previewAccounting(db:PrismaClient,raw:unknown){
  const input=accountingProcessInput.parse(raw);
  return db.$transaction(async tx=>{const prepared=await prepare(tx,input);return {previewHash:prepared.hash,...prepared.snapshot};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}
export async function postAccounting(db:PrismaClient,raw:unknown,actorId:string){
  const input=accountingProcessInput.parse(raw);
  return db.$transaction(async tx=>{
    const actor=await tx.user.findUnique({where:{id:actorId}});if(!actor?.active||actor.role!=="ADMIN")return reject("Somente Administrador pode contabilizar.");
    const old=await tx.accountingJournal.findUnique({where:{businessEventId:input.businessEventId}});
    if(old){if(old.ruleId&&old.ruleId!==input.ruleId)return reject("Fato já contabilizado com outra regra; o lançamento anterior foi preservado.");return {journalId:old.id,duplicate:true};}
    const result=await prepare(tx,input);
    if(input.previewHash&&input.previewHash!==result.hash)return reject("A prévia mudou. Consulte novamente antes de confirmar.");
    const periodLock=await tx.accountingPeriod.updateMany({where:{id:result.period.id,status:"OPEN"},data:{status:"OPEN"}});
    const ruleLock=await tx.accountingRule.updateMany({where:{id:result.rule.id,active:true},data:{active:true}});
    if(!periodLock.count||!ruleLock.count)return reject("Regra ou competência alterada durante o processamento.");
    const journal=await tx.accountingJournal.create({data:{businessEventId:result.item.id,periodId:result.period.id,ruleId:result.rule.id,ruleSnapshotJson:JSON.stringify(result.snapshot),postedById:actorId,description:`${result.item.type} · ${result.item.source} · ${result.item.sourceId}`,ruleVersion:result.rule.version,occurredAt:result.item.occurredAt,postings:{create:result.postings}}});
    const claimed=await tx.accountingBusinessEvent.updateMany({where:{id:result.item.id,status:"PENDING"},data:{status:"POSTED"}});if(!claimed.count)return reject("Evento contabilizado por outra operação.");
    await tx.auditLog.create({data:{actorId,action:"ACCOUNTING_POSTED",entity:"AccountingJournal",entityId:journal.id,summary:`Partidas balanceadas; regra ${result.rule.id} v${result.rule.version}; prévia ${result.hash}.`}});
    return {journalId:journal.id,duplicate:false,postingsCount:result.postings.length};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}
export async function changeAccountingRule(db:PrismaClient,id:string,active:boolean,actorId:string){
  return db.$transaction(async tx=>{
    const actor=await tx.user.findUnique({where:{id:actorId}});if(!actor?.active||actor.role!=="ADMIN")return reject("Somente Administrador pode alterar regras.");
    await tx.financeSetting.upsert({where:{key:"accounting_rule_lock"},create:{key:"accounting_rule_lock",value:"locked"},update:{value:"locked"}});
    const rule=await tx.accountingRule.findUnique({where:{id}});if(!rule)return reject("Regra inexistente.");
    if(active)await tx.accountingRule.updateMany({where:{eventType:rule.eventType,active:true},data:{active:false}});
    const updated=await tx.accountingRule.update({where:{id},data:{active}});
    await tx.auditLog.create({data:{actorId,action:"ACCOUNTING_RULE_CHANGED",entity:"AccountingRule",entityId:id,summary:`Regra v${rule.version} ${active?"ativada":"desativada"}.`}});
    return {id:updated.id,active:updated.active};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
