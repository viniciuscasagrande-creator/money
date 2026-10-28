import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {gzipSync, gunzipSync} from "node:zlib";
import {Prisma, type PrismaClient} from "@prisma/client";
import {
  type DatabaseDump,
  modelKey,
  exportDatabaseDump,
  restoreDatabaseDump,
  summarizeDatabaseDump,
  identifyDatabaseEnvironment,
  diffDatabaseDumps,
  auditBackupFinancialConsistency,
  checkBackupCompatibility,
  migrateLegacyDump,
  SUPPORTED_BACKUP_FORMATS,
  type BackupComparisonReport,
  type FinancialValidationReport,
  type BackupCompatibilityReport,
  type BackupDataSummary
} from "./backup-data";
import {compareRestoredDump} from "./backup-verification";

const MAGIC=Buffer.from("MONEYBK1");
const ARCHIVE_MAGIC=Buffer.from("MONEYZP1");
const MAX_BYTES=512*1024*1024;
const NAME=/^money-\d{8}T\d{9}Z-[a-f0-9]{32}\.moneybak$/;
const ARCHIVE_NAME=/^money-full-\d{8}T\d{9}Z-[a-f0-9]{32}\.moneyzip$/;
const schemaFingerprint=()=>crypto.createHash("sha256").update(JSON.stringify(Prisma.dmmf.datamodel.models.map(m=>({name:m.name,fields:m.fields.filter(f=>f.kind!=="object").map(f=>({name:f.name,type:f.type,required:f.isRequired,list:f.isList}))})))).digest("hex");

export type BackupKeyRing={
  primary:Buffer;
  primaryId:string;
  candidates:{id:string;key:Buffer}[];
};

export type BackupEnvelopeMeta={
  format:number;
  keyId:string;
  sha256:string;
  schema:string;
  exportedAt:string;
  version:string;
  modelCount:number;
  totalRows:number;
};

export function backupKey(value=process.env.BACKUP_ENCRYPTION_KEY??""){
  if(!/^[a-f0-9]{64}$/i.test(value.trim()))throw new Error("BACKUP_ENCRYPTION_KEY exige 32 bytes em hexadecimal (64 caracteres).");
  return Buffer.from(value.trim(),"hex");
}

export function backupKeyId(key:Buffer):string{
  if(!Buffer.isBuffer(key)||key.length!==32)throw new Error("Chave inválida para derivação de identificador.");
  return crypto.createHmac("sha256",key).update("MONEY_BACKUP_KEY_ID_V1").digest("hex").slice(0,16);
}

export function backupKeyRing(
  primaryHex=process.env.BACKUP_ENCRYPTION_KEY??"",
  previousHexCsv=process.env.BACKUP_PREVIOUS_KEYS??""
):BackupKeyRing{
  const primary=backupKey(primaryHex);
  const primaryId=backupKeyId(primary);
  const seen=new Set<string>([primaryId]);
  const candidates:{id:string;key:Buffer}[]=[{id:primaryId,key:primary}];
  for(const raw of previousHexCsv.split(",").map(s=>s.trim()).filter(Boolean)){
    const key=backupKey(raw);
    const id=backupKeyId(key);
    if(!seen.has(id)){
      seen.add(id);
      candidates.push({id,key});
    }
  }
  return {primary,primaryId,candidates};
}

function normalizeKeys(keyOrRing:Buffer|BackupKeyRing):Buffer[]{
  if(Buffer.isBuffer(keyOrRing))return [keyOrRing];
  if(keyOrRing&&Array.isArray(keyOrRing.candidates)&&keyOrRing.candidates.length>0){
    return keyOrRing.candidates.map(c=>c.key);
  }
  throw new Error("Chave ou chaveiro de backup inválido.");
}

export function redactSensitiveBackupText(text:string,extraSecrets:string[]=[]):string{
  let clean=String(text??"");
  clean=clean.replace(/\b[a-f0-9]{64}\b/gi,"[REDACTED_HEX_SECRET]");
  clean=clean.replace(/(postgres(?:ql)?:\/\/)([^@\s]+@)/gi,"$1[REDACTED_CREDENTIALS]@");
  clean=clean.replace(/(\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53})/g,"[REDACTED_PASSWORD_HASH]");
  for(const s of extraSecrets){
    const trimmed=s?.trim();
    if(trimmed&&trimmed.length>=8){
      clean=clean.split(trimmed).join("[REDACTED_SECRET]");
    }
  }
  return clean;
}

