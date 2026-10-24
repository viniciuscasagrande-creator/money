import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {Prisma,PrismaClient} from "@prisma/client";
import {exportDatabaseDump,type DatabaseDump} from "../src/lib/backup-data";
import {backupKey,encodeBackup,decodeBackup,saveBackup,readBackup,mirrorBackup,retentionPlan,applyRetention} from "../src/lib/operational-backup";
import {compareRestoredDump} from "../src/lib/backup-verification";

const key=crypto.randomBytes(32);
const empty=():DatabaseDump=>({version:"SOUL-v5.2.1",exportedAt:new Date().toISOString(),modelCount:Prisma.dmmf.datamodel.models.length,totalRows:0,tables:Object.fromEntries(Prisma.dmmf.datamodel.models.map(m=>[m.name[0].toLowerCase()+m.name.slice(1),{count:0,rows:[]}]))});
test("backup autenticado rejeita adulteração, truncamento, chave incorreta e snapshot incompleto",()=>{
  const dump=empty(),bytes=encodeBackup(dump,key);
  assert.deepEqual(decodeBackup(bytes,key),dump);
  assert.notDeepEqual(encodeBackup(dump,key),bytes);
  const changed=Buffer.from(bytes);changed[changed.length-1]^=1;
  assert.throws(()=>decodeBackup(changed,key),/corrompido/);
  assert.throws(()=>decodeBackup(bytes.subarray(0,bytes.length-7),key),/corrompido/);
  assert.throws(()=>decodeBackup(bytes,crypto.randomBytes(32)),/chave incorreta/);
  delete dump.tables.user;assert.throws(()=>encodeBackup(dump,key),/incompleto/);
  assert.throws(()=>backupKey("senha-curta"),/32 bytes/);
});
test("retenção preserva duas válidas, ignora inválidas, nunca remove arquivos alheios e planeja sem apagar",()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"money-retention-"));
  try{
    const files=[];
    for(let i=0;i<4;i++)files.push(saveBackup(folder,{...empty(),exportedAt:`2026-10-${10+i}T00:00:00.000Z`},key));
    fs.writeFileSync(files[0],"corrompido");fs.writeFileSync(path.join(folder,"documento.txt"),"preservar");
    const plan=retentionPlan(folder,key,2);assert.equal(plan.remove.length,1);assert.equal(plan.rejected.length,1);
    assert.ok(fs.existsSync(plan.remove[0]));assert.throws(()=>applyRetention(folder,key,1),/duas/);
    applyRetention(folder,key,2);assert.ok(!fs.existsSync(files[1]));
    for(const file of [files[0],files[2],files[3],path.join(folder,"documento.txt")])assert.ok(fs.existsSync(file));
    assert.equal(retentionPlan(folder,crypto.randomBytes(32),2).remove.length,0);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test("cópia externa valida conteúdo, rejeita projeto, não sobrescreve e preserva origem em falha",()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"money-mirror-")),local=path.join(folder,"local"),remote=path.join(folder,"remote");
  fs.mkdirSync(remote);
  try{
    const file=saveBackup(local,empty(),key),copy=mirrorBackup(file,remote,key);
    assert.deepEqual(readBackup(copy,key),readBackup(file,key));
    assert.throws(()=>mirrorBackup(file,remote,key));assert.ok(fs.existsSync(file));
    assert.throws(()=>mirrorBackup(file,process.cwd(),key),/fora do projeto/);
    assert.throws(()=>mirrorBackup(file,path.join(folder,"ausente"),key),/montado/);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test("verificação detecta alteração financeira e exige sessões invalidadas por padrão",()=>{
  const dump=empty();dump.tables.session={count:1,rows:[{id:"session"}]};dump.totalRows=1;
  assert.throws(()=>compareRestoredDump(dump,dump),/Contagem: session/);
  assert.equal(compareRestoredDump(dump,dump,true).rowsCompared,1);
  const restored=empty();restored.tables.bankAccount={count:1,rows:[{id:"bank",balanceCents:"100"}]};
  assert.throws(()=>compareRestoredDump(empty(),restored),/Contagem/);
  restored.totalRows=1;assert.throws(()=>compareRestoredDump(restored,restored),/Saldo bancário/);
});
test("CLI gera cópia cifrada e ensaia restauração real de todos os modelos sem sessões nem efeitos externos",async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"money-backup-cli-")),database=path.join(folder,"test.db"),remote=path.join(folder,"remote"),local=path.join(folder,"local");
  const url=`file:${database.replaceAll("\\","/")}`,env={...process.env,DATABASE_URL:url,BACKUP_ENCRYPTION_KEY:key.toString("hex"),BACKUP_LOCAL_DIR:local,BACKUP_EXTERNAL_DIR:remote};
  fs.mkdirSync(remote);fs.writeFileSync(database,"",{flag:"wx"});
  const db=new PrismaClient({datasources:{db:{url}}});
  let reportFile:string|undefined;
  const restoredFile=path.resolve("prisma",`restore-cli-${crypto.randomUUID()}.db`);
  try{
    execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{env,stdio:"pipe"});
    const user=await db.user.create({data:{email:"restore@synthetic.invalid",name:"Fixture restauração",role:"ADMIN",passwordHash:"HASH-SINTETICO-SEM-CREDENCIAL"}});
    await db.session.create({data:{userId:user.id,tokenHash:"TOKEN-SINTETICO-SEM-CREDENCIAL",expiresAt:new Date(Date.now()+600000)}});
    const cli=(script:string,args:string[]=[],overrides:Record<string,string>={})=>execFileSync(process.execPath,["node_modules/tsx/dist/cli.mjs",`scripts/${script}.ts`,...args],{env:{...env,...overrides},stdio:"pipe",timeout:120000}).toString();
    const output=JSON.parse(cli("backup-operacional"));assert.equal(output.status,"COPIADO_E_VERIFICADO");
    const encrypted=fs.readFileSync(output.external);assert.ok(!encrypted.includes(Buffer.from(user.passwordHash)));
    const dump=readBackup(output.external,key);assert.deepEqual(dump.tables,(await exportDatabaseDump(db)).tables);
    assert.equal(dump.modelCount,39);assert.equal(dump.tables.session.count,1);
    const report=JSON.parse(cli("backup-rehearsal",[output.external]));reportFile=report.reportFile;
    assert.equal(report.status,"APROVADO");assert.equal(report.modelsCompared,39);assert.equal(report.sessions,"invalidadas");
    assert.equal(report.sourceSha256,crypto.createHash("sha256").update(encrypted).digest("hex"));
    assert.equal(await db.session.count(),1);
    cli("restore-backup",[output.external,restoredFile,"--isolated"]);
    assert.equal(JSON.parse(cli("verify-restoration",[output.external,restoredFile])).status,"APROVADO");
    assert.throws(()=>cli("restore-backup",[output.external,restoredFile,"--isolated"]));
    assert.throws(()=>cli("backup-rehearsal",[output.external],{BACKUP_ENCRYPTION_KEY:crypto.randomBytes(32).toString("hex")}));
    assert.throws(()=>cli("backup-operacional",[],{BACKUP_EXTERNAL_DIR:path.join(folder,"missing")}));
    assert.equal(fs.readdirSync(local).filter(x=>x.endsWith(".moneybak")).length,2);
  }finally{await db.$disconnect();if(reportFile)fs.rmSync(reportFile,{force:true});for(const suffix of ["","-journal","-wal","-shm"])fs.rmSync(restoredFile+suffix,{force:true});fs.rmSync(folder,{recursive:true,force:true});}
});
