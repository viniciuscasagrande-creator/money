import fs from "node:fs";
import path from "node:path";
import {Prisma,type PrismaClient} from "@prisma/client";
import {randomUUID} from "node:crypto";
import {operationalLog} from "./observability";
import {
  backupKeyRing,
  inspectBackupMetadata,
  isSameStorageVolume,
  redactSensitiveBackupText,
  type BackupKeyRing
} from "./operational-backup";

export type MonitorConfig={queueMinutes:number;accountingMinutes:number;workerMinutes:number;backupHours:number;requireWorker:boolean;requireBackup:boolean};
export function monitorConfig(env:Record<string,string|undefined>=process.env):MonitorConfig{
  const number=(key:string,fallback:number,max:number)=>{const n=Number(env[key]??fallback);if(!Number.isSafeInteger(n)||n<1||n>max)throw new Error("Configuração de monitoramento inválida.");return n;};
  const flag=(key:string)=>{if(env[key]&&!['0','1'].includes(env[key]!))throw new Error("Configuração de monitoramento inválida.");return env[key]==="1";};
  return {queueMinutes:number("MONITOR_QUEUE_MINUTES",30,10080),accountingMinutes:number("MONITOR_ACCOUNTING_MINUTES",1440,43200),workerMinutes:number("MONITOR_WORKER_MINUTES",15,10080),backupHours:number("MONITOR_BACKUP_HOURS",26,8760),requireWorker:flag("MONITOR_WORKER_REQUIRED"),requireBackup:flag("MONITOR_BACKUP_REQUIRED")};
}
export type Signal={code:string;count:number;active:boolean;enabled:boolean};
const codes=["INTEGRATION_DEAD","INTEGRATION_OVERDUE","INTEGRATION_EXPIRED_LEASE","ACCOUNTING_ERROR","ACCOUNTING_OVERDUE","WORKER_STALE","BACKUP_STALE"] as const;
export async function monitorHeartbeat(db:Pick<PrismaClient,"financeSetting">,kind:"worker"|"backup"|"rehearsal",now=new Date()){
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

export type BackupExecutionLogEntry={
  id:string;
  timestamp:string;
  status:"COPIADO_E_VERIFICADO"|"REPROVADO";
  phase:string;
  environment?:string;
  targetHost?:string;
  keyId?:string;
  modelCount?:number;
  totalRows?:number;
  businessRows?:number;
  regressionDetected?:boolean;
  destinations?:{local?:string|null;external?:string|null;archive?:string|null};
  rehearsalStatus?:string|null;
  diagnostic:string;
};

export type DestinationStatus={
  role:"local"|"external"|"archive";
  configured:boolean;
  connected:boolean;
  folder:string|null;
  freeBytes:number|null;
  lowSpace:boolean;
  sameVolumeAsLocal:boolean;
  validCopiesCount:number;
  latestBackup:{
    fileName:string;
    exportedAt:string;
    ageHours:number;
    keyId:string;
    modelCount:number;
    totalRows:number;
    stale:boolean;
  }|null;
  diagnostic:string;
};

export type BackupOperationalAlert={
  code:
    |"DESTINATION_DISCONNECTED"
    |"DESTINATION_EMPTY_OR_INVALID"
    |"BACKUP_STALE"
    |"BACKUP_EXECUTION_FAILED"
    |"LOW_DISK_SPACE"
    |"SAME_STORAGE_VOLUME"
    |"REHEARSAL_MISSING_OR_FAILED"
    |"REHEARSAL_STALE"
    |"DATA_REGRESSION_ALERT";
  severity:"CRITICAL"|"WARNING";
  target:string;
  message:string;
  diagnostic:string;
};

const BACKUP_FILE_PATTERN=/^money-\d{8}T\d{9}Z-[a-f0-9]{32}\.moneybak$/;

export function recordLocalBackupHistory(entry:Omit<BackupExecutionLogEntry,"id"|"timestamp">&{timestamp?:string},historyFile=path.resolve("backups/execution-history.json")):BackupExecutionLogEntry{
  const dir=path.dirname(historyFile);
  fs.mkdirSync(dir,{recursive:true});
  const record:BackupExecutionLogEntry={
    id:randomUUID(),
    timestamp:entry.timestamp??new Date().toISOString(),
    ...entry,
    diagnostic:redactSensitiveBackupText(entry.diagnostic)
  };
  let existing:BackupExecutionLogEntry[]=[];
  if(fs.existsSync(historyFile)){
    try{
      const parsed=JSON.parse(fs.readFileSync(historyFile,"utf8"));
      if(Array.isArray(parsed))existing=parsed;
    }catch{existing=[];}
  }
  const updated=[record,...existing].slice(0,30);
  fs.writeFileSync(historyFile,JSON.stringify(updated,null,2),"utf8");
  return record;
}

function getFreeBytesForFolder(folder:string,overrideFreeBytes?:number):number|null{
  if(typeof overrideFreeBytes==="number")return overrideFreeBytes;
  try{
    if(typeof fs.statfsSync==="function"){
      const stat=fs.statfsSync(folder);
      return Number(stat.bavail)*Number(stat.bsize);
    }
  }catch{
    // Ignora se plataforma não suportar statfsSync no caminho
  }
  return null;
}

export function inspectBackupOperationsHealth(options:{
  localDir?:string;
  externalDir?:string|null;
  archiveDir?:string|null;
  rehearsalsDir?:string;
  historyFile?:string;
  keyOrRing?:Buffer|BackupKeyRing;
  backupMaxHours?:number;
  rehearsalMaxHours?:number;
  minFreeBytes?:number;
  simulatedFreeBytes?:Partial<Record<"local"|"external"|"archive",number>>;
  now?:Date;
}={}){
  const now=options.now??new Date();
  const localDir=path.resolve(options.localDir??process.env.BACKUP_LOCAL_DIR??"backups/operacional");
  const externalDir=(options.externalDir!==undefined?options.externalDir:process.env.BACKUP_EXTERNAL_DIR)?.trim()||null;
  const archiveDir=(options.archiveDir!==undefined?options.archiveDir:process.env.BACKUP_ARCHIVE_DIR)?.trim()||null;
  const rehearsalsDir=path.resolve(options.rehearsalsDir??"backups/rehearsals");
  const historyFile=path.resolve(options.historyFile??"backups/execution-history.json");
  const backupMaxHours=options.backupMaxHours??Number(process.env.MONITOR_BACKUP_HOURS??26);
  const rehearsalMaxHours=options.rehearsalMaxHours??Number(process.env.MONITOR_REHEARSAL_HOURS??168);
  const minFreeBytes=options.minFreeBytes??Number(process.env.BACKUP_MIN_FREE_BYTES??100*1024*1024);

  let ring:Buffer|BackupKeyRing|null=options.keyOrRing??null;
  if(!ring){
    try{ring=backupKeyRing();}catch{ring=null;}
  }

  const alerts:BackupOperationalAlert[]=[];
  const destinations:Record<"local"|"external"|"archive",DestinationStatus>={
    local:inspectSingleDestination("local",localDir,true,localDir,ring,backupMaxHours,minFreeBytes,options.simulatedFreeBytes?.local,now,alerts),
    external:inspectSingleDestination("external",externalDir,true,localDir,ring,backupMaxHours,minFreeBytes,options.simulatedFreeBytes?.external,now,alerts),
    archive:inspectSingleDestination("archive",archiveDir,false,localDir,ring,backupMaxHours,minFreeBytes,options.simulatedFreeBytes?.archive,now,alerts)
  };

  // Último ensaio de restauração aprovado
  let latestRehearsal:{
    status:string;
    completedAt:string;
    ageHours:number;
    elapsedMs:number;
    modelsCompared:number;
    rowsCompared:number;
    referentialLinksChecked?:number;
    keyId?:string;
    bankLedger:string;
    stale:boolean;
  }|null=null;

  if(fs.existsSync(rehearsalsDir)){
    try{
      const files=fs.readdirSync(rehearsalsDir).filter(f=>f.endsWith(".json")).map(f=>path.join(rehearsalsDir,f));
      const reports:Record<string,unknown>[]=[];
      for(const f of files){
        try{
          const r=JSON.parse(fs.readFileSync(f,"utf8"));
          if(r&&typeof r==="object"&&typeof r.completedAt==="string")reports.push(r);
        }catch{}
      }
      reports.sort((a,b)=>Date.parse(String(b.completedAt))-Date.parse(String(a.completedAt)));
      const newest=reports[0];
      if(newest){
        const completedMs=Date.parse(String(newest.completedAt));
        const ageHours=Number.isFinite(completedMs)?Math.max(0,Number(((now.getTime()-completedMs)/3600000).toFixed(2))):Infinity;
        const stale=ageHours>rehearsalMaxHours;
        latestRehearsal={
          status:String(newest.status??"DESCONHECIDO"),
          completedAt:String(newest.completedAt),
          ageHours,
          elapsedMs:Number(newest.elapsedMs??0),
          modelsCompared:Number(newest.modelsCompared??0),
          rowsCompared:Number(newest.rowsCompared??0),
          referentialLinksChecked:typeof newest.referentialLinksChecked==="number"?newest.referentialLinksChecked:undefined,
          keyId:typeof newest.keyId==="string"?newest.keyId:undefined,
          bankLedger:String(newest.bankLedger??"desconhecido"),
          stale
        };
        if(latestRehearsal.status!=="APROVADO"){
          alerts.push({
            code:"REHEARSAL_MISSING_OR_FAILED",
            severity:"CRITICAL",
            target:"rehearsal",
            message:"Último ensaio de restauração reprovado.",
            diagnostic:`O ensaio registrado em ${latestRehearsal.completedAt} terminou com status ${latestRehearsal.status}.`
          });
        }else if(stale){
          alerts.push({
            code:"REHEARSAL_STALE",
            severity:"WARNING",
            target:"rehearsal",
            message:`Ensaio de restauração desatualizado (${ageHours}h > ${rehearsalMaxHours}h).`,
            diagnostic:"Execute npm run backup:rehearse para comprovar a recuperabilidade recente do backup."
          });
        }
      }
    }catch{}
  }
  if(!latestRehearsal){
    alerts.push({
      code:"REHEARSAL_MISSING_OR_FAILED",
      severity:"WARNING",
      target:"rehearsal",
      message:"Nenhum ensaio de restauração isolada encontrado.",
      diagnostic:"Execute npm run backup:rehearse para validar tabelas, saldos e relacionamentos em banco isolado."
    });
  }

  // Histórico das execuções
  let history:BackupExecutionLogEntry[]=[];
  if(fs.existsSync(historyFile)){
    try{
      const parsed=JSON.parse(fs.readFileSync(historyFile,"utf8"));
      if(Array.isArray(parsed))history=parsed;
    }catch{history=[];}
  }
  const latestRun=history[0]??null;
  if(latestRun?.status==="REPROVADO"){
    alerts.push({
      code:"BACKUP_EXECUTION_FAILED",
      severity:"CRITICAL",
      target:latestRun.phase,
      message:`Última execução de backup falhou na fase ${latestRun.phase}.`,
      diagnostic:latestRun.diagnostic
    });
  }
  if(latestRun?.regressionDetected){
    alerts.push({
      code:"DATA_REGRESSION_ALERT",
      severity:"CRITICAL",
      target:"database",
      message:"Redução inesperada de registros detectada no backup.",
      diagnostic:latestRun.diagnostic
    });
  }

  const hasCritical=alerts.some(a=>a.severity==="CRITICAL");
  const status=hasCritical?"CRITICAL":alerts.length>0?"ATTENTION":"OK";

  return {
    checkedAt:now.toISOString(),
    status,
    keyIdConfigured:ring&&!Buffer.isBuffer(ring)?ring.primaryId:null,
    rotationKeysCount:ring&&!Buffer.isBuffer(ring)?ring.candidates.length:ring?1:0,
    destinations,
    latestRehearsal,
    latestExecution:latestRun,
    history:history.slice(0,15),
    alerts,
    recoveryProcedure:{
      steps:[
        "1. Obter a BACKUP_ENCRYPTION_KEY (ou BACKUP_PREVIOUS_KEYS) no cofre de segredos externo fora do servidor.",
        "2. Localizar a cópia íntegra mais recente (.moneybak) no destino local, externo ou arquivo histórico.",
        "3. Executar o ensaio isolado: npm run backup:rehearse -- <caminho-do-arquivo.moneybak>.",
        "4. Restaurar em banco isolado: npm run backup:restore -- <arquivo.moneybak> prisma/restore-recuperacao.db --isolated.",
        "5. Verificar saldos e vínculos: npm run backup:verify -- <arquivo.moneybak> prisma/restore-recuperacao.db."
      ],
      documentationPath:"docs/deploy/RECUPERACAO_E_GESTAO_CHAVES_BACKUP.md"
    }
  };
}

function inspectSingleDestination(
  role:"local"|"external"|"archive",
  folder:string|null,
  required:boolean,
  localReferenceDir:string,
  ring:Buffer|BackupKeyRing|null,
  backupMaxHours:number,
  minFreeBytes:number,
  simulatedFreeBytes:number|undefined,
  now:Date,
  alerts:BackupOperationalAlert[]
):DestinationStatus{
  if(!folder){
    if(required){
      alerts.push({
        code:"DESTINATION_DISCONNECTED",
        severity:"CRITICAL",
        target:role,
        message:`Destino ${role} não configurado.`,
        diagnostic:`Defina o caminho absoluto do destino ${role} nas variáveis de ambiente.`
      });
    }
    return {
      role,
      configured:false,
      connected:false,
      folder:null,
      freeBytes:null,
      lowSpace:false,
      sameVolumeAsLocal:false,
      validCopiesCount:0,
      latestBackup:null,
      diagnostic:required?"Destino obrigatório não configurado.":"Destino adicional opcional não configurado."
    };
  }

  if(!path.isAbsolute(folder)||!fs.existsSync(folder)){
    alerts.push({
      code:"DESTINATION_DISCONNECTED",
      severity:"CRITICAL",
      target:role,
      message:`Destino ${role} desconectado ou inacessível.`,
      diagnostic:`O diretório configurado (${folder}) não está montado ou não existe.`
    });
    return {
      role,
      configured:true,
      connected:false,
      folder,
      freeBytes:null,
      lowSpace:false,
      sameVolumeAsLocal:false,
      validCopiesCount:0,
      latestBackup:null,
      diagnostic:"Diretório desconectado ou não encontrado."
    };
  }

  const freeBytes=getFreeBytesForFolder(folder,simulatedFreeBytes);
  const lowSpace=freeBytes!==null&&freeBytes<minFreeBytes;
  if(lowSpace){
    alerts.push({
      code:"LOW_DISK_SPACE",
      severity:"CRITICAL",
      target:role,
      message:`Espaço em disco insuficiente no destino ${role}.`,
      diagnostic:`Livre: ${Math.floor((freeBytes??0)/(1024*1024))} MB; mínimo exigido: ${Math.floor(minFreeBytes/(1024*1024))} MB.`
    });
  }

  const sameVolumeAsLocal=role!=="local"&&fs.existsSync(localReferenceDir)?isSameStorageVolume(localReferenceDir,folder):false;
  if(role==="external"&&sameVolumeAsLocal){
    alerts.push({
      code:"SAME_STORAGE_VOLUME",
      severity:"WARNING",
      target:role,
      message:"Destino externo está no mesmo disco/volume físico da cópia local.",
      diagnostic:"Para proteção contra perda do disco, monte BACKUP_EXTERNAL_DIR em outra unidade física ou armazenamento em nuvem sincronizado."
    });
  }

  if(!ring){
    alerts.push({
      code:"DESTINATION_EMPTY_OR_INVALID",
      severity:"CRITICAL",
      target:role,
      message:"Chave de criptografia ausente ou inválida para inspecionar cópias.",
      diagnostic:"Verifique BACKUP_ENCRYPTION_KEY (64 caracteres hexadecimais)."
    });
    return {
      role,
      configured:true,
      connected:true,
      folder,
      freeBytes,
      lowSpace,
      sameVolumeAsLocal,
      validCopiesCount:0,
      latestBackup:null,
      diagnostic:"Chave de criptografia indisponível para verificar arquivos."
    };
  }

  const validCopies:{fileName:string;exportedAt:string;atMs:number;keyId:string;modelCount:number;totalRows:number}[]=[];
  try{
    for(const name of fs.readdirSync(folder)){
      if(!BACKUP_FILE_PATTERN.test(name))continue;
      const full=path.join(folder,name);
      try{
        const meta=inspectBackupMetadata(full,ring);
        validCopies.push({
          fileName:name,
          exportedAt:meta.exportedAt,
          atMs:Date.parse(meta.exportedAt),
          keyId:meta.keyId,
          modelCount:meta.modelCount,
          totalRows:meta.totalRows
        });
      }catch{
        // Ignora arquivo corrompido ou de outra chave desconhecida
      }
    }
  }catch{
    alerts.push({
      code:"DESTINATION_DISCONNECTED",
      severity:"CRITICAL",
      target:role,
      message:`Erro de leitura ao listar o destino ${role}.`,
      diagnostic:"Verifique permissões de leitura e montagem do volume."
    });
  }

  validCopies.sort((a,b)=>b.atMs-a.atMs||b.fileName.localeCompare(a.fileName));
  const newest=validCopies[0];
  if(!newest){
    alerts.push({
      code:"DESTINATION_EMPTY_OR_INVALID",
      severity:"CRITICAL",
      target:role,
      message:`Nenhuma cópia de backup válida encontrada no destino ${role}.`,
      diagnostic:"Execute npm run backup para gerar e espelhar uma cópia autenticada."
    });
    return {
      role,
      configured:true,
      connected:true,
      folder,
      freeBytes,
      lowSpace,
      sameVolumeAsLocal,
      validCopiesCount:0,
      latestBackup:null,
      diagnostic:"Nenhuma cópia válida autenticada encontrada."
    };
  }

  const ageHours=Math.max(0,Number(((now.getTime()-newest.atMs)/3600000).toFixed(2)));
  const stale=ageHours>backupMaxHours;
  if(stale){
    alerts.push({
      code:"BACKUP_STALE",
      severity:"CRITICAL",
      target:role,
      message:`Backup no destino ${role} está atrasado (${ageHours}h > ${backupMaxHours}h).`,
      diagnostic:`Última cópia válida: ${newest.fileName} (${newest.exportedAt}).`
    });
  }

  return {
    role,
    configured:true,
    connected:true,
    folder,
    freeBytes,
    lowSpace,
    sameVolumeAsLocal,
    validCopiesCount:validCopies.length,
    latestBackup:{
      fileName:newest.fileName,
      exportedAt:newest.exportedAt,
      ageHours,
      keyId:newest.keyId,
      modelCount:newest.modelCount,
      totalRows:newest.totalRows,
      stale
    },
    diagnostic:stale?"Backup válido encontrado, porém fora da janela máxima de atualização.":"Cópia íntegra e dentro da janela operacional."
  };
}
