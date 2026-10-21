import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

export type DatabaseDump={exportedAt:string;version:string;modelCount:number;totalRows:number;tables:Record<string,{count:number;rows:Record<string,unknown>[]}>};
export type SignedBackupEnvelope = {
  dump: DatabaseDump;
  sha256Checksum: string;
  hmacSignature: string | null;
  signed: boolean;
  createdAt: string;
};
export type BackupVerificationCertificate = {
  verifiedAt: string;
  sha256Checksum: string;
  signed: boolean;
  modelCount: number;
  totalRows: number;
  referentialLinksChecked: number;
  valid: boolean;
};

type Delegate={findMany:()=>Promise<Record<string,unknown>[]>;create:(args:{data:Record<string,unknown>})=>Promise<unknown>;count:()=>Promise<number>};
export const modelKey=(name:string)=>name[0].toLowerCase()+name.slice(1);
const delegate=(tx:Prisma.TransactionClient,key:string)=>(tx as unknown as Record<string,Delegate>)[key];
export async function exportDatabaseDump(db:PrismaClient):Promise<DatabaseDump>{
  return db.$transaction(async tx=>{
    const tables:DatabaseDump["tables"]={};let totalRows=0;
    for(const model of Prisma.dmmf.datamodel.models){
      const key=modelKey(model.name),rows=await delegate(tx,key).findMany();
      const serialized=JSON.parse(JSON.stringify(rows,(_k,v)=>typeof v==="bigint"?v.toString():v));
      tables[key]={count:rows.length,rows:serialized};totalRows+=rows.length;
    }
    return {exportedAt:new Date().toISOString(),version:"SOUL-v5.2.1",modelCount:Object.keys(tables).length,totalRows,tables};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:60000});
}

function orderedModels(){
  const models=Prisma.dmmf.datamodel.models,result:typeof models[number][]=[],pending=[...models];
  while(pending.length){
    const index=pending.findIndex(m=>m.fields.filter(f=>f.kind==="object"&&(f.relationFromFields?.length??0)>0&&f.type!==m.name).every(f=>result.some(x=>x.name===f.type)));
    if(index<0)throw new Error("Ciclo de dependências impede restauração automática.");
    result.push(pending.splice(index,1)[0]);
  }
  return result;
}

export async function restoreDatabaseDump(db:PrismaClient,dump:DatabaseDump,includeSessions=false){
  if(!dump.tables||dump.modelCount!==Object.keys(dump.tables).length)throw new Error("Dump incompleto ou inválido.");
  const models=orderedModels(),known=new Set(models.map(m=>modelKey(m.name)));
  if(Object.keys(dump.tables).some(k=>!known.has(k)))throw new Error("Dump contém modelos desconhecidos.");
  const total=Object.values(dump.tables).reduce((n,t)=>{if(t.count!==t.rows.length)throw new Error("Contagem inválida no dump.");return n+t.count;},0);
  if(total!==dump.totalRows)throw new Error("Total de registros divergente.");
  return db.$transaction(async tx=>{
    for(const m of models)if(await delegate(tx,modelKey(m.name)).count())throw new Error("Restauração exige banco vazio.");
    const counts:Record<string,number>={};
    for(const m of models){
      const key=modelKey(m.name),table=dump.tables[key];counts[key]=0;
      if(key==="session"&&!includeSessions)continue;
      for(const raw of table?.rows??[]){
        const data:Record<string,unknown>={};
        for(const [field,value]of Object.entries(raw)){
          const def=m.fields.find(f=>f.name===field&&f.kind!=="object");
          if(!def)throw new Error(`Campo desconhecido: ${key}.${field}`);
          data[field]=value===null?null:def.type==="BigInt"?BigInt(String(value)):def.type==="DateTime"?new Date(String(value)):value;
        }
        await delegate(tx,key).create({data});counts[key]++;
      }
    }
    return counts;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:60000});
}

function canonicalPayloadHash(dump: DatabaseDump): string {
  const payload = JSON.stringify({
    version: dump.version,
    modelCount: dump.modelCount,
    totalRows: dump.totalRows,
    tables: dump.tables
  });
  return createHash("sha256").update(payload).digest("hex");
}

export async function createSignedBackupEnvelope(db: PrismaClient, signingSecret = process.env.BACKUP_SIGNING_KEY): Promise<SignedBackupEnvelope> {
  const dump = await exportDatabaseDump(db);
  const sha256Checksum = canonicalPayloadHash(dump);
  const cleanSecret = signingSecret?.trim();
  const hmacSignature = cleanSecret
    ? createHmac("sha256", cleanSecret).update(sha256Checksum).digest("hex")
    : null;
  return {
    dump,
    sha256Checksum,
    hmacSignature,
    signed: Boolean(hmacSignature),
    createdAt: new Date().toISOString()
  };
}