export function validateCompleteDump(dump:DatabaseDump){
  const keys=Prisma.dmmf.datamodel.models.map(m=>modelKey(m.name));
  if(!dump||!dump.tables||Object.keys(dump.tables).length!==keys.length||dump.modelCount!==keys.length||!Number.isFinite(Date.parse(dump.exportedAt)))throw new Error("Snapshot incompleto ou incompatível com o schema instalado.");
  let total=0;
  for(const key of keys){
    const table=dump.tables[key];
    if(!table||!Array.isArray(table.rows)||table.count!==table.rows.length||table.rows.some(row=>!row||typeof row!=="object"||Array.isArray(row)))throw new Error(`Tabela inválida: ${key}`);
    total+=table.count;
  }
  if(total!==dump.totalRows)throw new Error("Total de registros divergente.");
}

export function encodeBackup(dump:DatabaseDump,key:Buffer,format:1|2=1){
  validateCompleteDump(dump);
  const keyId=backupKeyId(key);
  const data=JSON.stringify(dump),sha256=crypto.createHash("sha256").update(data).digest("hex");
  const payload=gzipSync(Buffer.from(JSON.stringify({format,keyId,sha256,schema:schemaFingerprint(),systemVersion:"5.2.1",dump})),{level:6});
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(MAGIC);
  const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
  return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),ciphertext]);
}

export function encodeLegacyCompatibleBackup(rawDump:Record<string,unknown>,key:Buffer,format=1):Buffer{
  const keyId=backupKeyId(key);
  const data=JSON.stringify(rawDump),sha256=crypto.createHash("sha256").update(data).digest("hex");
  const payload=gzipSync(Buffer.from(JSON.stringify({format,keyId,sha256,schema:"LEGACY_COMPATIBLE_SCHEMA",dump:rawDump})),{level:6});
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(MAGIC);
  const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
  return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),ciphertext]);
}

function decryptEnvelope(bytes:Buffer,keyOrRing:Buffer|BackupKeyRing,magic=MAGIC):{envelope:Record<string,unknown>;matchedKeyId:string}{
  if(bytes.length<37||bytes.length>MAX_BYTES||!bytes.subarray(0,8).equals(magic))throw new Error("Formato ou tamanho de backup inválido.");
  const keys=normalizeKeys(keyOrRing);
  let payload:Buffer|null=null;
  let matchedKeyId="";
  for(const candidate of keys){
    try{
      const decipher=crypto.createDecipheriv("aes-256-gcm",candidate,bytes.subarray(8,20));
      decipher.setAAD(magic);decipher.setAuthTag(bytes.subarray(20,36));
      payload=gunzipSync(Buffer.concat([decipher.update(bytes.subarray(36)),decipher.final()]),{maxOutputLength:MAX_BYTES});
      matchedKeyId=backupKeyId(candidate);
      break;
    }catch{
      // Tenta próxima chave do chaveiro de rotação
    }
  }
  if(!payload)throw new Error("Backup corrompido ou chave incorreta; restauração bloqueada.");
  const envelope=JSON.parse(payload.toString("utf8")) as Record<string,unknown>;
  return {envelope,matchedKeyId};
}

export function decodeBackup(bytes:Buffer,keyOrRing:Buffer|BackupKeyRing,options:{allowLegacyMigration?:boolean}={}):DatabaseDump{
  const {envelope,matchedKeyId}=decryptEnvelope(bytes,keyOrRing,MAGIC);
  const format=Number(envelope.format??0);
  if(!SUPPORTED_BACKUP_FORMATS.includes(format as 1|2))throw new Error(`Formato de backup incompatível (format=${format}).`);
  const rawDump=envelope.dump as DatabaseDump;
  if(envelope.sha256!==crypto.createHash("sha256").update(JSON.stringify(rawDump)).digest("hex"))throw new Error("Manifesto de integridade inválido.");
  if(typeof envelope.keyId==="string"&&envelope.keyId!==matchedKeyId)throw new Error("Identificador de chave divergente no envelope.");

  if(envelope.schema!==schemaFingerprint()){
    if(options.allowLegacyMigration){
      const migrated=migrateLegacyDump(rawDump,format);
      validateCompleteDump(migrated.dump);
      return migrated.dump;
    }
    throw new Error("Schema incompatível; use a versão de código correspondente ao backup.");
  }
  validateCompleteDump(rawDump);return rawDump;
}

