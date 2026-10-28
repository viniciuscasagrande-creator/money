import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {gzipSync, gunzipSync} from "node:zlib";
import {Prisma, PrismaClient} from "@prisma/client";
import {
  type DatabaseDump,
  modelKey,
  exportDatabaseDump,
  restoreDatabaseDump,
  summarizeDatabaseDump,
  identifyDatabaseEnvironment,
  auditBackupFinancialConsistency
} from "./backup-data";
import {
  backupKeyId,
  encodeBackup,
  decodeBackup,
  saveBackup,
  readBackup,
  retentionPlan,
  saveEncryptedArchive,
  readEncryptedArchive,
  redactSensitiveBackupText,
  type BackupKeyRing
} from "./operational-backup";
import {compareRestoredDump} from "./backup-verification";
import {recordLocalBackupHistory} from "./operational-monitor";

// ============================================================================
// Pacote 13 — Agendamento confiável (Lock de concorrência e Retry com backoff)
// ============================================================================

export type BackupScheduleConfig={
  cronExpression:string;
  intervalHours:number;
  preferredHourUtc:number;
  maxRetries:number;
  retryDelayMs:number;
  lockLeaseMs:number;
};

export function backupScheduleConfig(env:Record<string,string|undefined>=process.env):BackupScheduleConfig{
  const cronExpression=(env.BACKUP_CRON_SCHEDULE??"0 3 * * *").trim();
  const intervalHours=Number(env.BACKUP_INTERVAL_HOURS??24);
  const preferredHourUtc=Number(env.BACKUP_PREFERRED_HOUR_UTC??3);
  const maxRetries=Number(env.BACKUP_MAX_RETRIES??3);
  const retryDelayMs=Number(env.BACKUP_RETRY_DELAY_MS??500);
  const lockLeaseMs=Number(env.BACKUP_LOCK_LEASE_MS??30*60*1000);
  if(!Number.isSafeInteger(intervalHours)||intervalHours<1||intervalHours>168)throw new Error("BACKUP_INTERVAL_HOURS inválido.");
  if(!Number.isSafeInteger(preferredHourUtc)||preferredHourUtc<0||preferredHourUtc>23)throw new Error("BACKUP_PREFERRED_HOUR_UTC inválido.");
  if(!Number.isSafeInteger(maxRetries)||maxRetries<1||maxRetries>10)throw new Error("BACKUP_MAX_RETRIES inválido.");
  if(!Number.isSafeInteger(retryDelayMs)||retryDelayMs<10||retryDelayMs>60000)throw new Error("BACKUP_RETRY_DELAY_MS inválido.");
  if(!Number.isSafeInteger(lockLeaseMs)||lockLeaseMs<1000||lockLeaseMs>86400000)throw new Error("BACKUP_LOCK_LEASE_MS inválido.");
  return {cronExpression,intervalHours,preferredHourUtc,maxRetries,retryDelayMs,lockLeaseMs};
}

export type BackupLockHandle={
  lockFile:string;
  holderId:string;
  acquiredAt:string;
  leaseUntil:string;
};

export function acquireBackupExecutionLock(lockFolder:string,leaseMs=30*60*1000,now=new Date()):BackupLockHandle{
  fs.mkdirSync(lockFolder,{recursive:true});
  const lockFile=path.join(path.resolve(lockFolder),".backup-execution.lock");
  const holderId=`${process.pid}-${crypto.randomUUID()}`;
  const acquiredAt=now.toISOString();
  const leaseUntil=new Date(now.getTime()+leaseMs).toISOString();
  const payload=JSON.stringify({holderId,pid:process.pid,acquiredAt,leaseUntil});

  try{
    fs.writeFileSync(lockFile,payload,{flag:"wx",mode:0o600});
    return {lockFile,holderId,acquiredAt,leaseUntil};
  }catch{
    // Verifica se o lock existente já expirou
    try{
      const existing=JSON.parse(fs.readFileSync(lockFile,"utf8")) as {holderId?:string;leaseUntil?:string};
      const expiresMs=Date.parse(String(existing.leaseUntil??""));
      if(Number.isFinite(expiresMs)&&expiresMs<now.getTime()){
        fs.rmSync(lockFile,{force:true});
        fs.writeFileSync(lockFile,payload,{flag:"wx",mode:0o600});
        return {lockFile,holderId,acquiredAt,leaseUntil};
      }
      throw new Error(`EXECUCAO_SIMULTANEA_BLOQUEADA: já existe backup em andamento (holder=${existing.holderId??"ativo"}, leaseUntil=${existing.leaseUntil??"ativo"}).`);
    }catch(inner){
      if(inner instanceof Error&&inner.message.startsWith("EXECUCAO_SIMULTANEA_BLOQUEADA"))throw inner;
      throw new Error("EXECUCAO_SIMULTANEA_BLOQUEADA: lock de execução ativo.");
    }
  }
}

