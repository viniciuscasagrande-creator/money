import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";

async function runWithSqliteClient():Promise<void>{
  const args=process.argv.slice(2).filter(a=>a!=="--sqlite-ready");
  const [{PrismaClient,Prisma},{backupKeyRing,readBackup,inspectBackupMetadata,resolveBackupFromDestinations},{exportDatabaseDump,restoreDatabaseDump},{compareRestoredDump}]=await Promise.all([
    import("@prisma/client"),
    import("../src/lib/operational-backup"),
    import("../src/lib/backup-data"),
    import("../src/lib/backup-verification")
  ]);

  if(Prisma.dmmf.datamodel.models.length===0||!fs.readFileSync("node_modules/.prisma/client/schema.prisma","utf8").includes('provider = "sqlite"')){
    throw new Error("Gere o cliente SQLite para este ensaio local.");
  }

  const ring=backupKeyRing();
  let file=args[0];
  if(!file){
    const folders=[
      path.resolve(process.env.BACKUP_LOCAL_DIR??"backups/operacional"),
      ...(process.env.BACKUP_EXTERNAL_DIR?[process.env.BACKUP_EXTERNAL_DIR]:[]),
      ...(process.env.BACKUP_ARCHIVE_DIR?[process.env.BACKUP_ARCHIVE_DIR]:[])
    ];
    file=resolveBackupFromDestinations(folders,ring).sourceFile;
  }

  const started=Date.now();
  const meta=inspectBackupMetadata(file,ring);
  const dump=readBackup(file,ring);
  const folder=fs.realpathSync("prisma"),target=path.join(folder,`restore-rehearsal-${crypto.randomUUID()}.db`);
  const url=`file:${target.replaceAll("\\","/")}`;
  fs.writeFileSync(target,"",{flag:"wx",mode:0o600});
  const db=new PrismaClient({datasources:{db:{url}}});
  try{
    execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--schema=prisma/schema.prisma","--skip-generate"],{env:{...process.env,DATABASE_URL:url},stdio:"pipe"});
    await restoreDatabaseDump(db,dump);
    const comparison=compareRestoredDump(dump,await exportDatabaseDump(db));
    const report={
      status:"APROVADO",
      completedAt:new Date().toISOString(),
      elapsedMs:Date.now()-started,
      keyId:meta.keyId,
      ...comparison,
      sourceSha256:crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      scope:"SQLite isolado; workers e integrações não iniciados; não promove banco"
    };
    fs.mkdirSync("backups/rehearsals",{recursive:true});
    const reportFile=path.resolve("backups/rehearsals",`rehearsal-${crypto.randomUUID()}.json`);
    const latestFile=path.resolve("backups/rehearsals","latest.json");
    fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{flag:"wx",mode:0o600});
    fs.writeFileSync(latestFile,JSON.stringify({...report,reportFile},null,2),{mode:0o600});
    console.log(JSON.stringify({...report,reportFile},null,2));
  }finally{
    await db.$disconnect();
    // Somente os arquivos exclusivos criados por este ensaio, dentro do prisma resolvido.
    if(path.dirname(target)!==folder)throw new Error("Destino de limpeza inválido.");
    for(const suffix of ["","-wal","-shm","-journal"])fs.rmSync(target+suffix,{force:true});
  }
}

async function main(){
  const clientSchemaPath=path.resolve("node_modules/.prisma/client/schema.prisma");
  const isSqliteClient=fs.existsSync(clientSchemaPath)&&fs.readFileSync(clientSchemaPath,"utf8").includes('provider = "sqlite"');
  if(isSqliteClient||process.argv.includes("--sqlite-ready")){
    await runWithSqliteClient();
    return;
  }

  // Ambiente ativo está com cliente PostgreSQL: preserva o cliente atual, gera SQLite para o ensaio isolado e restaura no finally.
  const clientDir=path.resolve("node_modules/.prisma/client");
  const backupClientDir=path.resolve("node_modules/.prisma",`client-backup-${crypto.randomUUID()}`);
  if(fs.existsSync(clientDir)){
    fs.cpSync(clientDir,backupClientDir,{recursive:true});
  }
  try{
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js","generate","--schema=prisma/schema.prisma"],
      {env:{...process.env,DATABASE_URL:"file:./dev.db"},stdio:"pipe"}
    );
    const out=execFileSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs","scripts/backup-rehearsal.ts",...process.argv.slice(2),"--sqlite-ready"],
      {env:process.env,stdio:"pipe",timeout:120000}
    );
    process.stdout.write(out);
  }finally{
    if(fs.existsSync(backupClientDir)){
      fs.rmSync(clientDir,{recursive:true,force:true});
      fs.cpSync(backupClientDir,clientDir,{recursive:true});
      fs.rmSync(backupClientDir,{recursive:true,force:true});
    }
  }
}

main().catch(()=>{
  console.error("Ensaio de restauração REPROVADO. Verifique chave, arquivo, compatibilidade do schema e consistência financeira. Nenhum banco foi promovido.");
  process.exitCode=1;
});