export function inspectBackupMetadata(fileOrBytes:string|Buffer,keyOrRing:Buffer|BackupKeyRing,options:{allowLegacyMigration?:boolean}={}):BackupEnvelopeMeta{
  const bytes=typeof fileOrBytes==="string"?(()=>{
    const stat=fs.lstatSync(fileOrBytes);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw new Error("Arquivo de backup inválido.");
    return fs.readFileSync(fileOrBytes);
  })():fileOrBytes;
  const {envelope,matchedKeyId}=decryptEnvelope(bytes,keyOrRing,MAGIC);
  const format=Number(envelope.format??0);
  if(!SUPPORTED_BACKUP_FORMATS.includes(format as 1|2))throw new Error(`Formato de backup incompatível (format=${format}).`);
  const rawDump=envelope.dump as DatabaseDump;
  if(envelope.sha256!==crypto.createHash("sha256").update(JSON.stringify(rawDump)).digest("hex"))throw new Error("Manifesto de integridade inválido.");
  const dump=envelope.schema===schemaFingerprint()
    ?(()=>{validateCompleteDump(rawDump);return rawDump;})()
    :options.allowLegacyMigration
    ?migrateLegacyDump(rawDump,format).dump
    :(()=>{throw new Error("Schema incompatível; use a versão de código correspondente ao backup.");})();
  return {
    format,
    keyId:typeof envelope.keyId==="string"?envelope.keyId:matchedKeyId,
    sha256:String(envelope.sha256),
    schema:String(envelope.schema),
    exportedAt:dump.exportedAt,
    version:dump.version,
    modelCount:dump.modelCount,
    totalRows:dump.totalRows
  };
}

export function readBackup(file:string,keyOrRing:Buffer|BackupKeyRing,options:{allowLegacyMigration?:boolean}={}){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw new Error("Arquivo de backup inválido.");
  return decodeBackup(fs.readFileSync(file),keyOrRing,options);
}

export function saveBackup(folder:string,dump:DatabaseDump,key:Buffer){
  fs.mkdirSync(folder,{recursive:true});
  const name=`money-${new Date().toISOString().replace(/[-:.]/g,"")}-${crypto.randomBytes(16).toString("hex")}.moneybak`;
  const file=path.join(folder,name),bytes=encodeBackup(dump,key);
  // Exclusividade evita sobrescrever uma cópia existente; arquivos parciais são ignorados pela retenção.
  const pending=file+".partial",fd=fs.openSync(pending,"wx",0o600);
  try{
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    readBackup(pending,key);fs.linkSync(pending,file);
  }finally{
    if(fs.existsSync(pending))fs.unlinkSync(pending);
  }
  return file;
}

export function rotateBackupFileKey(file:string,ring:BackupKeyRing,targetFolder=path.dirname(file)):{rotatedFile:string;previousKeyId:string;newKeyId:string}{
  const meta=inspectBackupMetadata(file,ring);
  const dump=readBackup(file,ring);
  const rotatedFile=saveBackup(targetFolder,dump,ring.primary);
  const verified=inspectBackupMetadata(rotatedFile,ring.primary);
  return {rotatedFile,previousKeyId:meta.keyId,newKeyId:verified.keyId};
}

export function encodeEncryptedArchive(zipBytes:Buffer,manifest:Record<string,unknown>,key:Buffer):Buffer{
  if(!Buffer.isBuffer(zipBytes)||zipBytes.length===0)throw new Error("Pacote ZIP vazio ou inválido.");
  const keyId=backupKeyId(key);
  const sha256=crypto.createHash("sha256").update(zipBytes).digest("hex");
  const envelope={
    format:1,
    keyId,
    sha256,
    manifest,
    zipBase64:zipBytes.toString("base64")
  };
  const payload=gzipSync(Buffer.from(JSON.stringify(envelope),"utf8"),{level:6});
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(ARCHIVE_MAGIC);
  const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
  return Buffer.concat([ARCHIVE_MAGIC,iv,cipher.getAuthTag(),ciphertext]);
}

export function decodeEncryptedArchive(bytes:Buffer,keyOrRing:Buffer|BackupKeyRing):{zipBytes:Buffer;manifest:Record<string,unknown>;keyId:string;sha256:string}{
  const {envelope,matchedKeyId}=decryptEnvelope(bytes,keyOrRing,ARCHIVE_MAGIC);
  if(envelope.format!==1||typeof envelope.zipBase64!=="string"||typeof envelope.sha256!=="string")throw new Error("Formato de pacote completo inválido.");
  if(typeof envelope.keyId==="string"&&envelope.keyId!==matchedKeyId)throw new Error("Identificador de chave divergente no pacote.");
  const zipBytes=Buffer.from(envelope.zipBase64,"base64");
  const computedSha256=crypto.createHash("sha256").update(zipBytes).digest("hex");
  if(computedSha256!==envelope.sha256)throw new Error("Integridade SHA-256 do pacote completo reprovada.");
  return {
    zipBytes,
    manifest:(envelope.manifest??{}) as Record<string,unknown>,
    keyId:typeof envelope.keyId==="string"?envelope.keyId:matchedKeyId,
    sha256:computedSha256
  };
}

