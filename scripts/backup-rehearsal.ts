import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {PrismaClient,Prisma} from "@prisma/client";
import {backupKey,readBackup} from "../src/lib/operational-backup";
import {exportDatabaseDump,restoreDatabaseDump} from "../src/lib/backup-data";
import {compareRestoredDump} from "../src/lib/backup-verification";

async function main(){
  const [file]=process.argv.slice(2);if(!file)throw new Error("Uso: npm run backup:rehearse -- arquivo.moneybak");
  if(Prisma.dmmf.datamodel.models.length===0||!fs.readFileSync("node_modules/.prisma/client/schema.prisma","utf8").includes('provider = "sqlite"'))throw new Error("Gere o cliente SQLite para este ensaio local.");
  const started=Date.now(),dump=readBackup(file,backupKey());
  const folder=fs.realpathSync("prisma"),target=path.join(folder,`restore-rehearsal-${crypto.randomUUID()}.db`);
  const url=`file:${target.replaceAll("\\","/")}`;
  fs.writeFileSync(target,"",{flag:"wx",mode:0o600});
  const db=new PrismaClient({datasources:{db:{url}}});
  try{
    execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--schema=prisma/schema.prisma","--skip-generate"],{env:{...process.env,DATABASE_URL:url},stdio:"pipe"});
    await restoreDatabaseDump(db,dump);
    const comparison=compareRestoredDump(dump,await exportDatabaseDump(db));
    const report={status:"APROVADO",completedAt:new Date().toISOString(),elapsedMs:Date.now()-started,...comparison,sourceSha256:crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),scope:"SQLite isolado; workers e integrações não iniciados; não promove banco"};
    fs.mkdirSync("backups/rehearsals",{recursive:true});
    const reportFile=path.resolve("backups/rehearsals",`rehearsal-${crypto.randomUUID()}.json`);
    fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{flag:"wx",mode:0o600});
    console.log(JSON.stringify({...report,reportFile},null,2));
  }finally{
    await db.$disconnect();
    // Somente os arquivos exclusivos criados por este ensaio, dentro do prisma resolvido.
    if(path.dirname(target)!==folder)throw new Error("Destino de limpeza inválido.");
    for(const suffix of ["","-wal","-shm","-journal"])fs.rmSync(target+suffix,{force:true});
  }
}
main().catch(()=>{console.error("Ensaio de restauração REPROVADO. Verifique chave, arquivo, compatibilidade do schema e consistência financeira. Nenhum banco foi promovido.");process.exitCode=1;});