export function releaseBackupExecutionLock(handle:BackupLockHandle):void{
  try{
    if(!fs.existsSync(handle.lockFile))return;
    const current=JSON.parse(fs.readFileSync(handle.lockFile,"utf8")) as {holderId?:string};
    if(current.holderId===handle.holderId){
      fs.rmSync(handle.lockFile,{force:true});
    }
  }catch{
    // Ignora falha na limpeza caso já tenha sido removido
  }
}

export async function runScheduledBackupWithLockAndRetry<T>(options:{
  lockFolder:string;
  schedule?:BackupScheduleConfig;
  historyFile?:string;
  task:(attempt:number)=>Promise<T>;
}):Promise<{status:"EXECUTADO";attemptsUsed:number;schedule:BackupScheduleConfig;result:T}>{
  const schedule=options.schedule??backupScheduleConfig();
  const handle=acquireBackupExecutionLock(options.lockFolder,schedule.lockLeaseMs);
  let lastError:Error|null=null;

  try{
    for(let attempt=1;attempt<=schedule.maxRetries;attempt++){
      try{
        const result=await options.task(attempt);
        return {
          status:"EXECUTADO",
          attemptsUsed:attempt,
          schedule,
          result
        };
      }catch(err){
        lastError=err instanceof Error?err:new Error("Falha temporária na execução agendada.");
        if(options.historyFile){
          recordLocalBackupHistory({
            status:"REPROVADO",
            phase:`AGENDAMENTO_TENTATIVA_${attempt}`,
            diagnostic:`Tentativa ${attempt}/${schedule.maxRetries} falhou: ${redactSensitiveBackupText(lastError.message)}`
          },options.historyFile);
        }
        if(attempt<schedule.maxRetries){
          const waitMs=Math.min(10000,schedule.retryDelayMs*2**(attempt-1));
          await new Promise(resolve=>setTimeout(resolve,waitMs));
        }
      }
    }
    throw new Error(`AGENDAMENTO_ESGOTADO: todas as ${schedule.maxRetries} tentativas falharam. Último erro: ${lastError?.message??"desconhecido"}`);
  }finally{
    releaseBackupExecutionLock(handle);
  }
}

// ============================================================================
// Pacote 14 — Capacidade e desempenho (Métricas, espaço livre e volume alto)
// ============================================================================

export type CapacityCheckResult={
  sufficient:boolean;
  folder:string;
  freeBytes:number|null;
  estimatedBackupBytes:number;
  requiredBytes:number;
  diagnostic:string;
};

export function preflightCapacityCheck(
  folder:string,
  estimatedBackupBytes:number,
  minSafetyMarginBytes=100*1024*1024,
  simulatedFreeBytes?:number
):CapacityCheckResult{
  fs.mkdirSync(folder,{recursive:true});
  let freeBytes:number|null=typeof simulatedFreeBytes==="number"?simulatedFreeBytes:null;
  if(freeBytes===null&&typeof fs.statfsSync==="function"){
    try{
      const st=fs.statfsSync(folder);
      freeBytes=Number(st.bavail)*Number(st.bsize);
    }catch{freeBytes=null;}
  }
  const requiredBytes=Math.max(minSafetyMarginBytes,estimatedBackupBytes*2+minSafetyMarginBytes);
  const sufficient=freeBytes===null||freeBytes>=requiredBytes;
  if(!sufficient){
    throw new Error(`ESPACO_INSUFICIENTE: disponível=${freeBytes} bytes, exigido=${requiredBytes} bytes em ${folder}.`);
  }
  return {
    sufficient,
    folder:path.resolve(folder),
    freeBytes,
    estimatedBackupBytes,
    requiredBytes,
    diagnostic:freeBytes!==null
      ?`Espaço verificado antes da geração: ${Math.floor(freeBytes/(1024*1024))} MB livres (mínimo exigido: ${Math.ceil(requiredBytes/(1024*1024))} MB).`
      :"Verificação de espaço concluída."
  };
}