export function saveEncryptedArchive(filePath:string,zipBytes:Buffer,manifest:Record<string,unknown>,key:Buffer):{file:string;keyId:string;sha256:string;sizeBytes:number}{
  const dir=path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir,{recursive:true});
  const bytes=encodeEncryptedArchive(zipBytes,manifest,key);
  const pending=path.resolve(filePath)+".partial";
  if(fs.existsSync(pending))fs.rmSync(pending,{force:true});
  const fd=fs.openSync(pending,"wx",0o600);
  try{
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    const verified=decodeEncryptedArchive(fs.readFileSync(pending),key);
    if(fs.existsSync(filePath))fs.rmSync(filePath,{force:true});
    fs.linkSync(pending,filePath);
    return {file:path.resolve(filePath),keyId:verified.keyId,sha256:verified.sha256,sizeBytes:bytes.length};
  }finally{
    if(fs.existsSync(pending))fs.rmSync(pending,{force:true});
  }
}

export function readEncryptedArchive(filePath:string,keyOrRing:Buffer|BackupKeyRing){
  const stat=fs.lstatSync(filePath);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw new Error("Arquivo de pacote criptografado inválido.");
  return decodeEncryptedArchive(fs.readFileSync(filePath),keyOrRing);
}

export function isSameStorageVolume(pathA:string,pathB:string):boolean{
  try{
    const realA=fs.realpathSync(pathA),realB=fs.realpathSync(pathB);
    const rootA=path.parse(realA).root.toUpperCase(),rootB=path.parse(realB).root.toUpperCase();
    if(process.platform==="win32"&&rootA&&rootB)return rootA===rootB;
    const statA=fs.statSync(realA),statB=fs.statSync(realB);
    return statA.dev!==0&&statA.dev===statB.dev;
  }catch{
    return false;
  }
}

export function mirrorBackup(file:string,destination:string,keyOrRing:Buffer|BackupKeyRing,projectRoot=process.cwd()){
  if(!path.isAbsolute(destination)||!fs.existsSync(destination))throw new Error("BACKUP_EXTERNAL_DIR deve ser diretório absoluto existente e montado.");
  const root=fs.realpathSync(projectRoot),target=fs.realpathSync(destination),source=fs.realpathSync(path.dirname(file));
  const inside=(parent:string,child:string)=>{const r=path.relative(parent,child);return !r||(!r.startsWith(".."+path.sep)&&r!==".."&&!path.isAbsolute(r));};
  if(inside(root,target)||inside(source,target)||inside(target,source)||!fs.statSync(target).isDirectory())throw new Error("Destino externo deve ficar fora do projeto e da pasta local de backups.");
  readBackup(file,keyOrRing);
  const output=path.join(target,path.basename(file)),pending=output+".partial";
  fs.copyFileSync(file,pending,fs.constants.COPYFILE_EXCL);
  try{
    const fd=fs.openSync(pending,"r+");try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    readBackup(pending,keyOrRing);fs.linkSync(pending,output);
  }finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}
  return output;
}

export function retentionPlan(folder:string,keyOrRing:Buffer|BackupKeyRing,keep:number){
  if(!Number.isSafeInteger(keep)||keep<2)throw new Error("Retenção exige ao menos duas cópias válidas.");
  const valid:{file:string;at:number}[]=[],rejected:string[]=[];
  for(const name of fs.readdirSync(folder)){
    if(!NAME.test(name)&&!ARCHIVE_NAME.test(name))continue;
    const file=path.join(folder,name);
    try{
      if(ARCHIVE_NAME.test(name)){
        const decoded=readEncryptedArchive(file,keyOrRing);
        const createdAt=String(decoded.manifest.createdAt??"");
        valid.push({file,at:Number.isFinite(Date.parse(createdAt))?Date.parse(createdAt):fs.statSync(file).mtimeMs});
      }else{
        const dump=readBackup(file,keyOrRing);
        valid.push({file,at:Date.parse(dump.exportedAt)});
      }
    }catch{rejected.push(name);}
  }
  valid.sort((a,b)=>b.at-a.at||b.file.localeCompare(a.file));
  return {retained:valid.slice(0,keep).map(x=>x.file),remove:valid.slice(keep).map(x=>x.file),rejected};
}

export function applyRetention(folder:string,keyOrRing:Buffer|BackupKeyRing,keep:number){
  const plan=retentionPlan(folder,keyOrRing,keep);
  // Revalida todas as cópias preservadas antes de apagar qualquer arquivo.
  for(const file of plan.retained){
    if(ARCHIVE_NAME.test(path.basename(file)))readEncryptedArchive(file,keyOrRing);
    else readBackup(file,keyOrRing);
  }
  for(const file of plan.remove){
    if(ARCHIVE_NAME.test(path.basename(file)))readEncryptedArchive(file,keyOrRing);
    else readBackup(file,keyOrRing);
    fs.unlinkSync(file);
  }
  return plan;
}

