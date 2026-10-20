import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {PrismaClient} from "@prisma/client";
import {restoreDatabaseDump,type DatabaseDump} from "../src/lib/backup-data";

async function main(){
  const [dumpFile,target,...flags]=process.argv.slice(2);
  if(!dumpFile||!target||!flags.includes("--isolated"))throw new Error("Uso: tsx scripts/restore-backup.ts dump.json prisma/restore-NOME.db --isolated [--include-sessions]");
  const resolved=path.resolve(target),folder=path.resolve("prisma");
  if(path.dirname(resolved)!==folder||!/^restore-[\w-]+\.db$/.test(path.basename(resolved))||fs.existsSync(resolved))throw new Error("Destino deve ser novo arquivo prisma/restore-NOME.db.");
  const dump=JSON.parse(fs.readFileSync(dumpFile,"utf8"))as DatabaseDump;
  const url=`file:${resolved.replaceAll("\\","/")}`;
  fs.writeFileSync(resolved,"",{flag:"wx"});
  execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{stdio:"inherit",env:{...process.env,DATABASE_URL:url}});
  const db=new PrismaClient({datasources:{db:{url}}});
  try{const counts=await restoreDatabaseDump(db,dump,flags.includes("--include-sessions"));console.log(JSON.stringify({target:resolved,counts,sessions:flags.includes("--include-sessions")?"restauradas para ensaio isolado":"invalidadas"},null,2));}
  finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