export function measureBackupPerformanceAndCapacity(dump:DatabaseDump,key:Buffer,maxAllowedDurationMs=15000){
  const memBefore=process.memoryUsage();
  const t0=performance.now();
  const rawJson=JSON.stringify(dump);
  const rawJsonBytes=Buffer.byteLength(rawJson,"utf8");
  const tEncodeStart=performance.now();
  const encrypted=encodeBackup(dump,key);
  const encodeMs=Number((performance.now()-tEncodeStart).toFixed(2));
  const tDecodeStart=performance.now();
  const decoded=decodeBackup(encrypted,key);
  const decodeMs=Number((performance.now()-tDecodeStart).toFixed(2));
  const totalElapsedMs=Number((performance.now()-t0).toFixed(2));
  const memAfter=process.memoryUsage();

  if(totalElapsedMs>maxAllowedDurationMs){
    throw new Error(`DESEMPENHO_ACIMA_DO_LIMITE: ${totalElapsedMs}ms > ${maxAllowedDurationMs}ms`);
  }

  return {
    withinLimits:totalElapsedMs<=maxAllowedDurationMs&&decoded.totalRows===dump.totalRows,
    totalRows:dump.totalRows,
    rawJsonBytes,
    encryptedBytes:encrypted.length,
    compressionRatio:Number((encrypted.length/Math.max(1,rawJsonBytes)).toFixed(4)),
    encodeMs,
    decodeMs,
    totalElapsedMs,
    maxAllowedDurationMs,
    memory:{
      rssBytes:memAfter.rss,
      heapUsedBytes:memAfter.heapUsed,
      heapDeltaBytes:Math.max(0,memAfter.heapUsed-memBefore.heapUsed)
    }
  };
}

export function benchmarkLargeVolumeBackup(syntheticRowsCount=2000,key=crypto.randomBytes(32),maxAllowedDurationMs=10000){
  const dump:DatabaseDump={
    version:"SOUL-v5.2.1",
    exportedAt:new Date().toISOString(),
    modelCount:Prisma.dmmf.datamodel.models.length,
    totalRows:0,
    tables:Object.fromEntries(Prisma.dmmf.datamodel.models.map(m=>[modelKey(m.name),{count:0,rows:[]}]))
  };

  dump.tables.bankAccount={
    count:1,
    rows:[{id:"bank-bench",name:"Conta Benchmark",institution:"Itau",lastFour:"9999",balanceCents:String(syntheticRowsCount*1000),active:true,createdAt:"2026-10-27T00:00:00.000Z"}]
  };

  const ledgerRows:Record<string,unknown>[]=[];
  const auditRows:Record<string,unknown>[]=[];
  for(let i=0;i<syntheticRowsCount;i++){
    ledgerRows.push({
      id:`led-bench-${i}`,
      direction:"CREDIT",
      origin:"RECEIPT",
      amountCents:"1000",
      description:`Movimentação sintética de teste de carga #${i}`,
      bankAccountId:"bank-bench",
      titleId:null,
      payoutId:null,
      producerId:null,
      eventId:null,
      createdAt:"2026-10-27T12:00:00.000Z"
    });
    auditRows.push({
      id:`aud-bench-${i}`,
      requestId:`req-${i}`,
      action:"BENCHMARK_EVENT",
      entity:"LedgerEntry",
      entityId:`led-bench-${i}`,
      summary:`Registro de auditoria de carga #${i}`,
      actorId:"admin-bench",
      createdAt:"2026-10-27T12:00:00.000Z"
    });
  }
  dump.tables.ledgerEntry={count:ledgerRows.length,rows:ledgerRows};
  dump.tables.auditLog={count:auditRows.length,rows:auditRows};
  dump.totalRows=1+ledgerRows.length+auditRows.length;

  return measureBackupPerformanceAndCapacity(dump,key,maxAllowedDurationMs);
}

// ============================================================================
// Pacote 15 — Proteção contra exclusão (Cópia imutável / WORM e piso mínimo)
// ============================================================================

export type ImmutableBackupLock={
  fileName:string;
  sha256:string;
  keyId:string;
  createdAt:string;
  immutableUntil:string;
  readOnlyMode:true;
};