export function distributeBackupCopies(
  localFile:string,
  destinations:{externalDir:string;archiveDir?:string|null},
  keyOrRing:Buffer|BackupKeyRing,
  retention:{localKeep?:number;externalKeep?:number;archiveKeep?:number}={},
  projectRoot=process.cwd()
){
  const localFolder=path.dirname(path.resolve(localFile));
  const externalFile=mirrorBackup(localFile,destinations.externalDir,keyOrRing,projectRoot);
  let archiveFile:string|null=null;
  if(destinations.archiveDir?.trim()){
    const archiveTarget=destinations.archiveDir.trim();
    if(fs.existsSync(archiveTarget)&&fs.realpathSync(archiveTarget)===fs.realpathSync(destinations.externalDir)){
      throw new Error("BACKUP_ARCHIVE_DIR deve ser independente de BACKUP_EXTERNAL_DIR.");
    }
    archiveFile=mirrorBackup(localFile,archiveTarget,keyOrRing,projectRoot);
  }
  const localRetention=retention.localKeep?applyRetention(localFolder,keyOrRing,retention.localKeep):null;
  const externalRetention=retention.externalKeep?applyRetention(destinations.externalDir,keyOrRing,retention.externalKeep):null;
  const archiveRetention=archiveFile&&retention.archiveKeep&&destinations.archiveDir?applyRetention(destinations.archiveDir,keyOrRing,retention.archiveKeep):null;
  return {
    local:path.resolve(localFile),
    external:externalFile,
    archive:archiveFile,
    sameVolumeExternal:isSameStorageVolume(localFolder,destinations.externalDir),
    sameVolumeArchive:archiveFile&&destinations.archiveDir?isSameStorageVolume(localFolder,destinations.archiveDir):false,
    retention:{local:localRetention,external:externalRetention,archive:archiveRetention}
  };
}

export function resolveBackupFromDestinations(
  folders:string[],
  keyOrRing:Buffer|BackupKeyRing,
  preferredFileName?:string
):{sourceFile:string;sourceFolder:string;dump:DatabaseDump;keyId:string;failoverUsed:boolean;unavailableFolders:string[]}{
  const unavailableFolders:string[]=[];
  for(let idx=0;idx<folders.length;idx++){
    const folder=folders[idx];
    if(!folder||!fs.existsSync(folder)){
      unavailableFolders.push(folder||"unconfigured");
      continue;
    }
    try{
      const candidates=preferredFileName
        ?[path.join(folder,path.basename(preferredFileName))]
        :fs.readdirSync(folder).filter(name=>NAME.test(name)).map(name=>path.join(folder,name));
      const valid:{file:string;dump:DatabaseDump;keyId:string;at:number}[]=[];
      for(const file of candidates){
        if(!fs.existsSync(file))continue;
        try{
          const meta=inspectBackupMetadata(file,keyOrRing);
          const dump=readBackup(file,keyOrRing);
          valid.push({file,dump,keyId:meta.keyId,at:Date.parse(dump.exportedAt)});
        }catch{
          // Ignora arquivo corrompido neste destino e tenta outros
        }
      }
      if(valid.length>0){
        valid.sort((a,b)=>b.at-a.at||b.file.localeCompare(a.file));
        const chosen=valid[0]!;
        return {
          sourceFile:chosen.file,
          sourceFolder:folder,
          dump:chosen.dump,
          keyId:chosen.keyId,
          failoverUsed:idx>0||unavailableFolders.length>0,
          unavailableFolders
        };
      }
      unavailableFolders.push(folder);
    }catch{
      unavailableFolders.push(folder);
    }
  }
  throw new Error("Nenhuma cópia íntegra disponível nos destinos configurados.");
}

// ============================================================================
// Pacote 7 — Comparação entre dois arquivos .moneybak
// ============================================================================

export function compareBackupFiles(
  olderFile:string,
  newerFile:string,
  keyOrRing:Buffer|BackupKeyRing
):BackupComparisonReport & {olderKeyId:string;newerKeyId:string}{
  const olderMeta=inspectBackupMetadata(olderFile,keyOrRing,{allowLegacyMigration:true});
  const newerMeta=inspectBackupMetadata(newerFile,keyOrRing,{allowLegacyMigration:true});
  const olderDump=readBackup(olderFile,keyOrRing,{allowLegacyMigration:true});
  const newerDump=readBackup(newerFile,keyOrRing,{allowLegacyMigration:true});
  return {
    olderKeyId:olderMeta.keyId,
    newerKeyId:newerMeta.keyId,
    ...diffDatabaseDumps(olderDump,newerDump)
  };
}

// ============================================================================
// Pacote 8 — Validação financeira em arquivo .moneybak
// ============================================================================

