import {Prisma,type PrismaClient} from "@prisma/client";
import {randomUUID} from "node:crypto";
import {operationalLog} from "./observability";

export type MonitorConfig={queueMinutes:number;accountingMinutes:number;workerMinutes:number;backupHours:number;requireWorker:boolean;requireBackup:boolean};
export function monitorConfig(env:Record<string,string|undefined>=process.env):MonitorConfig{
  const number=(key:string,fallback:number,max:number)=>{const n=Number(env[key]??fallback);if(!Number.isSafeInteger(n)||n<1||n>max)throw new Error("Configuração de monitoramento inválida.");return n;};
  const flag=(key:string)=>{if(env[key]&&!['0','1'].includes(env[key]!))throw new Error("Configuração de monitoramento inválida.");return env[key]==="1";};
  return {queueMinutes:number("MONITOR_QUEUE_MINUTES",30,10080),accountingMinutes:number("MONITOR_ACCOUNTING_MINUTES",1440,43200),workerMinutes:number("MONITOR_WORKER_MINUTES",15,10080),backupHours:number("MONITOR_BACKUP_HOURS",26,8760),requireWorker:flag("MONITOR_WORKER_REQUIRED"),requireBackup:flag("MONITOR_BACKUP_REQUIRED")};
}
export type Signal={code:string;count:number;active:boolean;enabled:boolean};
const codes=["INTEGRATION_DEAD","INTEGRATION_OVERDUE","INTEGRATION_EXPIRED_LEASE","ACCOUNTING_ERROR","ACCOUNTING_OVERDUE","WORKER_STALE","BACKUP_STALE"] as const;
export async function monitorHeartbeat(db:Pick<PrismaClient,"financeSetting">,kind:"worker"|"backup",now=new Date()){
  await db.financeSetting.upsert({where:{key:`monitor:heartbeat:${kind}`},create:{key:`monitor:heartbeat:${kind}`,value:now.toISOString()},update:{value:now.toISOString()}});
}
export async function collectMonitorSignals(db:Pick<Prisma.TransactionClient,"integrationJob"|"accountingBusinessEvent"|"financeSetting">,config=monitorConfig(),now=new Date()):Promise<Signal[]>{
  const counts=await Promise.all([
    db.integrationJob.count({where:{status:"DEAD"}}),
    db.integrationJob.count({where:{status:{in:["PENDING","RETRY"]},nextAttemptAt:{lt:new Date(now.getTime()-config.queueMinutes*60000)}}}),
    db.integrationJob.count({where:{status:"PROCESSING",leaseUntil:{lt:now}}}),
    db.accountingBusinessEvent.count({where:{status:"ERROR"}}),
    db.accountingBusinessEvent.count({where:{status:"PENDING",createdAt:{lt:new Date(now.getTime()-config.accountingMinutes*60000)}}})
  ]);
  for(const [kind,enabled,maxAge] of [["worker",config.requireWorker,config.workerMinutes*60000],["backup",config.requireBackup,config.backupHours*3600000]] as const){
    const row=enabled?await db.financeSetting.findUnique({where:{key:`monitor:heartbeat:${kind}`}}):null;
    const time=row?Date.parse(row.value):NaN;
    counts.push(enabled&&(!Number.isFinite(time)||time>now.getTime()+60000||now.getTime()-time>maxAge)?1:0);
  }
  return codes.map((code,index)=>({code,count:counts[index],active:counts[index]>0,enabled:index<5||index===5&&config.requireWorker||index===6&&config.requireBackup}));
}
export async function evaluateOperationalMonitor(db:PrismaClient,config=monitorConfig(),now=new Date()){
  for(let attempt=0;attempt<3;attempt++)try{
    return await db.$transaction(async tx=>{
      // Escrita no início serializa verificadores antes da leitura dos incidentes.
      await tx.financeSetting.upsert({where:{key:"monitor:evaluation-lock"},create:{key:"monitor:evaluation-lock",value:"1"},update:{value:"1"}});
      const signals=await collectMonitorSignals(tx,config,now);
      let enqueued=0;
      for(const signal of signals){
        if(!signal.enabled)continue;
        const key=`monitor:incident:${signal.code}`,previous=await tx.financeSetting.findUnique({where:{key}});
        if(previous&&!['OPEN','RESOLVED'].includes(previous.value))throw new Error("Estado operacional inválido.");
        const active=previous?.value==="OPEN";
        if(active===signal.active)continue;
        const transition=signal.active?"OPEN":"RESOLVED";
        await tx.financeSetting.upsert({where:{key},create:{key,value:transition},update:{value:transition}});
        await tx.operationalNotification.create({data:{signal:signal.code,transition,observedCount:signal.count,nextAttemptAt:now}});enqueued++;
      }
      return {checkedAt:now.toISOString(),signals,enqueued};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:30000});
  }catch(e){if(!(e instanceof Prisma.PrismaClientKnownRequestError)||!['P2034','P2002'].includes(e.code)||attempt===2)throw e;}
  throw new Error("Verificação concorrente; tente novamente.");
}
export type WebhookConfig={url:string;token:string;environment:string};
export function webhookConfig(env:Record<string,string|undefined>=process.env):WebhookConfig{
  const url=new URL(env.MONITOR_WEBHOOK_URL??"");
  if(url.protocol!=="https:"||url.username||url.password||url.hash||url.search)throw new Error("Configure webhook HTTPS sem credenciais ou parâmetros na URL.");
  const token=env.MONITOR_WEBHOOK_TOKEN??"",environment=env.MONITOR_ENVIRONMENT??"money";
  if(token.length<24||token.length>500||/[\r\n]/.test(token)||!/^\S+$/.test(token)||! /^[a-zA-Z0-9_-]{1,40}$/.test(environment))throw new Error("Configuração de webhook inválida.");
  return {url:url.toString(),token,environment};
}
export async function dispatchOperationalNotifications(db:PrismaClient,config:WebhookConfig,limit=10,send:typeof fetch=fetch,now=new Date()){
  if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error("Limite deve estar entre 1 e 20.");
  let sent=0,failed=0;
  const candidates=await db.operationalNotification.findMany({where:{OR:[{status:"PENDING",nextAttemptAt:{lte:now}},{status:"SENDING",leaseUntil:{lt:now}}]},orderBy:[{createdAt:"asc"},{id:"asc"}],take:limit});
  for(const candidate of candidates){
    const earlier=await db.operationalNotification.count({where:{signal:candidate.signal,status:{in:["PENDING","SENDING"]},OR:[{createdAt:{lt:candidate.createdAt}},{createdAt:candidate.createdAt,id:{lt:candidate.id}}]}});
    if(earlier)continue;
    if(candidate.attempts>=5){await db.operationalNotification.updateMany({where:{id:candidate.id,status:candidate.status,attempts:candidate.attempts},data:{status:"DEAD",leaseToken:null,leaseUntil:null}});continue;}
    const token=randomUUID(),claimNow=new Date(Math.max(Date.now(),now.getTime()));
    const claimed=await db.operationalNotification.updateMany({where:{id:candidate.id,status:candidate.status,attempts:candidate.attempts,leaseToken:candidate.leaseToken},data:{status:"SENDING",attempts:{increment:1},leaseToken:token,leaseUntil:new Date(claimNow.getTime()+60000)}});
    if(!claimed.count)continue;
    const owned={id:candidate.id,status:"SENDING",leaseToken:token};
    try{
      if(!codes.includes(candidate.signal as typeof codes[number])||!['OPEN','RESOLVED'].includes(candidate.transition)||!Number.isSafeInteger(candidate.observedCount)||candidate.observedCount<0)throw new Error("Notificação inválida.");
      const response=await send(config.url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(5000),headers:{"Content-Type":"application/json",Authorization:`Bearer ${config.token}`,"Idempotency-Key":candidate.id},body:JSON.stringify({version:1,id:candidate.id,environment:config.environment,signal:candidate.signal,transition:candidate.transition,count:candidate.observedCount,createdAt:candidate.createdAt.toISOString()})});
      await response.body?.cancel();
      if(!response.ok)throw new Error("Canal indisponível.");
      await db.operationalNotification.updateMany({where:owned,data:{status:"SENT",sentAt:new Date(),leaseToken:null,leaseUntil:null}});sent++;
      operationalLog("notification_sent",{count:1});
    }catch{
      const attempts=candidate.attempts+1;
      await db.operationalNotification.updateMany({where:owned,data:{status:attempts>=5?"DEAD":"PENDING",nextAttemptAt:new Date(claimNow.getTime()+Math.min(3600000,60000*2**(attempts-1))),leaseToken:null,leaseUntil:null}});failed++;
      operationalLog("notification_failed",{code:"WEBHOOK_UNAVAILABLE"});
    }
  }
  return {sent,failed};
}
export async function retryOperationalNotification(db:PrismaClient,id:string,actorId:string){
  return db.$transaction(async tx=>{
    const actor=await tx.user.findUnique({where:{id:actorId}});
    if(!actor?.active||actor.role!=="ADMIN")throw new Error("REGRA:Somente Administrador pode reabrir um alerta.");
    const updated=await tx.operationalNotification.updateMany({where:{id,status:"DEAD"},data:{status:"PENDING",attempts:0,nextAttemptAt:new Date(),leaseToken:null,leaseUntil:null}});
    if(!updated.count)throw new Error("REGRA:Somente alertas com tentativas esgotadas podem ser reenfileirados.");
    await tx.auditLog.create({data:{actorId,entity:"OperationalNotification",entityId:id,action:"OPERATIONAL_ALERT_REQUEUED",summary:"Reenvio de alerta operacional autorizado; identificador idempotente preservado."}});
    return {id,status:"PENDING"};
  });
}