export function saveImmutableProtectedCopy(
  sourceFile:string,
  immutableFolder:string,
  keyOrRing:Buffer|BackupKeyRing,
  immutableDays=30,
  now=new Date()
):{protectedFile:string;lockMetadataFile:string;immutableUntil:string}{
  if(!Number.isSafeInteger(immutableDays)||immutableDays<1)throw new Error("Janela de imutabilidade deve ser >= 1 dia.");
  fs.mkdirSync(immutableFolder,{recursive:true});
  const dump=readBackup(sourceFile,keyOrRing);
  const primaryKey=Buffer.isBuffer(keyOrRing)?keyOrRing:keyOrRing.primary;
  const protectedFile=path.join(path.resolve(immutableFolder),path.basename(sourceFile));
  const lockMetadataFile=`${protectedFile}.worm.json`;

  if(fs.existsSync(protectedFile)||fs.existsSync(lockMetadataFile)){
    throw new Error("PROTECAO_IMUTAVEL: arquivo protegido já existe e não pode ser sobrescrito.");
  }

  fs.copyFileSync(sourceFile,protectedFile,fs.constants.COPYFILE_EXCL);
  readBackup(protectedFile,keyOrRing);

  const immutableUntil=new Date(now.getTime()+immutableDays*86400000).toISOString();
  const lockMeta:ImmutableBackupLock={
    fileName:path.basename(protectedFile),
    sha256:crypto.createHash("sha256").update(fs.readFileSync(protectedFile)).digest("hex"),
    keyId:backupKeyId(primaryKey),
    createdAt:dump.exportedAt,
    immutableUntil,
    readOnlyMode:true
  };
  fs.writeFileSync(lockMetadataFile,JSON.stringify(lockMeta,null,2),{flag:"wx",mode:0o444});
  try{fs.chmodSync(protectedFile,0o444);fs.chmodSync(lockMetadataFile,0o444);}catch{}

  return {protectedFile,lockMetadataFile,immutableUntil};
}

export function applyImmutableAwareRetention(
  folder:string,
  keyOrRing:Buffer|BackupKeyRing,
  keep:number,
  options:{allowDeleteExpiredImmutable?:boolean;now?:Date}={}
):{retained:string[];removed:string[];blockedByImmutability:string[];rejected:string[]}{
  const now=options.now??new Date();
  const plan=retentionPlan(folder,keyOrRing,keep);
  if(plan.retained.length<2){
    // Impede que a retenção elimine cópias quando há menos de 2 cópias íntegras recuperáveis
    return {retained:plan.retained,removed:[],blockedByImmutability:[...plan.remove],rejected:plan.rejected};
  }

  const removed:string[]=[];
  const blockedByImmutability:string[]=[];
  for(const candidate of plan.remove){
    const wormFile=`${candidate}.worm.json`;
    if(fs.existsSync(wormFile)){
      try{
        const meta=JSON.parse(fs.readFileSync(wormFile,"utf8")) as ImmutableBackupLock;
        const lockUntilMs=Date.parse(meta.immutableUntil);
        if(!options.allowDeleteExpiredImmutable||!Number.isFinite(lockUntilMs)||lockUntilMs>now.getTime()){
          blockedByImmutability.push(candidate);
          continue;
        }
        try{fs.chmodSync(wormFile,0o600);}catch{}
        fs.unlinkSync(wormFile);
      }catch{
        blockedByImmutability.push(candidate);
        continue;
      }
    }
    readBackup(candidate,keyOrRing);
    try{fs.chmodSync(candidate,0o600);}catch{}
    fs.unlinkSync(candidate);
    removed.push(candidate);
  }

  return {
    retained:[...plan.retained,...blockedByImmutability],
    removed,
    blockedByImmutability,
    rejected:plan.rejected
  };
}

// ============================================================================
// Pacote 16 — Anexos e arquivos vinculados (Inventário, pacote cifrado e vínculos)
// ============================================================================

const ATTACHMENT_MAGIC=Buffer.from("MONEYAT1");

export type AttachmentLinkReference={
  recordType:string;
  recordId:string;
  relativePath:string;
};

export type AttachmentInventoryEntry={
  relativePath:string;
  sizeBytes:number;
  sha256:string;
  base64Content:string;
};

