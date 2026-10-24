import assert from "node:assert/strict";
import type {PrismaClient} from "@prisma/client";
import {listSales,listPayouts,listTransfers,operationalListQuery,saleStatuses,payoutStatuses,transferStatuses} from "../../src/lib/operational-lists";

export async function operationalListScenarios(db:PrismaClient){
  const admin=await db.user.create({data:{name:"Admin listas",email:"operational-admin@synthetic.invalid",passwordHash:"synthetic",role:"ADMIN"}});
  const producer=await db.producer.create({data:{name:"Produtor listas A"}}),other=await db.producer.create({data:{name:"Produtor listas B"}});
  const owner=await db.user.create({data:{name:"Titular listas",email:"operational-owner@synthetic.invalid",passwordHash:"synthetic",role:"PRODUCER",producerId:producer.id}});
  const origin=await db.event.create({data:{name:"Evento origem listas",producerId:producer.id}}),destination=await db.event.create({data:{name:"Evento destino listas",producerId:producer.id}}),foreign=await db.event.create({data:{name:"SEGREDO OUTRO PRODUTOR",producerId:other.id}});
  const gateway=await db.gateway.create({data:{name:"Gateway listas"}}),brand=await db.cardBrand.create({data:{name:"Bandeira listas"}});
  const mdr=await db.mdrRule.create({data:{gatewayId:gateway.id,brandId:brand.id,rateBps:0}}),fee=await db.eventFeePolicy.create({data:{eventId:origin.id,mode:"PERCENT_BPS",value:0n}});
  const amount=(i:number)=>i<2?8000000000000000n:100n,createdAt=new Date("2001-01-01T00:00:00Z");
  const titles=[],sales=[],payouts=[],transfersData=[];
  for(let i=0;i<130;i++){
    const id=String(i).padStart(3,"0"),titleId=`ops-title-${id}`;titles.push({id:titleId,kind:"RECEIVABLE" as const,description:"Venda sintética",amountCents:amount(i),producerId:producer.id,eventId:origin.id,createdById:admin.id});
    sales.push({id:`ops-sale-${id}`,externalReference:i===0?"ALVO ANTIGO ÁRVORE":"sale-fixture-"+id,producerId:producer.id,eventId:origin.id,gatewayId:gateway.id,brandId:brand.id,mdrRuleId:mdr.id,feePolicyId:fee.id,quantity:1,unitPriceCents:amount(i),grossCents:amount(i),feeModeAtSale:"PERCENT_BPS" as const,feeValueAtSale:0n,producerPaysMdrAtSale:true,mdrRateBpsAtSale:0,mdrFixedCentsAtSale:0n,feeCents:0n,mdrCents:0n,netSettlementCents:amount(i),producerNetCents:amount(i),diskNetCents:0n,receivableTitleId:titleId,createdById:admin.id,createdAt,status:i%2?"SETTLED" as const:"AWAITING_SETTLEMENT" as const});
    payouts.push({id:`ops-payout-${id}`,type:"REPASSE" as const,status:i%2?"SETTLED" as const:"REQUESTED" as const,amountCents:amount(i),eventId:origin.id,producerId:producer.id,requestedById:owner.id,createdAt,settlementReference:i===0?"INTERNAL-ONLY":null});
    transfersData.push({id:`ops-transfer-${id}`,originEventId:origin.id,destinationEventId:destination.id,producerId:producer.id,requestedById:owner.id,reason:i===0?"ALVO ANTIGO ÁRVORE":"Transferência sintética",amountCents:amount(i),status:i%2?"EXECUTED" as const:"REQUESTED" as const,createdAt});
  }
  await db.financialTitle.createMany({data:titles});
  await db.financialSale.createMany({data:sales});
  await db.payoutRequest.createMany({data:payouts});
  await db.eventTransfer.createMany({data:transfersData});
  await db.payoutRequest.create({data:{type:"ANTECIPACAO",amountCents:999n,eventId:foreign.id,producerId:other.id,requestedById:admin.id}});
  await db.eventTransfer.create({data:{originEventId:foreign.id,destinationEventId:foreign.id,producerId:other.id,requestedById:admin.id,reason:"SEGREDO OUTRO PRODUTOR",amountCents:999n}});
  const query=(s:string)=>new URLSearchParams(s),total=(16000000000000000n+12800n).toString();
  const salesResult=await listSales(db,admin,query(""));assert.equal(salesResult.count,130);assert.equal(salesResult.summary.grossCents,total);assert.equal(salesResult.summary.quantity,130);assert.equal(salesResult.summary.settled,65);
  const payoutsResult=await listPayouts(db,owner,query(""));assert.equal(payoutsResult.count,130);assert.equal(payoutsResult.summary.amountCents,total);assert.ok(payoutsResult.items.every(p=>p.producerId===producer.id&&!("settlementReference" in p)));
  const transfers=await listTransfers(db,owner,query(""));assert.equal(transfers.count,130);assert.equal(transfers.summary.pendingCount,65);assert.equal(transfers.summary.executedCount,65);
  const pageChecks:Array<[typeof listSales|typeof listPayouts|typeof listTransfers,typeof admin|typeof owner]>=[[listSales,admin],[listPayouts,owner],[listTransfers,owner]];
  for(const [fn,user] of pageChecks){
    const ids:string[]=[];for(let page=1;page<=6;page++){const result=await fn(db,user,query(`pagina=${page}`));assert.equal(result.pages,6);ids.push(...result.items.map(i=>i.id));}
    assert.equal(ids.length,130);assert.equal(new Set(ids).size,130);assert.deepEqual(ids,[...ids].sort().reverse());
    const last=await fn(db,user,query("pagina=10000"));assert.equal(last.page,6);assert.equal(last.items.length,5);
  }
  assert.equal((await listSales(db,admin,query("q=ALVO+ANTIGO"))).items[0].id,"ops-sale-000");
  assert.equal((await listTransfers(db,owner,query("q=ALVO+ANTIGO"))).items[0].id,"ops-transfer-000");
  if(/^postgres/.test(process.env.DATABASE_URL??"")){
    assert.equal((await listSales(db,admin,query("q=alvo+antigo+árvore"))).count,1);
    assert.equal((await listTransfers(db,owner,query("q=alvo+antigo+árvore"))).count,1);
  }
  assert.equal((await listSales(db,admin,query("status=SETTLED"))).count,65);
  assert.equal((await listPayouts(db,owner,query("status=REQUESTED"))).count,65);
  const executed=await listTransfers(db,owner,query("status=EXECUTED"));assert.equal(executed.count,65);assert.equal(executed.summary.pendingCount,0);
  assert.equal((await listPayouts(db,owner,query("q=8000000000000000"))).count,2);
  for(const fn of [listPayouts,listTransfers]){
    assert.equal((await fn(db,owner,query("q=SEGREDO"))).count,0);
    assert.equal((await fn(db,admin,query(""))).count,131);
    await assert.rejects(()=>fn(db,{...owner,producerId:null},query("")),/sem vínculo/);
  }
  await assert.rejects(()=>listSales(db,owner,query("")),/restrito/);
  for(const statuses of [saleStatuses,payoutStatuses,transferStatuses])for(const invalid of ["pagina=0","pagina=1.5","limite=101","status=UNKNOWN",`q=${"x".repeat(101)}`])assert.throws(()=>operationalListQuery(query(invalid),statuses));
  assert.equal(await db.ledgerEntry.count(),0); // List reads and synthetic fixtures create no bank movement.
  return {rowsPerList:130,pagesPerList:6,status:"APROVADO"};
}
