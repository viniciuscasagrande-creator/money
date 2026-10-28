import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {Prisma,PrismaClient} from "@prisma/client";
import {
  exportDatabaseDump,
  identifyDatabaseEnvironment,
  summarizeDatabaseDump,
  detectBackupRegression,
  auditBackupFinancialConsistency,
  checkBackupCompatibility,
  migrateLegacyDump,
  type DatabaseDump
} from "../src/lib/backup-data";
import {
  backupKey,
  backupKeyId,
  backupKeyRing,
  encodeBackup,
  encodeLegacyCompatibleBackup,
  decodeBackup,
  saveBackup,
  readBackup,
  mirrorBackup,
  retentionPlan,
  applyRetention,
  inspectBackupMetadata,
  rotateBackupFileKey,
   decodeEncryptedArchive,
  saveEncryptedArchive,
  readEncryptedArchive,
  distributeBackupCopies,
  resolveBackupFromDestinations,
  redactSensitiveBackupText,
  compareBackupFiles,
  validateBackupFinancialFile,
  previewBackupRecovery,
  executeAssistedRecovery,
  rollbackAssistedRecovery,
  ASSISTED_RECOVERY_CONFIRMATION,
  authorizeAndAuditBackupOperation,
  runBackupRecoveryHomologation,
  backupScheduleConfig,
  acquireBackupExecutionLock,
  releaseBackupExecutionLock,
  runScheduledBackupWithLockAndRetry,
  preflightCapacityCheck,
  benchmarkLargeVolumeBackup,
  saveImmutableProtectedCopy,
  applyImmutableAwareRetention,
  packEncryptedAttachmentsBundle,
  restoreAndVerifyAttachmentsBundle,
  verifyCleanMachineRecovery,
  generateFinalMaintenanceDossier
} from "../src/lib/operational-backup";
import {compareRestoredDump} from "../src/lib/backup-verification";
import {inspectBackupOperationsHealth,recordLocalBackupHistory} from "../src/lib/operational-monitor";

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
test("Pacotes 1 a 6: conferência de ambiente/regressão, pacote ZIP cifrado, rotação de chave, 3 destinos com fallback e monitoramento de falhas",()=>{
  // Pacote 1: ambiente mascarado, totais financeiros e alerta de redução de registros
  const envInfo=identifyDatabaseEnvironment({
    DATABASE_URL:"postgresql://admin:segredo123@ep-synthetic-host.neon.tech/neondb?sslmode=require",
    NEON_BRANCH:"production",
    MONITOR_ENVIRONMENT:"production"
  });
  assert.equal(envInfo.provider,"postgresql");
  assert.equal(envInfo.targetHost,"ep-synthetic-host.neon.tech/neondb");
  assert.ok(!JSON.stringify(envInfo).includes("segredo123"));

  const baseDump=empty();
  baseDump.tables.bankAccount={count:1,rows:[{id:"acc1",name:"Conta Principal",institution:"Itau",lastFour:"0011",balanceCents:"200000",active:true,createdAt:new Date().toISOString()}]};
  baseDump.tables.ledgerEntry={count:1,rows:[{id:"led1",direction:"CREDIT",origin:"OPENING",amountCents:"200000",description:"Abertura",bankAccountId:"acc1",titleId:null,payoutId:null,producerId:null,eventId:null,createdAt:new Date().toISOString()}]};
  baseDump.tables.session={count:5,rows:[{id:"s1"},{id:"s2"},{id:"s3"},{id:"s4"},{id:"s5"}]};
  baseDump.totalRows=7;

  const summary=summarizeDatabaseDump(baseDump);
  assert.equal(summary.businessRows,2);
  assert.equal(summary.financialTotals.totalBankBalanceCents,"200000");
  assert.equal(summary.financialTotals.bankLedgerReconciled,true);

  const reducedSessionOnly=structuredClone(baseDump);
  reducedSessionOnly.tables.session={count:1,rows:[{id:"s1"}]};
  reducedSessionOnly.totalRows=3;
  assert.equal(detectBackupRegression(reducedSessionOnly,baseDump).regressionDetected,false);

  const reducedBusiness=structuredClone(baseDump);
  reducedBusiness.tables.bankAccount={count:0,rows:[]};
  reducedBusiness.totalRows=6;
  const regAlert=detectBackupRegression(reducedBusiness,baseDump);
  assert.equal(regAlert.regressionDetected,true);
  assert.equal(regAlert.regressions[0]?.table,"bankAccount");

  // Pacote 2: criptografia autenticada do pacote completo (.moneyzip)
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"money-pkg2356-"));
  try{
    const sampleZip=Buffer.from("PK\x03\x04SYNTHETIC_ZIP_BINARY_PAYLOAD");
    const manifest={system:"SOUL Financeiro ERP",version:"5.2.1",createdAt:"2026-10-27T22:00:00.000Z"};
    const archivePath=path.join(dir,"money-full-20261027T220000000Z-aabbccddeeff00112233445566778899.moneyzip");
    const savedArchive=saveEncryptedArchive(archivePath,sampleZip,manifest,key);
    assert.equal(savedArchive.keyId,backupKeyId(key));
    const openedArchive=readEncryptedArchive(archivePath,key);
    assert.deepEqual(openedArchive.zipBytes,sampleZip);
    assert.equal(openedArchive.keyId,backupKeyId(key));
    assert.throws(()=>readEncryptedArchive(archivePath,crypto.randomBytes(32)),/chave incorreta/);
    const tamperedArchive=Buffer.from(fs.readFileSync(archivePath));
    tamperedArchive[tamperedArchive.length-1]^=1;
    assert.throws(()=>decodeEncryptedArchive(tamperedArchive,key),/corrompido/);

    // Pacote 3: identificação sem expor a chave, rotação de chave preservando leitura anterior e sanitização
    const oldKey=crypto.randomBytes(32);
    const newKey=crypto.randomBytes(32);
    const oldHex=oldKey.toString("hex"),newHex=newKey.toString("hex");
    const ring=backupKeyRing(newHex,oldHex);
    assert.equal(ring.primaryId,backupKeyId(newKey));
    assert.equal(ring.candidates.length,2);
    assert.ok(!ring.primaryId.includes(newHex.slice(0,16)));

    const localDir=path.join(dir,"local"),extDir=path.join(dir,"external"),archDir=path.join(dir,"archive");
    fs.mkdirSync(localDir);fs.mkdirSync(extDir);fs.mkdirSync(archDir);

    const oldBackupFile=saveBackup(localDir,baseDump,oldKey);
    const metaOld=inspectBackupMetadata(oldBackupFile,ring);
    assert.equal(metaOld.keyId,backupKeyId(oldKey));
    assert.deepEqual(readBackup(oldBackupFile,ring),baseDump);

    const rotated=rotateBackupFileKey(oldBackupFile,ring,localDir);
    assert.equal(rotated.previousKeyId,backupKeyId(oldKey));
    assert.equal(rotated.newKeyId,backupKeyId(newKey));
    assert.deepEqual(readBackup(rotated.rotatedFile,newKey),baseDump);

    const leaked=redactSensitiveBackupText(`Erro com chave ${newHex} e url postgresql://u:p@host/db`,[newHex]);
    assert.ok(!leaked.includes(newHex));
    assert.ok(!leaked.includes("u:p@"));

    // Pacote 5: distribuição em 3 destinos independentes e fallback automático quando destinos ficam indisponíveis
    const dist=distributeBackupCopies(rotated.rotatedFile,{externalDir:extDir,archiveDir:archDir},ring,{localKeep:2,externalKeep:2,archiveKeep:2});
    assert.ok(fs.existsSync(dist.local));
    assert.ok(fs.existsSync(dist.external));
    assert.ok(dist.archive&&fs.existsSync(dist.archive));

    // Simular perda do destino local e corrupção do destino externo -> recupera do arquivo histórico (3º destino)
    fs.rmSync(localDir,{recursive:true,force:true});
    fs.writeFileSync(dist.external,"corrompido");
    const recovered=resolveBackupFromDestinations([localDir,extDir,archDir],ring);
    assert.equal(recovered.failoverUsed,true);
    assert.equal(recovered.sourceFolder,archDir);
    assert.deepEqual(recovered.dump,baseDump);

    // Pacote 6: monitoramento de falhas simuladas (destino desconectado, falta de espaço, atraso e falha registrada)
    const historyFile=path.join(dir,"history.json");
    recordLocalBackupHistory({
      status:"REPROVADO",
      phase:"COPIA_EXTERNA",
      regressionDetected:true,
      diagnostic:`Falha simulada com segredo ${newHex}`
    },historyFile);

    const health=inspectBackupOperationsHealth({
      localDir:path.join(dir,"inexistente"),
      externalDir:extDir,
      archiveDir:archDir,
      rehearsalsDir:path.join(dir,"rehearsals-vazio"),
      historyFile,
      keyOrRing:ring,
      simulatedFreeBytes:{archive:1024},
      minFreeBytes:10*1024*1024,
      backupMaxHours:1,
      now:new Date(Date.now()+5*3600000)
    });
    assert.equal(health.status,"CRITICAL");
    const codes=new Set(health.alerts.map(a=>a.code));
    assert.ok(codes.has("DESTINATION_DISCONNECTED"));
    assert.ok(codes.has("DESTINATION_EMPTY_OR_INVALID"));
    assert.ok(codes.has("LOW_DISK_SPACE"));
    assert.ok(codes.has("BACKUP_STALE"));
    assert.ok(codes.has("REHEARSAL_MISSING_OR_FAILED"));
    assert.ok(codes.has("BACKUP_EXECUTION_FAILED"));
    assert.ok(codes.has("DATA_REGRESSION_ALERT"));
    assert.ok(!JSON.stringify(health).includes(newHex));
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test("Pacotes 7, 8 e 10: comparação entre .moneybak, validação financeira de inconsistências e compatibilidade/migração de versões",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"money-pkg7810-"));
  try{
    // Pacote 7: comparar dois .moneybak (incluídos, alterados, removidos, saldos e períodos)
    const dumpA=empty();
    dumpA.exportedAt="2026-10-25T10:00:00.000Z";
    dumpA.tables.user={count:2,rows:[
      {id:"u1",name:"Admin Original",email:"admin@local",passwordHash:"hash1",role:"ADMIN",active:true,producerId:null,createdAt:"2026-10-20T00:00:00.000Z"},
      {id:"u2",name:"Operador Removido",email:"op@local",passwordHash:"hash2",role:"FINANCE_DISK",active:true,producerId:null,createdAt:"2026-10-20T00:00:00.000Z"}
    ]};
    dumpA.tables.bankAccount={count:1,rows:[{id:"b1",name:"Conta 1",institution:"Itau",lastFour:"0011",balanceCents:"100000",active:true,createdAt:"2026-10-20T00:00:00.000Z"}]};
    dumpA.tables.ledgerEntry={count:1,rows:[{id:"l1",direction:"CREDIT",origin:"OPENING",amountCents:"100000",description:"Abertura",bankAccountId:"b1",titleId:null,payoutId:null,producerId:null,eventId:null,createdAt:"2026-10-25T08:00:00.000Z"}]};
    dumpA.totalRows=4;

    const dumpB=structuredClone(dumpA);
    dumpB.exportedAt="2026-10-27T10:00:00.000Z";
    dumpB.tables.user={count:2,rows:[
      {id:"u1",name:"Admin Renomeado",email:"admin@local",passwordHash:"hash1",role:"ADMIN",active:true,producerId:null,createdAt:"2026-10-20T00:00:00.000Z"},
      {id:"u3",name:"Novo Produtor",email:"prod@local",passwordHash:"hash3",role:"PRODUCER",active:true,producerId:null,createdAt:"2026-10-27T00:00:00.000Z"}
    ]};
    dumpB.tables.bankAccount.rows[0]!.balanceCents="250000";
    dumpB.tables.ledgerEntry.rows.push({
      id:"l2",direction:"CREDIT",origin:"RECEIPT",amountCents:"150000",description:"Recebimento",bankAccountId:"b1",titleId:null,payoutId:null,producerId:null,eventId:null,createdAt:"2026-10-27T09:00:00.000Z"
    });
    dumpB.tables.ledgerEntry.count=2;
    dumpB.totalRows=5;

    const fileA=saveBackup(dir,dumpA,key);
    const fileB=saveBackup(dir,dumpB,key);
    const diff=compareBackupFiles(fileA,fileB,key);
    assert.equal(diff.summary.totalAdded,2); // u3 + l2
    assert.equal(diff.summary.totalRemoved,1); // u2
    assert.equal(diff.summary.totalModified,2); // u1.name + b1.balanceCents
    assert.equal(diff.financialDelta.deltaBankBalanceCents,"150000");
    assert.equal(diff.periodMovements.length,2);
    const userDiff=diff.tableDiffs.find(t=>t.table==="user")!;
    assert.deepEqual(userDiff.addedIds,["u3"]);
    assert.deepEqual(userDiff.removedIds,["u2"]);
    assert.deepEqual(userDiff.modifiedRecords,[{id:"u1",changedFields:["name"]}]);

    // Pacote 8: validação financeira detectando saldo divergente, órfão, valor inválido, duplicidade e baixa inconsistente
    const invalidDump=structuredClone(dumpB);
    invalidDump.tables.bankAccount.rows[0]!.balanceCents="999999"; // diverge do razão (250000)
    invalidDump.tables.ledgerEntry.rows.push(
      {id:"l-dup-open",direction:"CREDIT",origin:"OPENING",amountCents:"10000",description:"Abertura duplicada",bankAccountId:"b1",titleId:null,payoutId:null,producerId:null,eventId:null,createdAt:"2026-10-27T09:00:00.000Z"},
      {id:"l-orphan",direction:"DEBIT",origin:"PAYMENT",amountCents:"0",description:"Valor zero e conta órfã",bankAccountId:"conta-inexistente",titleId:null,payoutId:null,producerId:null,eventId:null,createdAt:"2026-10-27T09:00:00.000Z"}
    );
    invalidDump.tables.ledgerEntry.count=4;
    invalidDump.tables.financialTitle={count:1,rows:[{
      id:"t-settled-sem-razao",kind:"RECEIVABLE",status:"SETTLED",description:"Título baixado sem lançamento",amountCents:"50000",dueDate:"2026-10-27T00:00:00.000Z",settledAt:"2026-10-27T10:00:00.000Z",producerId:null,eventId:null,createdAt:"2026-10-27T00:00:00.000Z"
    }]};
    invalidDump.totalRows=8;

    const invalidFile=saveBackup(dir,invalidDump,key);
    const finReport=validateBackupFinancialFile(invalidFile,key);
    assert.equal(finReport.valid,false);
    const incCodes=new Set(finReport.inconsistencies.map(i=>i.code));
    assert.ok(incCodes.has("BANK_LEDGER_DIVERGENCE"));
    assert.ok(incCodes.has("ORPHAN_REFERENCE"));
    assert.ok(incCodes.has("INVALID_AMOUNT"));
    assert.ok(incCodes.has("DUPLICATE_RECORD"));
    assert.ok(incCodes.has("PAYMENT_RECEIPT_MISMATCH"));
    assert.ok(finReport.inconsistencies.some(i=>i.recordId==="t-settled-sem-razao"));

    // Pacote 10: compatibilidade entre versões, migração de formato legado e bloqueio de formato incompatível
    const legacyRaw={
      version:"SOUL-v5.0",
      exportedAt:"2026-10-01T00:00:00.000Z",
      modelCount:2,
      totalRows:2,
      tables:{
        user:{count:1,rows:[{id:"u-leg",name:"Legado",email:"leg@local",passwordHash:"hash",role:"ADMIN",active:true,producerId:null,createdAt:"2026-10-01T00:00:00.000Z"}]},
        auditLog:{count:1,rows:[{id:"a-leg",action:"INIT",entity:"System",entityId:"1",summary:"Sem requestId",actorId:"u-leg",createdAt:"2026-10-01T00:00:00.000Z"}]}
      }
    };
    const compat=checkBackupCompatibility(legacyRaw,1);
    assert.equal(compat.compatible,true);
    assert.equal(compat.migrationRequired,true);
    assert.ok(compat.missingModelsFilled.includes("operationalNotification"));

    const legacyBytes=encodeLegacyCompatibleBackup(legacyRaw,key,1);
    const migratedDump=decodeBackup(legacyBytes,key,{allowLegacyMigration:true});
    assert.equal(migratedDump.version,"SOUL-v5.2.1");
    assert.equal(migratedDump.modelCount,Prisma.dmmf.datamodel.models.length);
    assert.equal(migratedDump.tables.user.count,1);
    assert.equal(migratedDump.tables.auditLog.rows[0]?.requestId,null);

    assert.equal(checkBackupCompatibility(legacyRaw,99).compatible,false);
    assert.equal(checkBackupCompatibility({...legacyRaw,version:"SOUL-v9.9"},1).compatible,false);
    assert.throws(()=>migrateLegacyDump({...legacyRaw,tables:{tabelaDesconhecida:{count:0,rows:[]}}},1),/modelos desconhecidos/);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test("CLI gera cópia cifrada, ensaia restauração e valida Pacotes 9, 11 e 12 (recuperação assistida, auditoria de acesso e homologação RTO/RPO)",async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"money-backup-cli-")),database=path.join(folder,"test.db"),remote=path.join(folder,"remote"),local=path.join(folder,"local");
  const url=`file:${database.replaceAll("\\","/")}`,env={...process.env,DATABASE_URL:url,BACKUP_ENCRYPTION_KEY:key.toString("hex"),BACKUP_LOCAL_DIR:local,BACKUP_EXTERNAL_DIR:remote};
  fs.mkdirSync(remote);fs.writeFileSync(database,"",{flag:"wx"});
  const db=new PrismaClient({datasources:{db:{url}}});
  let reportFile:string|undefined;
  const restoredFile=path.resolve("prisma",`restore-cli-${crypto.randomUUID()}.db`);
  try{
    execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{env,stdio:"pipe"});
    const user=await db.user.create({data:{email:"restore@synthetic.invalid",name:"Fixture restauração",role:"ADMIN",passwordHash:"HASH-SINTETICO-SEM-CREDENCIAL"}});
    const financeUser=await db.user.create({data:{email:"fin@synthetic.invalid",name:"Operador Financeiro",role:"FINANCE_DISK",passwordHash:"HASH-SINTETICO"}});
    await db.session.create({data:{userId:user.id,tokenHash:"TOKEN-SINTETICO-SEM-CREDENCIAL",expiresAt:new Date(Date.now()+600000)}});
    const cli=(script:string,args:string[]=[],overrides:Record<string,string>={})=>execFileSync(process.execPath,["node_modules/tsx/dist/cli.mjs",`scripts/${script}.ts`,...args],{env:{...env,...overrides},stdio:"pipe",timeout:120000}).toString();
    const before=await exportDatabaseDump(db);
    const output=JSON.parse(cli("backup-operacional"));assert.equal(output.status,"COPIADO_E_VERIFICADO");
    assert.equal(output.keyId,backupKeyId(key));
    const encrypted=fs.readFileSync(output.external);assert.ok(!encrypted.includes(Buffer.from(user.passwordHash)));
    const dump=readBackup(output.external,key);assert.deepEqual(dump.tables,before.tables);
    assert.equal(dump.modelCount,Prisma.dmmf.datamodel.models.length);assert.equal(dump.tables.session.count,1);
    const report=JSON.parse(cli("backup-rehearsal",[output.external]));reportFile=report.reportFile;
    assert.equal(report.status,"APROVADO");assert.equal(report.modelsCompared,dump.modelCount);assert.equal(report.sessions,"invalidadas");
    assert.equal(report.keyId,backupKeyId(key));
    assert.equal(report.sourceSha256,crypto.createHash("sha256").update(encrypted).digest("hex"));
    assert.equal(await db.session.count(),1);
    cli("restore-backup",[output.external,restoredFile,"--isolated"]);
    assert.equal(JSON.parse(cli("verify-restoration",[output.external,restoredFile])).status,"APROVADO");
    assert.throws(()=>cli("restore-backup",[output.external,restoredFile,"--isolated"]));
    assert.throws(()=>cli("backup-rehearsal",[output.external],{BACKUP_ENCRYPTION_KEY:crypto.randomBytes(32).toString("hex")}));
    assert.throws(()=>cli("backup-operacional",[],{BACKUP_EXTERNAL_DIR:path.join(folder,"missing")}));
    assert.equal(fs.readdirSync(local).filter(x=>x.endsWith(".moneybak")).length,2);

    // Pacote 11: restrição de acesso por permissão e registro em auditLog sem dados sensíveis
    await assert.rejects(
      ()=>authorizeAndAuditBackupOperation(db,financeUser.id,"BACKUP_RESTORE_PREVIEWED",output.external,"Tentativa sem permissão",async()=>previewBackupRecovery(output.external,key)),
      /Somente Administrador/
    );
    assert.equal(await db.auditLog.count({where:{action:"BACKUP_ACCESS_DENIED",actorId:financeUser.id}}),1);

    const preview=await authorizeAndAuditBackupOperation(
      db,
      user.id,
      "BACKUP_RESTORE_PREVIEWED",
      output.external,
      `Prévia autorizada com segredo ${key.toString("hex")}`,
      async()=>previewBackupRecovery(output.external,key)
    );
    assert.equal(preview.valid,true);
    const auditEntry=await db.auditLog.findFirstOrThrow({where:{action:"BACKUP_RESTORE_PREVIEWED",actorId:user.id}});
    assert.ok(!auditEntry.summary.includes(key.toString("hex")));

    // Pacote 9: recuperação assistida com confirmação explícita, cópia pré-restauração, sessões invalidadas e rollback testado
    const safetyDir=path.join(folder,"safety");
    await assert.rejects(
      ()=>executeAssistedRecovery({db,backupFile:output.external,keyOrRing:key,safetyBackupFolder:safetyDir,confirmationToken:"TOKEN_ERRADO"}),
      /Confirmação explícita/
    );
    const recovery=await executeAssistedRecovery({
      db,
      backupFile:output.external,
      keyOrRing:key,
      safetyBackupFolder:safetyDir,
      confirmationToken:ASSISTED_RECOVERY_CONFIRMATION
    });
    assert.equal(recovery.status,"RECUPERADO_COM_SEGURANCA");
    assert.equal(recovery.activeSessionsAfterRestore,0);
    assert.ok(fs.existsSync(recovery.preRestoreSafetyBackupFile));

    const rollback=await rollbackAssistedRecovery({
      db,
      safetyBackupFile:recovery.preRestoreSafetyBackupFile,
      keyOrRing:key
    });
    assert.equal(rollback.status,"ROLLBACK_CONCLUIDO");

    // Pacote 12: homologação completa de recuperação (corrupção, chave incorreta, failover, interrupção e RTO/RPO)
    const homologReportPath=path.join(folder,"homologacao-p12.json");
    const homolog=await runBackupRecoveryHomologation({db,outputReportPath:homologReportPath});
    assert.equal(homolog.status,"APROVADO");
    assert.equal(homolog.scenarios.corruptedFileBlocked,true);
    assert.equal(homolog.scenarios.wrongKeyBlocked,true);
    assert.equal(homolog.scenarios.rotatedKeyRecovered,true);
    assert.equal(homolog.scenarios.destinationFailoverRecovered,true);
    assert.equal(homolog.scenarios.interruptedGenerationPreservedValidCopies,true);
    assert.equal(homolog.scenarios.assistedRecoveryAndRollbackVerified,true);
    assert.ok(homolog.metrics.rtoMs>0);
    assert.ok(homolog.metrics.rpoMinutes>=4.9);
    assert.ok(fs.existsSync(homologReportPath));

    // Pacote 13: agendamento confiável com bloqueio de concorrência e retry com backoff
    const lockDir=path.join(folder,"lock-dir");
    const activeLock=acquireBackupExecutionLock(lockDir,60000);
    assert.throws(()=>acquireBackupExecutionLock(lockDir,60000),/EXECUCAO_SIMULTANEA_BLOQUEADA/);
    releaseBackupExecutionLock(activeLock);

    let scheduledAttempts=0;
    const schedHistFile=path.join(folder,"sched-history.json");
    const scheduledRun=await runScheduledBackupWithLockAndRetry({
      lockFolder:lockDir,
      schedule:backupScheduleConfig({BACKUP_MAX_RETRIES:"3",BACKUP_RETRY_DELAY_MS:"10"}),
      historyFile:schedHistFile,
      task:async(attempt)=>{
        scheduledAttempts=attempt;
        if(attempt<2)throw new Error("Falha transitória simulada de rede");
        return "SUCESSO_APOS_RETRY";
      }
    });
    assert.equal(scheduledRun.status,"EXECUTADO");
    assert.equal(scheduledRun.attemptsUsed,2);
    assert.equal(scheduledAttempts,2);

    // Pacote 14: capacidade prévia e benchmark com volume elevado
    assert.throws(()=>preflightCapacityCheck(folder,50*1024*1024,100*1024*1024,10*1024*1024),/ESPACO_INSUFICIENTE/);
    const capOk=preflightCapacityCheck(folder,1024*1024,10*1024*1024,500*1024*1024);
    assert.equal(capOk.sufficient,true);
    const bench=benchmarkLargeVolumeBackup(1000,key,10000);
    assert.equal(bench.withinLimits,true);
    assert.equal(bench.totalRows,2001);
    assert.ok(bench.compressionRatio<0.5);

    // Pacote 15: proteção contra exclusão (WORM / imutabilidade e retenção protegida)
    const immDir=path.join(folder,"immutable");
    const b1=saveBackup(local,{...empty(),exportedAt:"2026-10-20T00:00:00.000Z"},key);
    const b2=saveBackup(local,{...empty(),exportedAt:"2026-10-21T00:00:00.000Z"},key);
    const b3=saveBackup(local,{...empty(),exportedAt:"2026-10-22T00:00:00.000Z"},key);
    const p1=saveImmutableProtectedCopy(b1,immDir,key,30);
    saveImmutableProtectedCopy(b2,immDir,key,30);
    saveImmutableProtectedCopy(b3,immDir,key,30);
    // Excluir cópia local não elimina a cópia protegida
    fs.unlinkSync(b1);
    assert.ok(fs.existsSync(p1.protectedFile));
    // Retenção não apaga cópias dentro da janela de imutabilidade
    const protRet=applyImmutableAwareRetention(immDir,key,2);
    assert.equal(protRet.removed.length,0);
    assert.equal(protRet.blockedByImmutability.length,1);
    assert.ok(fs.existsSync(p1.protectedFile));

    // Pacote 16: anexos e arquivos vinculados com verificação de integridade e referências
    const attachSrc=path.join(folder,"attachments-src");
    const attachDst=path.join(folder,"attachments-dst");
    fs.mkdirSync(path.join(attachSrc,"comprovantes"),{recursive:true});
    fs.writeFileSync(path.join(attachSrc,"comprovantes","recibo-001.pdf"),Buffer.from("PDF_COMPROVANTE_SINTETICO"));
    const refs=[{recordType:"FinancialTitle",recordId:user.id,relativePath:"comprovantes/recibo-001.pdf"}];
    const attachBundle=packEncryptedAttachmentsBundle(attachSrc,refs,key);
    const attachRestored=restoreAndVerifyAttachmentsBundle(attachBundle,attachDst,key,new Set([user.id]));
    assert.equal(attachRestored.status,"ANEXOS_RESTAURADOS_E_VERIFICADOS");
    assert.equal(attachRestored.filesRestored,1);
    assert.equal(attachRestored.brokenLinks,0);
    assert.throws(
      ()=>packEncryptedAttachmentsBundle(attachSrc,[{recordType:"FinancialTitle",recordId:user.id,relativePath:"comprovantes/inexistente.pdf"}],key),
      /ANEXOS_COM_VINCULO_QUEBRADO/
    );

    // Pacote 17: recuperação em outro computador (ambiente limpo isolado + chave separada)
    const cleanMachineResult=await verifyCleanMachineRecovery({
      sourceDump:before,
      separateVaultKeyHex:key.toString("hex")
    });
    assert.equal(cleanMachineResult.status,"AMBIENTE_LIMPO_OPERACIONAL");
    assert.equal(cleanMachineResult.bankLedger,"reconciliado");
    assert.equal(cleanMachineResult.financialConsistencyValid,true);

    // Pacote 18: dossiê final consolidado dos 18 pacotes e rotina de manutenção
    const dossierPath=path.join(folder,"dossie-1-18.json");
    const dossier=generateFinalMaintenanceDossier({dump:before,keyOrRing:key,outputDossierPath:dossierPath});
    assert.equal(Object.keys(dossier.packagesStatus).length,18);
    assert.ok(Object.values(dossier.packagesStatus).every(v=>v==="APROVADO"));
    assert.ok(dossier.maintenanceScheduleAndResponsibilities.length>=5);
    assert.ok(fs.existsSync(dossierPath));
  }finally{await db.$disconnect();if(reportFile)fs.rmSync(reportFile,{force:true});for(const suffix of ["","-journal","-wal","-shm"])fs.rmSync(restoredFile+suffix,{force:true});fs.rmSync(folder,{recursive:true,force:true});}
});