export function verifyBackupEnvelopeIntegrity(envelope: SignedBackupEnvelope, signingSecret = process.env.BACKUP_SIGNING_KEY): BackupVerificationCertificate {
  const expectedChecksum = canonicalPayloadHash(envelope.dump);
  if (expectedChecksum !== envelope.sha256Checksum) {
    throw new Error("Integridade do backup reprovada: hash SHA-256 divergente (arquivo adulterado ou corrompido).");
  }
  const cleanSecret = signingSecret?.trim();
  if (envelope.signed || cleanSecret) {
    if (!cleanSecret || !envelope.hmacSignature) {
      throw new Error("Assinatura HMAC ausente ou chave de verificação não configurada.");
    }
    const expectedHmac = createHmac("sha256", cleanSecret).update(expectedChecksum).digest("hex");
    const a = Buffer.from(expectedHmac);
    const b = Buffer.from(envelope.hmacSignature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Assinatura criptográfica HMAC do backup inválida.");
    }
  }

  const models = orderedModels();
  const known = new Set(models.map((m) => modelKey(m.name)));
  if (envelope.dump.modelCount !== models.length || Object.keys(envelope.dump.tables).some((k) => !known.has(k))) {
    throw new Error("Catálogo de modelos do backup incompatível com o schema Prisma atual.");
  }

  const primaryKeySets = new Map<string, Set<string>>();
  for (const m of models) {
    const key = modelKey(m.name);
    const idField = m.fields.find((f) => f.isId)?.name ?? "id";
    const rows = envelope.dump.tables[key]?.rows ?? [];
    const set = new Set<string>();
    for (const r of rows) {
      if (r[idField] !== undefined && r[idField] !== null) {
        set.add(String(r[idField]));
      }
    }
    primaryKeySets.set(m.name, set);
  }

  let referentialLinksChecked = 0;
  for (const m of models) {
    const key = modelKey(m.name);
    const rows = envelope.dump.tables[key]?.rows ?? [];
    for (const raw of rows) {
      for (const [field, value] of Object.entries(raw)) {
        const def = m.fields.find((f) => f.name === field && f.kind !== "object");
        if (!def) throw new Error(`Campo inválido na verificação de restauração: ${key}.${field}`);
        if (value !== null) {
          if (def.type === "BigInt") BigInt(String(value));
          if (def.type === "DateTime" && Number.isNaN(new Date(String(value)).getTime())) {
            throw new Error(`Data inválida em ${key}.${field}`);
          }
        }
      }
      for (const rel of m.fields.filter((f) => f.kind === "object" && (f.relationFromFields?.length ?? 0) === 1 && f.type !== m.name)) {
        const fkField = rel.relationFromFields![0]!;
        const fkVal = raw[fkField];
        if (fkVal !== null && fkVal !== undefined) {
          referentialLinksChecked++;
          const targetIds = primaryKeySets.get(rel.type);
          if (targetIds && !targetIds.has(String(fkVal))) {
            throw new Error(`Vínculo órfão detectado em ${key}.${fkField} -> ${rel.type}(${String(fkVal)})`);
          }
        }
      }
    }
  }

  return {
    verifiedAt: new Date().toISOString(),
    sha256Checksum: envelope.sha256Checksum,
    signed: envelope.signed,
    modelCount: envelope.dump.modelCount,
    totalRows: envelope.dump.totalRows,
    referentialLinksChecked,
    valid: true
  };
}

export async function runAndRecordBackupVerification(db: PrismaClient, actorId: string) {
  const envelope = await createSignedBackupEnvelope(db);
  const certificate = verifyBackupEnvelopeIntegrity(envelope);
  await db.$transaction([
    db.financeSetting.upsert({
      where: { key: "backup_verification:latest" },
      create: { key: "backup_verification:latest", value: JSON.stringify(certificate), changedById: actorId },
      update: { value: JSON.stringify(certificate), changedById: actorId }
    }),
    db.auditLog.create({
      data: {
        actorId,
        action: "BACKUP_VERIFICATION_PASSED",
        entity: "DatabaseBackup",
        entityId: certificate.sha256Checksum.slice(0, 16),
        summary: `Ensaio periódico de backup e verificação relacional aprovado (${certificate.modelCount} modelos, ${certificate.totalRows} registros, SHA-256 ${certificate.sha256Checksum.slice(0, 12)}).`
      }
    })
  ]);
  return { certificate, envelope };
}