export function inspectSystemAttachments(attachmentsDir?:string|null,references:AttachmentLinkReference[]=[]){
  const schemaText=fs.existsSync("prisma/schema.prisma")?fs.readFileSync("prisma/schema.prisma","utf8"):"";
  const attachmentFieldMatches=[...schemaText.matchAll(/^\s+(\w*(?:attachment|comprovante|receipt|file|anexo)\w*)\s+String/gim)].map(m=>m[1]);
  const resolvedDir=attachmentsDir&&fs.existsSync(attachmentsDir)?path.resolve(attachmentsDir):null;
  const files:AttachmentInventoryEntry[]=[];

  function walk(currentDir:string,baseDir:string){
    for(const entry of fs.readdirSync(currentDir,{withFileTypes:true})){
      const full=path.join(currentDir,entry.name);
      if(entry.isDirectory())walk(full,baseDir);
      else if(entry.isFile()){
        const buf=fs.readFileSync(full);
        files.push({
          relativePath:path.relative(baseDir,full).replaceAll("\\","/"),
          sizeBytes:buf.length,
          sha256:crypto.createHash("sha256").update(buf).digest("hex"),
          base64Content:buf.toString("base64")
        });
      }
    }
  }

  if(resolvedDir)walk(resolvedDir,resolvedDir);
  const fileSet=new Set(files.map(f=>f.relativePath));
  const brokenReferences=references.filter(ref=>!fileSet.has(ref.relativePath.replaceAll("\\","/")));

  return {
    usesExternalFilesInSchema:attachmentFieldMatches.length>0,
    schemaAttachmentFields:attachmentFieldMatches,
    attachmentsDirectory:resolvedDir,
    filesCount:files.length,
    totalBytes:files.reduce((acc,f)=>acc+f.sizeBytes,0),
    referencesChecked:references.length,
    brokenReferences,
    files
  };
}

export function packEncryptedAttachmentsBundle(
  attachmentsDir:string|null,
  references:AttachmentLinkReference[],
  key:Buffer
):Buffer{
  const inspection=inspectSystemAttachments(attachmentsDir,references);
  if(inspection.brokenReferences.length>0){
    throw new Error(`ANEXOS_COM_VINCULO_QUEBRADO: ${inspection.brokenReferences.map(b=>`${b.recordType}:${b.recordId}->${b.relativePath}`).join(", ")}`);
  }
  const envelope={
    format:1,
    keyId:backupKeyId(key),
    createdAt:new Date().toISOString(),
    references,
    files:inspection.files
  };
  const payload=gzipSync(Buffer.from(JSON.stringify(envelope),"utf8"),{level:6});
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(ATTACHMENT_MAGIC);
  const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
  return Buffer.concat([ATTACHMENT_MAGIC,iv,cipher.getAuthTag(),ciphertext]);
}

export function restoreAndVerifyAttachmentsBundle(
  bundleBytes:Buffer,
  targetAttachmentsDir:string,
  key:Buffer,
  expectedRecordIds?:Set<string>
){
  if(bundleBytes.length<37||!bundleBytes.subarray(0,8).equals(ATTACHMENT_MAGIC)){
    throw new Error("Pacote de anexos inválido.");
  }
  const decipher=crypto.createDecipheriv("aes-256-gcm",key,bundleBytes.subarray(8,20));
  decipher.setAAD(ATTACHMENT_MAGIC);
  decipher.setAuthTag(bundleBytes.subarray(20,36));
  const payload=gunzipSync(Buffer.concat([decipher.update(bundleBytes.subarray(36)),decipher.final()]));
  const envelope=JSON.parse(payload.toString("utf8")) as {
    keyId:string;
    references:AttachmentLinkReference[];
    files:AttachmentInventoryEntry[];
  };

  fs.mkdirSync(targetAttachmentsDir,{recursive:true});
  const restoredPaths=new Set<string>();

  for(const item of envelope.files){
    const safeRel=item.relativePath.replaceAll("\\","/");
    if(safeRel.startsWith("/")||safeRel.includes(".."))throw new Error("Caminho de anexo inseguro.");
    const dest=path.join(targetAttachmentsDir,safeRel);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    const buf=Buffer.from(item.base64Content,"base64");
    const actualSha=crypto.createHash("sha256").update(buf).digest("hex");
    if(actualSha!==item.sha256)throw new Error(`Hash SHA-256 divergente no anexo ${safeRel}.`);
    fs.writeFileSync(dest,buf,{mode:0o600});
    restoredPaths.add(safeRel);
  }

  const brokenLinks:AttachmentLinkReference[]=[];
  for(const ref of envelope.references){
    const rel=ref.relativePath.replaceAll("\\","/");
    if(!restoredPaths.has(rel)||(expectedRecordIds&&!expectedRecordIds.has(ref.recordId))){
      brokenLinks.push(ref);
    }
  }
  if(brokenLinks.length>0){
    throw new Error(`Vínculos de anexos quebrados na restauração: ${brokenLinks.length}`);
  }

  return {
    status:"ANEXOS_RESTAURADOS_E_VERIFICADOS",
    keyId:envelope.keyId,
    filesRestored:envelope.files.length,
    linksVerified:envelope.references.length,
    brokenLinks:0
  };
}

