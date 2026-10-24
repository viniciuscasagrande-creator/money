import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {gzipSync, gunzipSync} from "node:zlib";
import {Prisma} from "@prisma/client";
import {type DatabaseDump, modelKey} from "./backup-data";

const MAGIC=Buffer.from("MONEYBK1");
const MAX_BYTES=512*1024*1024;
const NAME=/^money-\d{8}T\d{9}Z-[a-f0-9]{32}\.moneybak$/;
const schemaFingerprint=()=>crypto.createHash("sha256").update(JSON.stringify(Prisma.dmmf.datamodel.models.map(m=>({name:m.name,fields:m.fields.filter(f=>f.kind!=="object").map(f=>({name:f.name,type:f.type,required:f.isRequired,list:f.isList}))})))).digest("hex");
export function backupKey(value=process.env.BACKUP_ENCRYPTION_KEY??""){
  if(!/^[a-f0-9]{64}$/i.test(value))throw new Error("BACKUP_ENCRYPTION_KEY exige 32 bytes em hexadecimal (64 caracteres).");
  return Buffer.from(value,"hex");
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
export function encodeBackup(dump:DatabaseDump,key:Buffer){
  validateCompleteDump(dump);
  const data=JSON.stringify(dump),sha256=crypto.createHash("sha256").update(data).digest("hex");
  const payload=gzipSync(Buffer.from(JSON.stringify({format:1,sha256,schema:schemaFingerprint(),dump})),{level:6});
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(MAGIC);
  const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
  return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),ciphertext]);
}
export function decodeBackup(bytes:Buffer,key:Buffer):DatabaseDump{
  if(bytes.length<37||bytes.length>MAX_BYTES||!bytes.subarray(0,8).equals(MAGIC))throw new Error("Formato ou tamanho de backup inválido.");
  let payload:Buffer;
  try{
    const decipher=crypto.createDecipheriv("aes-256-gcm",key,bytes.subarray(8,20));
    decipher.setAAD(MAGIC);decipher.setAuthTag(bytes.subarray(20,36));
    payload=gunzipSync(Buffer.concat([decipher.update(bytes.subarray(36)),decipher.final()]),{maxOutputLength:MAX_BYTES});
  }catch{throw new Error("Backup corrompido ou chave incorreta; restauração bloqueada.");}
  const envelope=JSON.parse(payload.toString("utf8"));
  if(envelope.format!==1||envelope.sha256!==crypto.createHash("sha256").update(JSON.stringify(envelope.dump)).digest("hex"))throw new Error("Manifesto de integridade inválido.");
  if(envelope.schema!==schemaFingerprint())throw new Error("Schema incompatível; use a versão de código correspondente ao backup.");
  validateCompleteDump(envelope.dump);return envelope.dump;
}
export function readBackup(file:string,key:Buffer){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw new Error("Arquivo de backup inválido.");
  return decodeBackup(fs.readFileSync(file),key);
}
export function saveBackup(folder:string,dump:DatabaseDump,key:Buffer){
  fs.mkdirSync(folder,{recursive:true});
  const name=`money-${new Date().toISOString().replace(/[-:.]/g,"")}-${crypto.randomBytes(16).toString("hex")}.moneybak`;
  const file=path.join(folder,name),bytes=encodeBackup(dump,key);
  // Exclusividade evita sobrescrever uma cópia existente; arquivos parciais são ignorados pela retenção.
  const pending=file+".partial",fd=fs.openSync(pending,"wx",0o600);
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  readBackup(pending,key);fs.linkSync(pending,file);fs.unlinkSync(pending);
  return file;
}
export function mirrorBackup(file:string,destination:string,key:Buffer,projectRoot=process.cwd()){
  if(!path.isAbsolute(destination)||!fs.existsSync(destination))throw new Error("BACKUP_EXTERNAL_DIR deve ser diretório absoluto existente e montado.");
  const root=fs.realpathSync(projectRoot),target=fs.realpathSync(destination),source=fs.realpathSync(path.dirname(file));
  const inside=(parent:string,child:string)=>{const r=path.relative(parent,child);return !r||(!r.startsWith(".."+path.sep)&&r!==".."&&!path.isAbsolute(r));};
  if(inside(root,target)||inside(source,target)||inside(target,source)||!fs.statSync(target).isDirectory())throw new Error("Destino externo deve ficar fora do projeto e da pasta local de backups.");
  readBackup(file,key);
  const output=path.join(target,path.basename(file)),pending=output+".partial";
  fs.copyFileSync(file,pending,fs.constants.COPYFILE_EXCL);
  try{
    const fd=fs.openSync(pending,"r+");try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    readBackup(pending,key);fs.linkSync(pending,output);
  }finally{fs.unlinkSync(pending);}
  return output;
}
export function retentionPlan(folder:string,key:Buffer,keep:number){
  if(!Number.isSafeInteger(keep)||keep<2)throw new Error("Retenção exige ao menos duas cópias válidas.");
  const valid:{file:string;at:number}[]=[],rejected:string[]=[];
  for(const name of fs.readdirSync(folder)){
    if(!NAME.test(name))continue;
    const file=path.join(folder,name);
    try{const dump=readBackup(file,key);valid.push({file,at:Date.parse(dump.exportedAt)});}catch{rejected.push(name);}
  }
  valid.sort((a,b)=>b.at-a.at||b.file.localeCompare(a.file));
  return {retained:valid.slice(0,keep).map(x=>x.file),remove:valid.slice(keep).map(x=>x.file),rejected};
}
export function applyRetention(folder:string,key:Buffer,keep:number){
  const plan=retentionPlan(folder,key,keep);
  // Revalida todas as cópias preservadas antes de apagar qualquer arquivo.
  for(const file of plan.retained)readBackup(file,key);
  for(const file of plan.remove){readBackup(file,key);fs.unlinkSync(file);}
  return plan;
}