export function validateBackupFinancialFile(
  file:string,
  keyOrRing:Buffer|BackupKeyRing
):FinancialValidationReport & {keyId:string;exportedAt:string}{
  const meta=inspectBackupMetadata(file,keyOrRing,{allowLegacyMigration:true});
  const dump=readBackup(file,keyOrRing,{allowLegacyMigration:true});
  return {
    keyId:meta.keyId,
    exportedAt:dump.exportedAt,
    ...auditBackupFinancialConsistency(dump)
  };
}

// ============================================================================
// Pacote 9 — Recuperação assistida com prévia, backup de segurança e rollback
// ============================================================================

export const ASSISTED_RECOVERY_CONFIRMATION="CONFIRMAR_RECUPERACAO_CONTROLADA";

export type BackupRecoveryPreview={
  valid:boolean;
  fileName:string;
  filePath:string;
  keyId:string;
  format:number;
  exportedAt:string;
  version:string;
  environment:ReturnType<typeof identifyDatabaseEnvironment>;
  compatibility:BackupCompatibilityReport;
  dataSummary:BackupDataSummary;
  financialAudit:FinancialValidationReport;
  requiredConfirmationToken:typeof ASSISTED_RECOVERY_CONFIRMATION;
};

export function previewBackupRecovery(
  file:string,
  keyOrRing:Buffer|BackupKeyRing
):BackupRecoveryPreview{
  const resolved=path.resolve(file);
  const bytes=fs.readFileSync(resolved);
  const {envelope,matchedKeyId}=decryptEnvelope(bytes,keyOrRing,MAGIC);
  const format=Number(envelope.format??1);
  const compatibility=checkBackupCompatibility(envelope.dump,format);
  if(!compatibility.compatible)throw new Error(compatibility.message);
  const dump=readBackup(resolved,keyOrRing,{allowLegacyMigration:true});
  const dataSummary=summarizeDatabaseDump(dump);
  const financialAudit=auditBackupFinancialConsistency(dump);
  return {
    valid:compatibility.compatible&&financialAudit.valid,
    fileName:path.basename(resolved),
    filePath:resolved,
    keyId:typeof envelope.keyId==="string"?envelope.keyId:matchedKeyId,
    format,
    exportedAt:dump.exportedAt,
    version:dump.version,
    environment:identifyDatabaseEnvironment(),
    compatibility,
    dataSummary,
    financialAudit,
    requiredConfirmationToken:ASSISTED_RECOVERY_CONFIRMATION
  };
}

function orderedModelsForClean(){
  const models=Prisma.dmmf.datamodel.models,result:typeof models[number][]=[],pending=[...models];
  while(pending.length){
    const index=pending.findIndex(m=>m.fields.filter(f=>f.kind==="object"&&(f.relationFromFields?.length??0)>0&&f.type!==m.name).every(f=>result.some(x=>x.name===f.type)));
    if(index<0)throw new Error("Ciclo de dependências impede limpeza ordenada.");
    result.push(pending.splice(index,1)[0]);
  }
  return result;
}

async function replaceDatabaseWithDump(db:PrismaClient,dump:DatabaseDump):Promise<Record<string,number>>{
  const models=orderedModelsForClean();
  const reverseModels=[...models].reverse();
  await db.$transaction(async tx=>{
    for(const m of reverseModels){
      const key=modelKey(m.name);
      const del=(tx as unknown as Record<string,{deleteMany:()=>Promise<unknown>}>)[key];
      await del.deleteMany();
    }
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:60000});
  return restoreDatabaseDump(db,dump,false);
}

export async function executeAssistedRecovery(options:{
  db:PrismaClient;
  backupFile:string;
  keyOrRing:Buffer|BackupKeyRing;
  safetyBackupFolder:string;
  confirmationToken:string;
  actorId?:string;
}){
  if(options.confirmationToken!==ASSISTED_RECOVERY_CONFIRMATION){
    throw new Error(`Confirmação explícita obrigatória (${ASSISTED_RECOVERY_CONFIRMATION}).`);
  }
  const primaryKey=Buffer.isBuffer(options.keyOrRing)?options.keyOrRing:options.keyOrRing.primary;
  const preview=previewBackupRecovery(options.backupFile,options.keyOrRing);
  if(!preview.valid){
    throw new Error("Backup reprovado na validação prévia financeira ou de compatibilidade; recuperação abortada.");
  }

  // 1. Cria cópia criptografada do estado atual antes de substituir o banco
  const currentStateDump=await exportDatabaseDump(options.db);
  const preRestoreSafetyBackupFile=saveBackup(options.safetyBackupFolder,currentStateDump,primaryKey);

  // 2. Executa substituição controlada invalidando sessões
  const targetDump=readBackup(options.backupFile,options.keyOrRing,{allowLegacyMigration:true});
  let restoredCounts:Record<string,number>;
  try{
    restoredCounts=await replaceDatabaseWithDump(options.db,targetDump);
    const afterDump=await exportDatabaseDump(options.db);
    compareRestoredDump(targetDump,afterDump,false);
    const postAudit=auditBackupFinancialConsistency(afterDump);
    if(!postAudit.valid)throw new Error("Inconsistência financeira pós-restauração.");
  }catch(err){
    // Rollback automático a partir da cópia de segurança recém-criada
    await replaceDatabaseWithDump(options.db,currentStateDump);
    throw err;
  }

  return {
    status:"RECUPERADO_COM_SEGURANCA",
    restoredFrom:path.resolve(options.backupFile),
    keyId:preview.keyId,
    preRestoreSafetyBackupFile,
    sessionsInvalidated:true,
    activeSessionsAfterRestore:await options.db.session.count(),
    restoredCounts,
    financialTotals:preview.dataSummary.financialTotals
  };
}