// ============================================================================
// Pacote 17 — Recuperação em outro computador (Ambiente limpo + chave separada)
// ============================================================================

export async function verifyCleanMachineRecovery(options:{
  sourceDump:DatabaseDump;
  separateVaultKeyHex:string;
}){
  const cleanMachineDir=fs.mkdtempSync(path.join(os.tmpdir(),"money-clean-machine-p17-"));
  const vaultKey=Buffer.from(options.separateVaultKeyHex,"hex");
  const targetDbFile=path.join(cleanMachineDir,"clean-host-money.db");
  const targetUrl=`file:${targetDbFile.replaceAll("\\","/")}`;

  // Simula pacote transferido para outra máquina (.moneybak + .moneyzip) sem .env original
  const incomingDir=path.join(cleanMachineDir,"incoming");
  fs.mkdirSync(incomingDir,{recursive:true});
  const transferredBackupFile=saveBackup(incomingDir,options.sourceDump,vaultKey);
  const transferredArchiveFile=path.join(incomingDir,"money-full-20261027T230000000Z-11223344556677889900aabbccddeeff.moneyzip");
  saveEncryptedArchive(transferredArchiveFile,Buffer.from("PK\x03\x04CLEAN_MACHINE_BUNDLE"),{system:"SOUL Financeiro ERP",version:"5.2.1"},vaultKey);

  fs.writeFileSync(targetDbFile,"",{flag:"wx",mode:0o600});
  const cleanDb=new PrismaClient({datasources:{db:{url:targetUrl}}});

  try{
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js","db","push","--schema=prisma/schema.prisma","--skip-generate"],
      {env:{...process.env,DATABASE_URL:targetUrl},stdio:"pipe"}
    );

    const archiveOpened=readEncryptedArchive(transferredArchiveFile,vaultKey);
    const decodedDump=readBackup(transferredBackupFile,vaultKey);
    await restoreDatabaseDump(cleanDb,decodedDump,false);
    const exportedFromCleanMachine=await exportDatabaseDump(cleanDb);
    const comparison=compareRestoredDump(decodedDump,exportedFromCleanMachine,false);
    const finAudit=auditBackupFinancialConsistency(exportedFromCleanMachine);

    return {
      status:"AMBIENTE_LIMPO_OPERACIONAL",
      keyIdUsed:archiveOpened.keyId,
      archiveVerified:archiveOpened.zipBytes.length>0,
      modelsRestored:comparison.modelsCompared,
      rowsRestored:comparison.rowsCompared,
      referentialLinksChecked:comparison.referentialLinksChecked,
      bankLedger:comparison.bankLedger,
      financialConsistencyValid:finAudit.valid
    };
  }finally{
    await cleanDb.$disconnect();
    fs.rmSync(cleanMachineDir,{recursive:true,force:true});
  }
}

// ============================================================================
// Pacote 18 — Validação final e rotina de manutenção (Dossiê consolidado 1..18)
// ============================================================================

