import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {enqueueTicketing,claimIntegrationJob,executeIntegrationClaim,processIntegrationQueue,retryIntegrationJob,retryDelay} from "../../src/lib/integration-queue";
export async function queueRegressions(db:PrismaClient,adminId:string,financeId:string){
  const prefix=`queue-${randomUUID()}`;
  const input=(suffix:string)=>({externalReference:`${prefix}-${suffix}`,producerName:`Produtor ${prefix}`,eventName:"Evento fila",description:"Recebível em fila",amountCents:"1234"});
  const jobs=await Promise.all(Array.from({length:5},()=>enqueueTicketing(db,input("same"),adminId)));
  assert.equal(new Set(jobs.map(j=>j.job.id)).size,1);
  await assert.rejects(enqueueTicketing(db,{...input("same"),amountCents:"9999"},adminId),/outro conteúdo/);
  const claims=(await Promise.all(Array.from({length:3},()=>claimIntegrationJob(db)))).filter(c=>c!==null);
  assert.equal(claims.length,1);assert.equal((await executeIntegrationClaim(db,claims[0]!)).status,"SUCCEEDED");
  const delivered=await db.integrationJob.findUniqueOrThrow({where:{id:jobs[0].job.id}});
  assert.equal(delivered.attempts,1);assert.ok(delivered.titleId);
  assert.equal(await db.integrationDelivery.count({where:{externalReference:input("same").externalReference}}),1);
  assert.equal((await enqueueTicketing(db,input("same"),adminId)).job.titleId,delivered.titleId);
  const interrupted=await enqueueTicketing(db,input("lease"),adminId),oldClaim=await claimIntegrationJob(db);assert.ok(oldClaim);
  await db.integrationJob.update({where:{id:interrupted.job.id},data:{leaseUntil:new Date(Date.now()-1000)}});
  const recovered=await claimIntegrationJob(db);assert.ok(recovered);
  assert.equal((await executeIntegrationClaim(db,oldClaim)).status,"STALE");
  assert.equal(await db.integrationDelivery.count({where:{externalReference:input("lease").externalReference}}),0);
  assert.equal((await executeIntegrationClaim(db,recovered)).status,"SUCCEEDED");
  assert.equal((await db.integrationJob.findUniqueOrThrow({where:{id:interrupted.job.id}})).totalAttempts,2);
  const temporary=await enqueueTicketing(db,input("temporary"),adminId);
  for(let attempt=1;attempt<=5;attempt++){
    const claim=await claimIntegrationJob(db);assert.ok(claim);let failNext=true;
    const faulty=new Proxy(db,{get(target,key){if(key==="$transaction")return (...args:unknown[])=>{if(failNext){failNext=false;throw new Error("SENSITIVE_DATABASE_ERROR");}return (target.$transaction as Function).apply(target,args);};return Reflect.get(target,key);}});
    assert.equal((await executeIntegrationClaim(faulty,claim)).status,attempt===5?"DEAD":"RETRY");
    const failed=await db.integrationJob.findUniqueOrThrow({where:{id:temporary.job.id}});
    assert.equal(failed.attempts,attempt);assert.equal(failed.lastErrorCode,"TEMPORARY_FAILURE");
    if(attempt<5){assert.ok(failed.nextAttemptAt.getTime()>Date.now());assert.equal(await claimIntegrationJob(db),null);await db.integrationJob.update({where:{id:failed.id},data:{nextAttemptAt:new Date(Date.now()-1000)}});}
  }
  assert.equal(await db.integrationDelivery.count({where:{externalReference:input("temporary").externalReference}}),0);
  await assert.rejects(retryIntegrationJob(db,temporary.job.id,financeId,"Revisão por financeiro"),/Administrador/);
  await retryIntegrationJob(db,temporary.job.id,adminId,"Conectividade restabelecida");
  assert.equal((await processIntegrationQueue(db,1))[0].status,"SUCCEEDED");
  const retried=await db.integrationJob.findUniqueOrThrow({where:{id:temporary.job.id}});assert.equal(retried.attempts,1);assert.equal(retried.totalAttempts,6);
  await assert.rejects(retryIntegrationJob(db,temporary.job.id,adminId,"Não deve duplicar"),/Apenas falhas/);
  assert.equal(retryDelay(1),30000);assert.equal(retryDelay(5),480000);
  const event=await db.event.findFirstOrThrow({where:{name:"Evento fila",producer:{name:input("rule").producerName}}});
  await db.event.update({where:{id:event.id},data:{status:"CLOSED"}});
  const business=await enqueueTicketing(db,input("rule"),adminId);assert.equal((await processIntegrationQueue(db,1))[0].status,"DEAD");
  assert.equal(await db.integrationDelivery.count({where:{externalReference:input("rule").externalReference}}),0);
  await db.event.update({where:{id:event.id},data:{status:"ACTIVE"}});
  await retryIntegrationJob(db,business.job.id,adminId,"Evento revisado e reaberto");assert.equal((await processIntegrationQueue(db,1))[0].status,"SUCCEEDED");
  const corrupt=await enqueueTicketing(db,input("corrupt"),adminId);await db.integrationJob.update({where:{id:corrupt.job.id},data:{payload:"{}"}});
  assert.equal((await processIntegrationQueue(db,1))[0].status,"DEAD");
  assert.equal((await db.integrationJob.findUniqueOrThrow({where:{id:corrupt.job.id}})).lastErrorCode,"INVALID_PAYLOAD");
  const operator=await db.user.create({data:{name:"Operador fila",email:`${prefix}@queue.invalid`,passwordHash:"no-login",role:"FINANCE_DISK"}});
  await enqueueTicketing(db,input("inactive"),operator.id);await db.user.update({where:{id:operator.id},data:{active:false}});
  assert.equal((await processIntegrationQueue(db,1))[0].status,"DEAD");
  assert.equal(await db.integrationDelivery.count({where:{externalReference:input("inactive").externalReference}}),0);
  const audit=await db.auditLog.findMany({where:{entity:"IntegrationJob"}});assert.ok(!JSON.stringify(audit).includes("SENSITIVE_DATABASE_ERROR"));assert.ok(audit.some(a=>a.action==="INTEGRATION_REQUEUED"));
  const waiting=await enqueueTicketing(db,input("waiting-backup"),adminId);
  await db.integrationJob.update({where:{id:waiting.job.id},data:{nextAttemptAt:new Date(Date.now()+86400000)}});
  return "fila: concorrência, exclusividade, lease vencida, retry com espera, limite, reprocessamento, regras, operador e auditoria aprovados";
}