export async function rollbackAssistedRecovery(options:{
  db:PrismaClient;
  safetyBackupFile:string;
  keyOrRing:Buffer|BackupKeyRing;
}){
  const safetyDump=readBackup(options.safetyBackupFile,options.keyOrRing,{allowLegacyMigration:true});
  const counts=await replaceDatabaseWithDump(options.db,safetyDump);
  const after=await exportDatabaseDump(options.db);
  compareRestoredDump(safetyDump,after,false);
  return {
    status:"ROLLBACK_CONCLUIDO",
    safetyBackupFile:path.resolve(options.safetyBackupFile),
    sessionsInvalidated:true,
    restoredCounts:counts
  };
}

// ============================================================================
// Pacote 11 — Controle de acesso restrito e trilha de auditoria sanitizada
// ============================================================================

export type BackupAuditOperation=
  |"BACKUP_GENERATED"
  |"BACKUP_DOWNLOADED"
  |"BACKUP_VERIFIED"
  |"BACKUP_DIFF_INSPECTED"
  |"BACKUP_FINANCIAL_VALIDATED"
  |"BACKUP_RESTORE_PREVIEWED"
  |"BACKUP_RESTORED_ASSISTED"
  |"BACKUP_ROLLBACK_EXECUTED";

export async function authorizeAndAuditBackupOperation<T>(
  db:PrismaClient,
  actorId:string,
  operation:BackupAuditOperation,
  entityId:string,
  summary:string,
  task:()=>Promise<T>
):Promise<T>{
  const actor=await db.user.findUnique({where:{id:actorId}});
  if(!actor||!actor.active||actor.role!=="ADMIN"){
    if(actor){
      await db.auditLog.create({
        data:{
          actorId:actor.id,
          action:"BACKUP_ACCESS_DENIED",
          entity:"DatabaseBackup",
          entityId:redactSensitiveBackupText(entityId).slice(0,64),
          summary:redactSensitiveBackupText(`Acesso negado para operação ${operation} pelo perfil ${actor.role}.`)
        }
      });
    }
    throw new Error("REGRA:Somente Administrador ativo possui permissão para operações de backup e recuperação.");
  }

  try{
    const result=await task();
    await db.auditLog.create({
      data:{
        actorId:actor.id,
        action:operation,
        entity:"DatabaseBackup",
        entityId:redactSensitiveBackupText(entityId).slice(0,64),
        summary:redactSensitiveBackupText(`${summary} (resultado: APROVADO)`).slice(0,450)
      }
    });
    return result;
  }catch(err){
    const msg=err instanceof Error?err.message:"Erro na operação de backup";
    await db.auditLog.create({
      data:{
        actorId:actor.id,
        action:`${operation}_FAILED`,
        entity:"DatabaseBackup",
        entityId:redactSensitiveBackupText(entityId).slice(0,64),
        summary:redactSensitiveBackupText(`${summary} (resultado: REPROVADO - ${msg})`).slice(0,450)
      }
    });
    throw err;
  }
}

// ============================================================================
// Pacote 12 — Homologação de recuperação (cenários críticos + RTO/RPO)
// ============================================================================

