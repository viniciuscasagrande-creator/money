import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {PrismaClient} from "@prisma/client";
import {monitorConfig,webhookConfig,evaluateOperationalMonitor,monitorHeartbeat,dispatchOperationalNotifications,retryOperationalNotification} from "../src/lib/operational-monitor";

test("configuração de alertas recusa destinos inseguros e limites inválidos",()=>{
  assert.throws(()=>monitorConfig({MONITOR_QUEUE_MINUTES:"0"}),/inválida/);
  assert.throws(()=>monitorConfig({MONITOR_WORKER_REQUIRED:"sim"}),/inválida/);
  const env={MONITOR_WEBHOOK_URL:"https://synthetic.invalid/alerts",MONITOR_WEBHOOK_TOKEN:"TOKEN-SINTETICO-LONGO-SEM-CREDENCIAL"};
  assert.equal(webhookConfig(env).environment,"money");
  for(const url of ["http://127.0.0.1/","https://user:password@synthetic.invalid/","https://synthetic.invalid/?token=secret","https://synthetic.invalid/#token"])
    assert.throws(()=>webhookConfig({...env,MONITOR_WEBHOOK_URL:url}));
  assert.throws(()=>webhookConfig({...env,MONITOR_WEBHOOK_TOKEN:"curto"}));
});
test("monitor persiste transições, evita duplicações e entrega com lease, backoff e reabertura auditada",async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"money-monitor-")),file=path.join(folder,"monitor.db"),url=`file:${file.replaceAll("\\","/")}`;
  fs.writeFileSync(file,"",{flag:"wx"});
  execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{env:{...process.env,DATABASE_URL:url},stdio:"pipe"});
  const db=new PrismaClient({datasources:{db:{url}}}),config={...monitorConfig({}),requireWorker:true,requireBackup:true},now=new Date();
  const channel=webhookConfig({MONITOR_WEBHOOK_URL:"https://synthetic.invalid/alerts",MONITOR_WEBHOOK_TOKEN:"TOKEN-SINTETICO-NAO-ENVIADO"});
  try{
    const admin=await db.user.create({data:{email:"monitor@synthetic.invalid",name:"Monitor",passwordHash:"hash",role:"ADMIN"}});
    const finance=await db.user.create({data:{email:"finance@synthetic.invalid",name:"Financeiro",passwordHash:"hash",role:"FINANCE_DISK"}});
    await db.integrationJob.create({data:{provider:"synthetic",externalReference:"REFERENCIA-PRIVADA",actorId:admin.id,status:"DEAD",payload:"PAYLOAD-PRIVADO",payloadHash:"HASH-PRIVADO"}});
    const initial=await evaluateOperationalMonitor(db,config,now);assert.equal(initial.enqueued,3);
    assert.equal((await evaluateOperationalMonitor(db,config,now)).enqueued,0);
    await monitorHeartbeat(db,"worker",now);await monitorHeartbeat(db,"backup",now);
    await db.integrationJob.updateMany({data:{status:"SUCCEEDED"}});
    const recovered=await evaluateOperationalMonitor(db,config,now);assert.equal(recovered.enqueued,3);
    assert.ok(recovered.signals.every(s=>!s.active));
    const delivered:string[]=[],payloads:string[]=[];
    const send:typeof fetch=async(_url,options)=>{
      const body=String(options?.body),id=new Headers(options?.headers).get("Idempotency-Key")!;
      assert.equal(JSON.parse(body).id,id);assert.ok(!body.includes("PRIVADO"));
      delivered.push(id);payloads.push(body);await new Promise(resolve=>setTimeout(resolve,1));return new Response(null,{status:204});
    };
    await Promise.all([dispatchOperationalNotifications(db,channel,20,send),dispatchOperationalNotifications(db,channel,20,send)]);
    // Se um verificador viu lease alheio, a execução seguinte drena o restante.
    await dispatchOperationalNotifications(db,channel,20,send);
    assert.equal(await db.operationalNotification.count({where:{status:"SENT"}}),6);
    assert.equal(new Set(delivered).size,delivered.length);
    for(const signal of ["INTEGRATION_DEAD","WORKER_STALE","BACKUP_STALE"]){
      const ordered=payloads.map(s=>JSON.parse(s)).filter(x=>x.signal===signal);assert.deepEqual(ordered.map(x=>x.transition),["OPEN","RESOLVED"]);
    }
    const failed=await db.operationalNotification.create({data:{signal:"INTEGRATION_DEAD",transition:"OPEN",observedCount:1}});
    const failure:typeof fetch=async()=>new Response(null,{status:503});
    for(let attempt=1;attempt<=5;attempt++){
      await db.operationalNotification.update({where:{id:failed.id},data:{nextAttemptAt:new Date(0)}});
      await dispatchOperationalNotifications(db,channel,10,failure,new Date());
      const state=await db.operationalNotification.findUniqueOrThrow({where:{id:failed.id}});
      assert.equal(state.attempts,attempt);assert.equal(state.status,attempt===5?"DEAD":"PENDING");assert.equal(state.leaseToken,null);
      assert.ok(state.nextAttemptAt>now);
    }
    await assert.rejects(retryOperationalNotification(db,failed.id,finance.id),/Administrador/);
    await retryOperationalNotification(db,failed.id,admin.id);
    assert.equal(await db.auditLog.count({where:{action:"OPERATIONAL_ALERT_REQUEUED"}}),1);
    await dispatchOperationalNotifications(db,channel,10,send,new Date());
    assert.equal((await db.operationalNotification.findUniqueOrThrow({where:{id:failed.id}})).status,"SENT");
    // Interrupção após claim: lease expirado pode ser retomado sem trocar a chave idempotente.
    const abandoned=await db.operationalNotification.create({data:{signal:"BACKUP_STALE",transition:"OPEN",observedCount:1,status:"SENDING",attempts:1,leaseToken:"old",leaseUntil:new Date(0)}});
    await dispatchOperationalNotifications(db,channel,10,send,new Date());
    assert.equal((await db.operationalNotification.findUniqueOrThrow({where:{id:abandoned.id}})).status,"SENT");
    assert.equal(delivered.at(-1),abandoned.id);
  }finally{await db.$disconnect();fs.rmSync(folder,{recursive:true,force:true});}
});
