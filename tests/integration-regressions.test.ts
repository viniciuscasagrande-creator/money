import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync,spawn} from "node:child_process";
import net from "node:net";
import {randomBytes,createHash} from "node:crypto";
import {PrismaClient} from "@prisma/client";
import {exportDatabaseDump,restoreDatabaseDump} from "../src/lib/backup-data";
import {migrateLegacyFinance} from "../src/lib/legacy-finance-migration";
import bcrypt from "bcryptjs";
import {changeAccountSecurity,createVerifiedSession,sessionTokenHash,SecurityError} from "../src/lib/account-security";
import {queueRegressions} from "./helpers/integration-queue-scenarios";

test("regressões financeiras com persistência, idempotência e restauração isolada",async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"money-regression-"));
  const url=`file:${path.join(dir,"test.db").replaceAll("\\","/")}`;
  const previous=process.env.DATABASE_URL;process.env.DATABASE_URL=url;
  fs.writeFileSync(path.join(dir,"test.db"),"",{flag:"wx"});
  execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{env:{...process.env,DATABASE_URL:url},stdio:"pipe"});
  const {prisma:db}=await import("../src/lib/prisma");
  const {registerSale,createPayout,actOnPayout,eventAvailability}=await import("../src/lib/operations");
  const {settleTitle}=await import("../src/lib/finance");
  const {requestEventTransfer,actOnEventTransfer,createEventReserve,changeEventReserve}=await import("../src/lib/event-finance");
  const {importTicketingReceivable}=await import("../src/lib/ticketing-import");
  const {loadEventRetentions,loadEventTransfers,defaultLockPolicy,loadEventLockPolicy,defaultProducerFinancialPolicy}=await import("../src/lib/payout-locks");
  try {
    const producer=await db.producer.create({data:{name:"Produtor regressão"}});
    const admin=await db.user.create({data:{name:"Admin teste",email:"admin@regression.invalid",passwordHash:"not-a-login",role:"ADMIN"}});
    const finance=await db.user.create({data:{name:"Finance teste",email:"finance@regression.invalid",passwordHash:"not-a-login",role:"FINANCE_DISK"}});
    const executor=await db.user.create({data:{name:"Executor teste",email:"executor@regression.invalid",passwordHash:"not-a-login",role:"ADMIN"}});
    const owner=await db.user.create({data:{name:"Produtor teste",email:"producer@regression.invalid",passwordHash:"not-a-login",role:"PRODUCER",producerId:producer.id}});
    const actor=(u:typeof admin)=>({id:u.id,name:u.name,email:u.email,role:u.role,active:u.active,producerId:u.producerId});
    const au=actor(admin),fu=actor(finance),eu=actor(executor),pu=actor(owner);
    const origin=await db.event.create({data:{name:"Origem",producerId:producer.id,status:"ACTIVE"}});
    const target=await db.event.create({data:{name:"Destino",producerId:producer.id,status:"ACTIVE"}});
    const gateway=await db.gateway.create({data:{name:"Teste"}}),brand=await db.cardBrand.create({data:{name:"Teste"}});
    const mdr=await db.mdrRule.create({data:{gatewayId:gateway.id,brandId:brand.id,rateBps:0}});
    await db.eventFeePolicy.create({data:{eventId:origin.id,mode:"PERCENT_BPS",value:1000n}});
    const account=await db.bankAccount.create({data:{name:"Banco teste",institution:"Teste",balanceCents:0n}});
    const sale=await registerSale({eventId:origin.id,externalReference:"sale-regression",mdrRuleId:mdr.id,unitPriceCents:"100000",quantity:1},au);
    await settleTitle(sale.receivableTitleId,account.id,au);
    await t.test("venda e liquidação emitem eventos contábeis na mesma transação",async()=>{
      assert.equal(await db.accountingBusinessEvent.count(),2);
      await assert.rejects(settleTitle(sale.receivableTitleId,account.id,au));
      assert.equal(await db.accountingBusinessEvent.count(),2);
    });
    await t.test("webhook concorrente não duplica títulos e rejeita alteração da mesma referência",async()=>{
      const input={externalReference:"provider-order-1",producerName:producer.name,eventName:origin.name,description:"Recebível externo",amountCents:"12345"};
      const results=await Promise.all([importTicketingReceivable(input,admin.id),importTicketingReceivable(input,admin.id)]);
      assert.equal(results[0].titleId,results[1].titleId);
      assert.equal(await db.integrationDelivery.count(),1);
      const legacyHash=createHash("sha256").update(JSON.stringify({...input,producerDocument:null,dueDate:null})).digest("hex");
      await db.integrationDelivery.updateMany({where:{externalReference:input.externalReference},data:{payloadHash:legacyHash}});
      assert.equal((await importTicketingReceivable({...input,producerDocument:null,dueDate:null},admin.id)).titleId,results[0].titleId);
      await assert.rejects(importTicketingReceivable({...input,amountCents:"54321"},admin.id),/outro conteúdo/);
      assert.equal(await db.financialTitle.count(),2);
    });
    await t.test("retenções são compartilhadas e nova retenção bloqueia baixa pendente",async()=>{
      const payout=await createPayout({eventId:origin.id,type:"REPASSE",amountCents:"50000"},pu);
      await actOnPayout(payout.id,"APPROVE",au,{});await actOnPayout(payout.id,"PRODUCER_ACCEPT",pu,{});await actOnPayout(payout.id,"FINANCE_SIGN",au,{});
      const reserve=await db.$transaction(tx=>createEventReserve(tx,{eventId:origin.id,description:"Retenção de risco",amountCents:"80000",category:"ECAD"},au));
      assert.equal((await loadEventRetentions(db,origin.id)).length,1);
      await assert.rejects(actOnPayout(payout.id,"SETTLE",au,{bankAccountId:account.id,settlementReference:"regression-settlement"}),/Posição financeira insuficiente/);
      assert.equal((await db.bankAccount.findUniqueOrThrow({where:{id:account.id}})).balanceCents,100000n);
      await db.$transaction(tx=>changeEventReserve(tx,reserve.id,"RELEASED","Conferência concluída",au));
      await actOnPayout(payout.id,"SETTLE",au,{bankAccountId:account.id,settlementReference:"regression-settlement"});
      assert.equal(await db.accountingBusinessEvent.count({where:{externalKey:`payout:${payout.id}`}}),1);
    });
    const producerPolicy={...defaultProducerFinancialPolicy(producer.id),allowEventTransfers:true,maxSingleTransferCents:"30000"};
    await db.financeSetting.create({data:{key:`producer_policy:${producer.id}`,value:JSON.stringify(producerPolicy)}});
    await t.test("transferência exige capacidade, alçada, aceite e segregação; revogação bloqueia execução",async()=>{
      const transfer=await requestEventTransfer({sourceEventId:origin.id,targetEventId:target.id,amountCents:"10000",reason:"Cobertura de despesas"},pu);
      const pending=await eventAvailability(db,origin.id);
      assert.equal(pending.transferReservedCents,10000n);assert.equal(pending.transferExecutedCents,0n);
      await db.userPermissionOverride.create({data:{userId:finance.id,permission:"PAYOUT_APPROVE",allowed:false}});
      await assert.rejects(actOnEventTransfer(transfer.id,"APPROVE",fu),/permissão/);
      await db.userPermissionOverride.update({where:{userId_permission:{userId:finance.id,permission:"PAYOUT_APPROVE"}},data:{allowed:true}});
      await assert.rejects(actOnEventTransfer(transfer.id,"APPROVE",fu),/alçada/);
      await actOnEventTransfer(transfer.id,"APPROVE",au);
      await assert.rejects(actOnEventTransfer(transfer.id,"EXECUTE",eu),/aceite/);
      await assert.rejects(actOnEventTransfer(transfer.id,"PRODUCER_ACCEPT",au),/produtor titular/);
      await actOnEventTransfer(transfer.id,"PRODUCER_ACCEPT",pu);
      await assert.rejects(actOnEventTransfer(transfer.id,"EXECUTE",au),/distinta/);
      const reserve=await db.$transaction(tx=>createEventReserve(tx,{eventId:origin.id,description:"Bloqueio posterior",amountCents:"39000"},au));
      await assert.rejects(actOnEventTransfer(transfer.id,"EXECUTE",eu),/excede/);
      await db.$transaction(tx=>changeEventReserve(tx,reserve.id,"RELEASED","Liberação após revisão",au));
      await db.financeSetting.update({where:{key:`producer_policy:${producer.id}`},data:{value:JSON.stringify({...producerPolicy,allowEventTransfers:false})}});
      await assert.rejects(actOnEventTransfer(transfer.id,"EXECUTE",eu),/desabilitada/);
      await db.financeSetting.update({where:{key:`producer_policy:${producer.id}`},data:{value:JSON.stringify(producerPolicy)}});
      await actOnEventTransfer(transfer.id,"EXECUTE",eu);
      const a=await eventAvailability(db,origin.id),b=await eventAvailability(db,target.id);
      assert.equal(a.transferOutCents,10000n);assert.equal(b.transferInCents,10000n);
      assert.equal(a.transferReservedCents,0n);assert.equal(a.transferExecutedCents,10000n);
      assert.equal(await db.accountingBusinessEvent.count({where:{externalKey:`transfer:${transfer.id}`}}),1);
    });
    await t.test("configuração inválida bloqueia operação e migração preserva os registros legados",async()=>{
      const key=`locks:${origin.id}`;
      await db.financeSetting.create({data:{key,value:'{"active":"false"}'}});
      await assert.rejects(loadEventLockPolicy(db,origin.id),/inválida/);
      await db.financeSetting.update({where:{key},data:{value:JSON.stringify(defaultLockPolicy(origin.id))}});
      const stamp=new Date().toISOString();
      await db.financeSetting.create({data:{key:`retentions:${target.id}`,changedById:admin.id,value:JSON.stringify([{id:"legacy-reserve",eventId:target.id,category:"ECAD",description:"Legada",beneficiary:"ECAD",documentRef:"LEG-1",ownerName:"Teste",dueDate:null,amountCents:"100",status:"ACTIVE",createdAt:stamp,updatedAt:stamp}])}});
      await db.financeSetting.create({data:{key:"event_transfers:all",changedById:admin.id,value:JSON.stringify([{id:"legacy-transfer",producerId:producer.id,sourceEventId:origin.id,targetEventId:target.id,amountCents:"100",reason:"Migração teste",status:"REQUESTED",requestedById:owner.id,approvedById:null,producerAcceptedById:null,executedById:null,rejectionReason:null,createdAt:stamp,updatedAt:stamp}])}});
      await assert.rejects(eventAvailability(db,origin.id),/Migre/);
      assert.deepEqual(await migrateLegacyFinance(db),{reserves:1,transfers:1,settings:2});
      assert.equal((await loadEventRetentions(db,target.id))[0].id,"legacy-reserve");
      assert.ok((await loadEventTransfers(db)).some(x=>x.id==="legacy-transfer"));
      assert.deepEqual(await migrateLegacyFinance(db),{reserves:0,transfers:0,settings:0});
    });
    await t.test("política de dupla aprovação impede autoaprovação e exige outro signatário",async()=>{
      const key=`producer_policy:${producer.id}`;
      await db.financeSetting.update({where:{key},data:{value:JSON.stringify({...producerPolicy,approvalPolicy:"DUAL_INTERNAL"})}});
      const payout=await createPayout({eventId:origin.id,type:"REPASSE",amountCents:"100"},au);
      await assert.rejects(actOnPayout(payout.id,"APPROVE",au,{}),/autoaprovação/);
      await actOnPayout(payout.id,"APPROVE",eu,{});await actOnPayout(payout.id,"PRODUCER_ACCEPT",pu,{});
      await assert.rejects(actOnPayout(payout.id,"FINANCE_SIGN",eu,{}),/segundo responsável/);
      await actOnPayout(payout.id,"FINANCE_SIGN",au,{});
      await actOnPayout(payout.id,"SETTLE",au,{bankAccountId:account.id,settlementReference:"dual-settlement-test"});
      await db.financeSetting.update({where:{key},data:{value:JSON.stringify(producerPolicy)}});
    });
    await t.test("política v5.3 revalida repasse próximo ao teto sem descontar transferências duas vezes",async()=>{
      const policy=await db.eventReleasePolicy.create({data:{eventId:origin.id,capacityTickets:1,updatedById:admin.id,
        tiers:{create:[{minSoldBps:0,releaseBps:10000}]}}});
      try{
        const request=await createPayout({eventId:origin.id,type:"REPASSE",amountCents:"29000"},pu);
        await actOnPayout(request.id,"APPROVE",au,{});
        assert.equal((await db.payoutRequest.findUniqueOrThrow({where:{id:request.id}})).status,"APPROVED");
        await actOnPayout(request.id,"REJECT",au,{reason:"Encerrar cenário de regressão"});
      }finally{await db.eventReleasePolicy.delete({where:{id:policy.id}});}
    });
    await t.test("fila persistente: concorrência, lease, retry, reprocessamento e ausência de duplicação",async()=>{
      await queueRegressions(db,admin.id,finance.id);
    });
    await t.test("segurança: troca de senha revoga sessões e impede login com credencial desatualizada",async()=>{
      const oldPassword="Senha-anterior-teste-123",newPassword="Senha-nova-teste-456";
      const passwordHash=await bcrypt.hash(oldPassword,12);
      const person=await db.user.create({data:{name:"Segurança",email:"security@regression.invalid",passwordHash,role:"ADMIN"}});
      const current=sessionTokenHash("security-session"),other=sessionTokenHash("security-other");
      for(const tokenHash of [current,other])await createVerifiedSession(db,person.id,passwordHash,tokenHash,new Date(Date.now()+600000));
      const input={userId:person.id,tokenHash:current,currentPassword:oldPassword,action:"CHANGE_PASSWORD" as const,newPassword};
      await assert.rejects(changeAccountSecurity(db,{...input,currentPassword:"errada"}),e=>e instanceof SecurityError&&e.status===401);
      assert.equal(await db.session.count({where:{userId:person.id}}),2);
      await assert.rejects(changeAccountSecurity(db,{...input,newPassword:"á".repeat(40)}),e=>e instanceof SecurityError&&e.status===400);
      await assert.rejects(changeAccountSecurity(db,{...input,newPassword:oldPassword}),e=>e instanceof SecurityError&&e.status===400);
      await assert.rejects(changeAccountSecurity(db,{...input,tokenHash:sessionTokenHash("foreign")}),e=>e instanceof SecurityError&&e.status===401);
      assert.equal((await db.user.findUniqueOrThrow({where:{id:person.id}})).passwordHash,passwordHash);
      const result=await changeAccountSecurity(db,input);assert.deepEqual(result,{revoked:2,requiresLogin:true});
      assert.equal(await db.session.count({where:{userId:person.id}}),0);
      const changed=await db.user.findUniqueOrThrow({where:{id:person.id}});
      assert.ok(await bcrypt.compare(newPassword,changed.passwordHash));assert.equal(await bcrypt.compare(oldPassword,changed.passwordHash),false);
      await assert.rejects(createVerifiedSession(db,person.id,passwordHash,other,new Date(Date.now()+600000)),e=>e instanceof SecurityError&&e.status===409);
      const audit=await db.auditLog.findFirstOrThrow({where:{actorId:person.id,action:"PASSWORD_CHANGED"}});
      assert.ok(!JSON.stringify(audit).includes(newPassword));
    });
    await t.test("segurança: revogação preserva sessão atual, isola usuários e limita tentativas",async()=>{
      const password="Senha-sessoes-teste-789",passwordHash=await bcrypt.hash(password,12);
      const person=await db.user.create({data:{name:"Sessões",email:"sessions@regression.invalid",passwordHash,role:"ADMIN"}});
      const current=sessionTokenHash("revoke-current"),other=sessionTokenHash("revoke-other"),foreign=sessionTokenHash("revoke-foreign");
      for(const tokenHash of [current,other])await createVerifiedSession(db,person.id,passwordHash,tokenHash,new Date(Date.now()+600000));
      await db.session.create({data:{userId:admin.id,tokenHash:foreign,expiresAt:new Date(Date.now()+600000)}});
      const input={userId:person.id,tokenHash:current,currentPassword:password,action:"REVOKE_OTHERS" as const};
      assert.deepEqual(await changeAccountSecurity(db,input),{revoked:1,requiresLogin:false});
      assert.ok(await db.session.findUnique({where:{tokenHash:current}}));assert.ok(await db.session.findUnique({where:{tokenHash:foreign}}));
      for(let i=0;i<5;i++)await assert.rejects(changeAccountSecurity(db,{...input,currentPassword:"errada"}),e=>e instanceof SecurityError&&e.status===401);
      await assert.rejects(changeAccountSecurity(db,input),e=>e instanceof SecurityError&&e.status===429);
      await db.loginAttempt.updateMany({where:{key:sessionTokenHash(`account-security:${person.id}`)},data:{lockedUntil:new Date(Date.now()-1),lastAttemptAt:new Date(Date.now()-16*60000)}});
      await db.session.update({where:{tokenHash:current},data:{expiresAt:new Date(Date.now()-1000)}});
      await assert.rejects(changeAccountSecurity(db,input),e=>e instanceof SecurityError&&e.status===401);
      await db.user.update({where:{id:person.id},data:{active:false}});
      await assert.rejects(createVerifiedSession(db,person.id,passwordHash,sessionTokenHash("inactive"),new Date(Date.now()+600000)));
    });
    await t.test("HTTP: ambas as APIs aplicam os controles e demonstrativos respeitam competência",async()=>{
      const receivable=await db.accountingAccount.create({data:{code:"1.1",name:"Recebível teste",type:"ASSET"}});
      const revenue=await db.accountingAccount.create({data:{code:"3.1",name:"Receita teste",type:"REVENUE"}});
      for(const [month,amount]of [["2026-01",100n],["2026-02",200n]] as const){
        const date=new Date(`${month}-10T12:00:00.000Z`),startAt=new Date(`${month}-01T00:00:00.000Z`),endAt=new Date(Date.UTC(2026,Number(month.slice(-2)),1));
        const period=await db.accountingPeriod.create({data:{name:month,startAt,endAt}});
        const business=await db.accountingBusinessEvent.create({data:{externalKey:`report-${month}`,type:"REPORT_TEST",source:"FINANCE",sourceId:month,amountCents:amount,occurredAt:date,status:"POSTED"}});
        await db.accountingJournal.create({data:{businessEventId:business.id,periodId:period.id,description:"Teste de competência",ruleVersion:1,occurredAt:date,postings:{create:[{accountId:receivable.id,debitCents:amount},{accountId:revenue.id,creditCents:amount}]}}});
      }
      const tokens=new Map<string,string>();
      for(const user of [admin,finance,owner,executor]){const token=randomBytes(32).toString("hex");tokens.set(user.id,token);await db.session.create({data:{tokenHash:createHash("sha256").update(token).digest("hex"),userId:user.id,expiresAt:new Date(Date.now()+600000)}});}
      const listener=net.createServer();await new Promise<void>(resolve=>listener.listen(0,"127.0.0.1",resolve));
      const port=(listener.address() as net.AddressInfo).port;await new Promise<void>(resolve=>listener.close(()=>resolve()));
      const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port),"-H","127.0.0.1"],{env:{...process.env,DATABASE_URL:url},stdio:["ignore","pipe","pipe"],windowsHide:true});
      let logs="";server.stdout.on("data",x=>logs+=x);server.stderr.on("data",x=>logs+=x);
      const base=`http://127.0.0.1:${port}`;
      const api=async(route:string,method="GET",body?:unknown,user=admin)=>{const res=await fetch(base+route,{method,headers:{Cookie:`disk_financeiro_session=${tokens.get(user.id)}`,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json()};};
      try{
        let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+"/login")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
        assert.ok(ready,logs);
        assert.equal((await fetch(base+"/api/auth/security")).status,401);
        const ownSessions=await api("/api/auth/security","GET",undefined,owner);
        assert.equal(ownSessions.status,200);assert.equal(ownSessions.data.items.length,1);assert.equal(ownSessions.data.items[0].current,true);
        assert.ok(!JSON.stringify(ownSessions.data).includes("tokenHash"));
        assert.equal((await api("/api/auth/security","POST",{action:"REVOKE_OTHERS",currentPassword:"invalid",userId:admin.id},owner)).status,400);
        assert.equal((await fetch(base+"/api/auth/security",{method:"POST",headers:{Cookie:`disk_financeiro_session=${tokens.get(owner.id)}`,Origin:"https://foreign.invalid","Content-Type":"application/json"},body:JSON.stringify({action:"REVOKE_OTHERS",currentPassword:"invalid"})})).status,403);
        for(const month of ["2026-01","2026-02"]){
          const dre=await api(`/api/contabilidade?visao=dre&periodo=${month}`);assert.equal(dre.status,200);assert.equal(dre.data.receitaBrutaCents,month==="2026-01"?"100":"200");
          const trial=await api(`/api/contabilidade?visao=balancete&periodo=${month}`);assert.equal(trial.status,200);assert.equal(trial.data.balanced,true);
          const journal=await api(`/api/contabilidade?visao=razao&periodo=${month}`);assert.equal(journal.data.items.length,1);assert.ok(journal.data.items[0].occurredAt.startsWith(month));
        }
        assert.equal((await api("/api/contabilidade?visao=dre&periodo=invalid")).status,400);
        await db.userPermissionOverride.update({where:{userId_permission:{userId:finance.id,permission:"PAYOUT_APPROVE"}},data:{allowed:false}});
        assert.equal((await api("/api/repasses/travas","POST",{kind:"TRANSFER_ACTION",transferId:"legacy-transfer",action:"APPROVE"},finance)).status,409);
        assert.equal((await api("/api/financeiro/transferencias/legacy-transfer","POST",{action:"APPROVE"},finance)).status,409);
        assert.equal((await api("/api/repasses/travas","POST",{kind:"TRANSFER_ACTION",transferId:"legacy-transfer",action:"APPROVE"})).status,201);
        assert.equal((await api("/api/financeiro/transferencias/legacy-transfer","POST",{action:"PRODUCER_ACCEPT"},owner)).status,200);
        assert.equal((await api("/api/financeiro/transferencias/legacy-transfer","POST",{action:"EXECUTE"})).status,409);
        assert.equal((await api("/api/repasses/travas","POST",{kind:"TRANSFER_ACTION",transferId:"legacy-transfer",action:"EXECUTE"},executor)).status,201);
        const input={externalReference:"http-order",producerName:producer.name,eventName:origin.name,description:"Recebível HTTP",amountCents:"500"};
        const one=await api("/api/integracao/ingressos","POST",input),two=await api("/api/integracao/ingressos","POST",input);
        assert.equal(one.status,200);assert.equal(two.status,200);assert.equal(one.data.titleId,two.data.titleId);assert.equal(two.data.duplicate,true);
        assert.equal((await api("/api/integracao/ingressos","POST",{...input,amountCents:"600"})).status,409);
        const securityPassword="Senha-http-seguranca-123",changedPassword="Senha-http-atualizada-456";
        const securityUser=await db.user.create({data:{name:"HTTP Segurança",email:"http-security@regression.invalid",passwordHash:await bcrypt.hash(securityPassword,12),role:"ADMIN"}});
        const securityToken=randomBytes(32).toString("hex");tokens.set(securityUser.id,securityToken);
        for(const token of [securityToken,randomBytes(32).toString("hex")])await db.session.create({data:{userId:securityUser.id,tokenHash:sessionTokenHash(token),expiresAt:new Date(Date.now()+600000)}});
        const revoked=await api("/api/auth/security","POST",{action:"REVOKE_OTHERS",currentPassword:securityPassword},securityUser);
        assert.equal(revoked.status,200);assert.equal(revoked.data.revoked,1);
        assert.equal((await api("/api/auth/security","GET",undefined,securityUser)).status,200);
        const changed=await api("/api/auth/security","POST",{action:"CHANGE_PASSWORD",currentPassword:securityPassword,newPassword:changedPassword},securityUser);
        assert.equal(changed.status,200);assert.equal(changed.data.requiresLogin,true);
        assert.equal((await api("/api/auth/security","GET",undefined,securityUser)).status,401);
        const login=async(password:string)=>fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:securityUser.email,password})});
        assert.equal((await login(securityPassword)).status,401);assert.equal((await login(changedPassword)).status,200);
        assert.equal((await api("/api/integracao/fila","GET",undefined,owner)).status,403);
        assert.equal((await api("/api/integracao/fila?page=invalid")).status,400);
        const asynchronous=await fetch(base+"/api/integracao/ingressos",{method:"POST",headers:{Cookie:`disk_financeiro_session=${tokens.get(admin.id)}`,"Content-Type":"application/json",Prefer:"respond-async"},body:JSON.stringify({...input,externalReference:"http-queued-order"})});
        assert.equal(asynchronous.status,202);const accepted=await asynchronous.json();assert.equal(accepted.job.status,"PENDING");
        const queueList=await api("/api/integracao/fila");assert.equal(queueList.status,200);
        assert.ok(!JSON.stringify(queueList.data).includes('"payload"'));assert.ok(!JSON.stringify(queueList.data).includes('"leaseToken"'));
        assert.equal((await api("/api/integracao/fila","POST",{action:"PROCESS"},finance)).status,200);
        assert.equal((await api("/api/integracao/fila","POST",{action:"RETRY",id:accepted.job.id,reason:"Tentativa indevida"},finance)).status,403);
        assert.equal((await db.integrationJob.findUniqueOrThrow({where:{id:accepted.job.id}})).status,"SUCCEEDED");
      }finally{server.kill();await new Promise<void>(resolve=>{if(server.exitCode!==null)resolve();else server.once("exit",()=>resolve());});}
    });
    await t.test("snapshot sintético restaura valores, datas, vínculos e identificadores de idempotência",async()=>{
      const dump=await exportDatabaseDump(db),restoreUrl=`file:${path.join(dir,"restore.db").replaceAll("\\","/")}`;
      fs.writeFileSync(path.join(dir,"restore.db"),"",{flag:"wx"});
      execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{env:{...process.env,DATABASE_URL:restoreUrl},stdio:"pipe"});
      const restored=new PrismaClient({datasources:{db:{url:restoreUrl}}});
      try{
        const counts=await restoreDatabaseDump(restored,dump,true);
        assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),dump.totalRows);
        assert.equal((await restored.bankAccount.findUniqueOrThrow({where:{id:account.id}})).balanceCents,49900n);
        assert.equal(await restored.integrationDelivery.count(),dump.tables.integrationDelivery.count);
        const again=await exportDatabaseDump(restored);
        for(const key of Object.keys(dump.tables))assert.deepEqual(again.tables[key].rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),dump.tables[key].rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),key);
        await assert.rejects(restoreDatabaseDump(restored,dump,true),/banco vazio/);
      }finally{await restored.$disconnect();}
    });
    await t.test("período fechado aborta o fato contábil e toda a venda operacional",async()=>{
      const now=new Date(),month=now.toISOString().slice(0,7),startAt=new Date(`${month}-01T00:00:00.000Z`),endAt=new Date(Date.UTC(startAt.getUTCFullYear(),startAt.getUTCMonth()+1,1));
      await db.accountingPeriod.create({data:{name:month,startAt,endAt,status:"CLOSED"}});
      const titles=await db.financialTitle.count(),sales=await db.financialSale.count();
      await assert.rejects(registerSale({eventId:origin.id,externalReference:"closed-period-sale",mdrRuleId:mdr.id,unitPriceCents:"1000",quantity:1},au),/Período contábil fechado/);
      assert.equal(await db.financialTitle.count(),titles);assert.equal(await db.financialSale.count(),sales);
    });
  }finally{await db.$disconnect();if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;
    fs.rmSync(dir,{recursive:true,force:true});}
});