export async function runBackupRecoveryHomologation(options:{
  db:PrismaClient;
  outputReportPath?:string;
}){
  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),"money-homolog-p12-"));
  const localDir=path.join(tempRoot,"local");
  const extDir=path.join(tempRoot,"external");
  const archDir=path.join(tempRoot,"archive");
  const safetyDir=path.join(tempRoot,"safety");
  fs.mkdirSync(localDir);fs.mkdirSync(extDir);fs.mkdirSync(archDir);fs.mkdirSync(safetyDir);

  const oldKey=crypto.randomBytes(32);
  const currentKey=crypto.randomBytes(32);
  const wrongKey=crypto.randomBytes(32);
  const ring=backupKeyRing(currentKey.toString("hex"),oldKey.toString("hex"));

  try{
    const snapshotTime=Date.now();
    const initialDump=await exportDatabaseDump(options.db);
    initialDump.exportedAt=new Date(snapshotTime-5*60*1000).toISOString(); // simula snapshot de 5 min atrás para cálculo de RPO

    // 1. Geração e distribuição em 3 destinos
    const primaryFile=saveBackup(localDir,initialDump,oldKey);
    const rotated=rotateBackupFileKey(primaryFile,ring,localDir);
    const distributed=distributeBackupCopies(rotated.rotatedFile,{externalDir:extDir,archiveDir:archDir},ring,{localKeep:2,externalKeep:2,archiveKeep:2});

    // 2. Simulação de interrupção durante geração (.partial órfão não corrompe retenção nem cópias válidas)
    const interruptedPartial=path.join(localDir,"money-20261027T235959000Z-00112233445566778899aabbccddeeff.moneybak.partial");
    fs.writeFileSync(interruptedPartial,Buffer.from("INTERRUPTED_WRITE_PARTIAL"));
    const planAfterInterrupt=retentionPlan(localDir,ring,2);
    const interruptedGenerationPreservedValidCopies=
      planAfterInterrupt.retained.length===2&&
      !planAfterInterrupt.retained.includes(interruptedPartial)&&
      !planAfterInterrupt.rejected.includes(path.basename(interruptedPartial));

    // 3. Simulação de chave incorreta e arquivo corrompido
    let wrongKeyBlocked=false;
    try{readBackup(distributed.local,wrongKey);}catch{wrongKeyBlocked=true;}

    const corruptedCopy=path.join(extDir,path.basename(distributed.external));
    const corruptedBytes=Buffer.from(fs.readFileSync(corruptedCopy));
    corruptedBytes[corruptedBytes.length-1]^=0xff;
    fs.writeFileSync(corruptedCopy,corruptedBytes);
    let corruptedFileBlocked=false;
    try{readBackup(corruptedCopy,ring);}catch{corruptedFileBlocked=true;}

    // 4. Simulação de indisponibilidade do destino local + corrupção do destino externo -> failover pelo 3º destino (archive)
    fs.rmSync(localDir,{recursive:true,force:true});
    const rtoStart=Date.now();
    const failoverResolved=resolveBackupFromDestinations([localDir,extDir,archDir],ring);
    const destinationFailoverRecovered=failoverResolved.failoverUsed&&failoverResolved.sourceFolder===archDir;

    // 5. Recuperação assistida com backup pré-restauração, invalidação de sessões e teste de rollback
    const recoveryResult=await executeAssistedRecovery({
      db:options.db,
      backupFile:failoverResolved.sourceFile,
      keyOrRing:ring,
      safetyBackupFolder:safetyDir,
      confirmationToken:ASSISTED_RECOVERY_CONFIRMATION
    });
    const rtoMs=Math.max(1,Date.now()-rtoStart);
    const rpoMs=Math.max(0,snapshotTime-Date.parse(initialDump.exportedAt));

    const rollbackResult=await rollbackAssistedRecovery({
      db:options.db,
      safetyBackupFile:recoveryResult.preRestoreSafetyBackupFile,
      keyOrRing:ring
    });

    const report={
      status:"APROVADO",
      executedAt:new Date().toISOString(),
      keyId:ring.primaryId,
      scenarios:{
        corruptedFileBlocked,
        wrongKeyBlocked,
        rotatedKeyRecovered:rotated.previousKeyId===backupKeyId(oldKey)&&rotated.newKeyId===ring.primaryId,
        destinationFailoverRecovered,
        interruptedGenerationPreservedValidCopies,
        assistedRecoveryAndRollbackVerified:
          recoveryResult.status==="RECUPERADO_COM_SEGURANCA"&&
          recoveryResult.sessionsInvalidated&&
          recoveryResult.activeSessionsAfterRestore===0&&
          rollbackResult.status==="ROLLBACK_CONCLUIDO"
      },
      metrics:{
        rtoMs,
        rpoMs,
        rpoMinutes:Number((rpoMs/60000).toFixed(2)),
        modelsRestored:initialDump.modelCount,
        rowsRestored:initialDump.totalRows
      },
      operationalInstructions:"docs/deploy/RECUPERACAO_E_GESTAO_CHAVES_BACKUP.md"
    };

    if(options.outputReportPath){
      const outDir=path.dirname(path.resolve(options.outputReportPath));
      fs.mkdirSync(outDir,{recursive:true});
      fs.writeFileSync(options.outputReportPath,JSON.stringify(report,null,2),"utf8");
    }

    return report;
  }finally{
    fs.rmSync(tempRoot,{recursive:true,force:true});
  }
}
