import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {PrismaClient,Prisma} from "@prisma/client";
import {assertOwnedSchema} from "./lib/postgres-isolation.mjs";
import {exportDatabaseDump,restoreDatabaseDump} from "../src/lib/backup-data";
import {migrateLegacyFinance} from "../src/lib/legacy-finance-migration";

const url=process.env.DATABASE_URL??"",schema=process.env.HOMOLOG_SCHEMA??"";
assertOwnedSchema(url,schema);
const db=new PrismaClient({datasources:{db:{url}},transactionOptions:{maxWait:5000,timeout:15000},log:[]});
const steps:string[]=[];
async function main(){
  if(process.argv.includes("--cleanup")){
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${assertOwnedSchema(url,schema)}" CASCADE`);
    return;
  }
  if(process.argv.includes("--seed-baseline")){
    // Original fields only: the additive migration has not been applied yet.
    await db.$transaction(async tx=>{
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${assertOwnedSchema(url,schema)}"`);
      await tx.$executeRaw`INSERT INTO "Producer" ("id","name") VALUES ('migration_producer','Migração PG')`;
      await tx.$executeRaw`INSERT INTO "Event" ("id","name","producerId","status") VALUES ('migration_origin','Origem','migration_producer','ACTIVE'),('migration_target','Destino','migration_producer','ACTIVE')`;
      await tx.$executeRaw`INSERT INTO "EventReserve" ("id","eventId","purpose","amountCents","createdById") VALUES ('migration_reserve','migration_origin','Reserva anterior',12345,'migration_actor')`;
      await tx.$executeRaw`INSERT INTO "EventTransfer" ("id","producerId","originEventId","destinationEventId","amountCents","reason","requestedById") VALUES ('migration_transfer','migration_producer','migration_origin','migration_target',2345,'Transferência anterior','migration_actor')`;
    });
    return;
  }
  if(process.argv.includes("--verify-upgrade")){
    const reserve=await db.eventReserve.findUniqueOrThrow({where:{id:"migration_reserve"}});
    const transfer=await db.eventTransfer.findUniqueOrThrow({where:{id:"migration_transfer"}});
    assert.equal(reserve.amountCents,12345n);assert.equal(reserve.category,"OUTRAS_DESPESAS");assert.ok(reserve.updatedAt instanceof Date);
    assert.equal(transfer.amountCents,2345n);assert.equal(transfer.status,"REQUESTED");
    return;
  }
  const {prisma}=await import("../src/lib/prisma");
  try{
    const {registerSale,eventAvailability,createPayout}=await import("../src/lib/operations");
    const {settleTitle}=await import("../src/lib/finance");
    const {requestEventTransfer,actOnEventTransfer,createEventReserve}=await import("../src/lib/event-finance");
    const {importTicketingReceivable}=await import("../src/lib/ticketing-import");
    const producer=await db.producer.create({data:{name:"Produtor teste PG"}});
    const admin=await db.user.create({data:{name:"Administrador PG",email:"regression@pg.invalid",passwordHash:"no-login",role:"ADMIN"}});
    const user={id:admin.id,name:admin.name,email:admin.email,role:admin.role,active:true,producerId:null};
    const origin=await db.event.create({data:{name:"Origem PG",producerId:producer.id,status:"ACTIVE"}});
    const target=await db.event.create({data:{name:"Destino PG",producerId:producer.id,status:"ACTIVE"}});
    const gateway=await db.gateway.create({data:{name:"Gateway PG"}}),brand=await db.cardBrand.create({data:{name:"Bandeira PG"}});
    const mdr=await db.mdrRule.create({data:{gatewayId:gateway.id,brandId:brand.id,rateBps:0}});
    await db.eventFeePolicy.create({data:{eventId:origin.id,mode:"PERCENT_BPS",value:1000n}});
    const bank=await db.bankAccount.create({data:{name:"Banco PG",institution:"Teste"}});
    const sale=await registerSale({eventId:origin.id,externalReference:"pg-regression-sale",mdrRuleId:mdr.id,unitPriceCents:"100000",quantity:1},user);
    await settleTitle(sale.receivableTitleId,bank.id,user);
    const claims=await Promise.allSettled([createPayout({eventId:origin.id,type:"REPASSE",amountCents:"60000"},user),createPayout({eventId:origin.id,type:"REPASSE",amountCents:"60000"},user)]);
    assert.equal(claims.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(await db.payoutRequest.count({where:{eventId:origin.id}}),1);
    assert.equal((await eventAvailability(db,origin.id)).repasseCents,30000n);
    steps.push("solicitações concorrentes não excedem o saldo");
    const input={externalReference:"pg-provider-order",producerName:producer.name,eventName:origin.name,description:"Recebível PG",amountCents:"500"};
    const imports=await Promise.all(Array.from({length:5},()=>importTicketingReceivable(input,user.id)));
    assert.equal(new Set(imports.map(x=>x.titleId)).size,1);assert.equal(await db.integrationDelivery.count(),1);
    steps.push("cinco reenvios concorrentes criam um único título");
    const reserves=await Promise.all(Array.from({length:4},(_,i)=>db.$transaction(tx=>createEventReserve(tx,{eventId:origin.id,description:`Reserva paralela ${i}`,amountCents:"1000"},user))));
    assert.equal(new Set(reserves.map(x=>x.id)).size,4);assert.equal((await eventAvailability(db,origin.id)).reserveCents,4000n);
    steps.push("retenções paralelas preservam todos os registros e compromissos");
    await assert.rejects(requestEventTransfer({sourceEventId:origin.id,targetEventId:target.id,amountCents:"100",reason:"Permissão bloqueada"},user));
    const policy={producerId:producer.id,allowPayoutRequests:true,allowAdvanceRequests:true,allowEventTransfers:true,allowedTransferEventIds:[],maxSingleTransferCents:"10000",maxTransferPercentBps:10000,maxTransfersPerEvent:10,approvalPolicy:"DUAL_INTERNAL",updatedAt:new Date().toISOString()};
    await db.financeSetting.create({data:{key:`producer_policy:${producer.id}`,value:JSON.stringify(policy)}});
    const transfer=await requestEventTransfer({sourceEventId:origin.id,targetEventId:target.id,amountCents:"100",reason:"Regressão PostgreSQL"},user);
    await assert.rejects(actOnEventTransfer(transfer.id,"APPROVE",user),/Solicitante/);
    steps.push("transferência não contorna permissão ou segregação");
    const stamp=new Date().toISOString();
    await db.financeSetting.create({data:{key:`retentions:${target.id}`,changedById:admin.id,value:JSON.stringify([{id:"legacy-pg-reserve",eventId:target.id,category:"ECAD",description:"Retenção legada",beneficiary:"ECAD",documentRef:"PG-1",ownerName:"Teste",dueDate:null,amountCents:"100",status:"ACTIVE",createdAt:stamp,updatedAt:stamp}])}});
    assert.equal((await migrateLegacyFinance(db)).reserves,1);
    steps.push("migração JSON preserva retenções legadas no PostgreSQL");
    const dump=await exportDatabaseDump(db),restoreSchema=`${schema.slice(0,-1)}${schema.endsWith("f")?"e":"f"}`;
    const restoreUrl=new URL(url);restoreUrl.searchParams.set("schema",restoreSchema);assertOwnedSchema(restoreUrl.toString(),restoreSchema);
    const restored=new PrismaClient({datasources:{db:{url:restoreUrl.toString()}},log:[]});
    try{
      execFileSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy","--schema=prisma/postgresql/schema.prisma"],{env:{...process.env,DATABASE_URL:restoreUrl.toString()},stdio:"pipe"});
      const counts=await restoreDatabaseDump(restored,dump,true);assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),dump.totalRows);
      const roundtrip=await exportDatabaseDump(restored);
      for(const [name,table]of Object.entries(dump.tables)){
        const normalize=(rows:Record<string,unknown>[])=>rows.map(x=>JSON.stringify(x)).sort();
        assert.deepEqual(normalize(roundtrip.tables[name].rows),normalize(table.rows),name);
      }
    }finally{await restored.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${restoreSchema}" CASCADE`);await restored.$disconnect();}
    steps.push("snapshot e restauração PostgreSQL preservam todos os modelos e valores");
    fs.mkdirSync("homologacao-resultados",{recursive:true});
    fs.writeFileSync("homologacao-resultados/postgresql-regressions.json",JSON.stringify({status:"APROVADO",steps,models:Prisma.dmmf.datamodel.models.length},null,2));
    console.log(JSON.stringify({status:"APROVADO",steps},null,2));
  }finally{await prisma.$disconnect();}
}
main().catch(e=>{console.error(e instanceof Error?e.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,"postgresql://[redacted]"):"Falha na regressão PostgreSQL.");process.exitCode=1;}).finally(()=>db.$disconnect());