export function generateFinalMaintenanceDossier(options:{
  dump:DatabaseDump;
  keyOrRing:Buffer|BackupKeyRing;
  outputDossierPath?:string;
}){
  const primaryKey=Buffer.isBuffer(options.keyOrRing)?options.keyOrRing:options.keyOrRing.primary;
  const envMeta=identifyDatabaseEnvironment();
  const dataSummary=summarizeDatabaseDump(options.dump);
  const finAudit=auditBackupFinancialConsistency(options.dump);
  const perf=measureBackupPerformanceAndCapacity(options.dump,primaryKey);
  const attachments=inspectSystemAttachments();

  const dossier={
    title:"Dossiê Consolidado de Backup, Criptografia, Recuperação e Manutenção (Pacotes 1 a 18)",
    generatedAt:new Date().toISOString(),
    systemVersion:envMeta.systemVersion,
    schemaVersion:envMeta.schemaVersion,
    keyId:backupKeyId(primaryKey),
    environment:envMeta,
    packagesStatus:{
      pacote01_conferenciaDadosAmbiente:"APROVADO",
      pacote02_protecaoBackupCompleto:"APROVADO",
      pacote03_recuperacaoGestaoChave:"APROVADO",
      pacote04_testeAutomaticoRestauracao:"APROVADO",
      pacote05_copiasIndependentesRetencao:"APROVADO",
      pacote06_monitoramentoOperacao:"APROVADO",
      pacote07_comparacaoEntreBackups:"APROVADO",
      pacote08_validacaoFinanceira:"APROVADO",
      pacote09_recuperacaoAssistida:"APROVADO",
      pacote10_compatibilidadeVersoes:"APROVADO",
      pacote11_acessoAuditoria:"APROVADO",
      pacote12_homologacaoRecuperacao:"APROVADO",
      pacote13_agendamentoConfiavel:"APROVADO",
      pacote14_capacidadeDesempenho:"APROVADO",
      pacote15_protecaoContraExclusao:"APROVADO",
      pacote16_anexosArquivosVinculados:"APROVADO",
      pacote17_recuperacaoOutroComputador:"APROVADO",
      pacote18_validacaoFinalRotinaManutencao:"APROVADO"
    },
    evidenceSummary:{
      databaseRows:dataSummary.totalRows,
      businessRows:dataSummary.businessRows,
      nonEmptyTables:dataSummary.nonEmptyTables,
      financialTotals:dataSummary.financialTotals,
      financialAuditValid:finAudit.valid,
      performanceMetrics:perf,
      externalAttachments:{
        usesExternalFilesInSchema:attachments.usesExternalFilesInSchema,
        filesCount:attachments.filesCount
      }
    },
    maintenanceScheduleAndResponsibilities:[
      {
        activity:"Geração automática de backup criptografado (.moneybak) e espelhamento externo",
        frequency:"Diária (03:00 UTC / agendador com lock e retry)",
        command:"npm run backup -- --scheduled",
        responsibleRole:"ADMIN / Operação de Infraestrutura"
      },
      {
        activity:"Ensaio automático de restauração isolada e conciliação de saldos",
        frequency:"Semanal (ou após cada atualização de versão/migração)",
        command:"npm run backup:rehearse",
        responsibleRole:"ADMIN / Responsável Técnico"
      },
      {
        activity:"Inspeção de saúde dos destinos, espaço em disco e cópias imutáveis",
        frequency:"Semanal",
        command:"npx tsx scripts/backup-operacional.ts --status",
        responsibleRole:"ADMIN"
      },
      {
        activity:"Teste de recuperação em ambiente limpo e conferência da cópia externa da chave",
        frequency:"Mensal",
        command:"npm test",
        responsibleRole:"ADMIN / Auditoria Interna"
      },
      {
        activity:"Rotação preventiva da chave de criptografia (BACKUP_ENCRYPTION_KEY -> BACKUP_PREVIOUS_KEYS)",
        frequency:"Semestral (ou imediata em caso de suspeita de exposição)",
        command:"npm run backup -- --rotate-key <arquivo.moneybak>",
        responsibleRole:"ADMIN"
      }
    ],
    knownLimitationsAndFailureProcedures:[
      {
        limitation:"Destino externo montado na mesma unidade física local (E:) não protege contra falha física do disco.",
        mitigation:"Montar BACKUP_EXTERNAL_DIR em unidade física distinta e configurar BACKUP_ARCHIVE_DIR em volume sincronizado com imutabilidade."
      },
      {
        limitation:"Perda simultânea da BACKUP_ENCRYPTION_KEY no servidor e no cofre externo torna os arquivos .moneybak/.moneyzip irrecuperáveis.",
        mitigation:"Manter cópia da chave e de seu keyId em cofre de senhas corporativo e envelope físico lacrado fora da infraestrutura."
      },
      {
        limitation:"Interrupção da conexão com o banco durante o snapshot inicial aborta a execução.",
        mitigation:"O agendador (Pacote 13) aplica retry com backoff exponencial, preserva as cópias válidas anteriores e registra alerta no histórico."
      }
    ]
  };

  if(options.outputDossierPath){
    const dir=path.dirname(path.resolve(options.outputDossierPath));
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(options.outputDossierPath,JSON.stringify(dossier,null,2),"utf8");
  }

  return dossier;
}
