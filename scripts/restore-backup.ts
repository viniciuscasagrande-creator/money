import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {PrismaClient} from "@prisma/client";
import {restoreDatabaseDump,type DatabaseDump} from "../src/lib/backup-data";
import "dotenv/config";
import {backupKeyRing,readBackup,resolveBackupFromDestinations,inspectBackupMetadata} from "../src/lib/operational-backup";

async function main(){
  const [dumpFile,target,...flags]=process.argv.slice(2);
  if(!dumpFile||!target||!flags.includes("--isolated"))throw new Error("Uso: tsx scripts/restore-backup.ts dump.moneybak prisma/restore-NOME.db --isolated [--include-sessions] [--auto-fallback]");
  const resolved=path.resolve(target),folder=path.resolve("prisma");
  if(path.dirname(resolved)!==folder||!/^restore-[\w-]+\.db$/.test(path.basename(resolved))||fs.existsSync(resolved))throw new Error("Destino deve ser novo arquivo prisma/restore-NOME.db.");
  if(!dumpFile.endsWith(".moneybak")&&!flags.includes("--legacy-json"))throw new Error("JSON legado exige --legacy-json; use .moneybak para integridade autenticada.");

  const ring=backupKeyRing();
  let dump:DatabaseDump;
  let sourceUsed=dumpFile;
  let keyId:string|null=null;

  if(dumpFile.endsWith(".moneybak")){
    if(fs.existsSync(dumpFile)){
      keyId=inspectBackupMetadata(dumpFile,ring).keyId;
      dump=readBackup(dumpFile,ring);
    }else if(flags.includes("--auto-fallback")){
      const resolvedFallback=resolveBackupFromDestinations(
        [
          path.resolve(process.env.BACKUP_LOCAL_DIR??"backups/operacional"),
          ...(process.env.BACKUP_EXTERNAL_DIR?[process.env.BACKUP_EXTERNAL_DIR]:[]),
          ...(process.env.BACKUP_ARCHIVE_DIR?[process.env.BACKUP_ARCHIVE_DIR]:[])
        ],
        ring,
        path.basename(dumpFile)
      );
      dump=resolvedFallback.dump;
      sourceUsed=resolvedFallback.sourceFile;
      keyId=resolvedFallback.keyId;
    }else{
      throw new Error("Arquivo de backup não encontrado.");
    }
  }else{
    dump=JSON.parse(fs.readFileSync(dumpFile,"utf8"))as DatabaseDump;
  }

  const url=`file:${resolved.replaceAll("\\","/")}`;
  fs.writeFileSync(resolved,"",{flag:"wx"});
  execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{stdio:"inherit",env:{...process.env,DATABASE_URL:url}});
  const db=new PrismaClient({datasources:{db:{url}}});
  try{
    const counts=await restoreDatabaseDump(db,dump,flags.includes("--include-sessions"));
    console.log(JSON.stringify({target:resolved,sourceUsed,keyId,counts,sessions:flags.includes("--include-sessions")?"restauradas para ensaio isolado":"invalidadas"},null,2));
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error("Restauração REPROVADA. Confira chave, formato, schema, --isolated e destino novo prisma/restore-NOME.db. JSON legado exige --legacy-json. Detalhes de registros foram omitidos.");process.exitCode=1;});
