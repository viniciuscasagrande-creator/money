import fs from "node:fs";
import path from "node:path";
import {PrismaClient} from "@prisma/client";
import {exportDatabaseDump,type DatabaseDump} from "../src/lib/backup-data";
import "dotenv/config";
import {backupKeyRing,readBackup,inspectBackupMetadata} from "../src/lib/operational-backup";
import {compareRestoredDump} from "../src/lib/backup-verification";
async function main(){
  const [dumpFile,target,...flags]=process.argv.slice(2);
  if(!dumpFile||!target||!/^restore-[\w-]+\.db$/.test(path.basename(target)))throw new Error("Informe dump e banco isolado restore-NOME.db.");
  if(path.dirname(path.resolve(target))!==fs.realpathSync("prisma")||!fs.existsSync(target)||fs.lstatSync(target).isSymbolicLink())throw new Error("Destino deve ser banco existente dentro de prisma.");
  if(!dumpFile.endsWith(".moneybak")&&!flags.includes("--legacy-json"))throw new Error("JSON legado exige --legacy-json.");
  const ring=backupKeyRing();
  const original=dumpFile.endsWith(".moneybak")?readBackup(dumpFile,ring):JSON.parse(fs.readFileSync(dumpFile,"utf8"))as DatabaseDump;
  const keyId=dumpFile.endsWith(".moneybak")?inspectBackupMetadata(dumpFile,ring).keyId:null;
  const db=new PrismaClient({datasources:{db:{url:`file:${path.resolve(target).replaceAll("\\","/")}`}}});
  try{
    const restored=await exportDatabaseDump(db);
    console.log(JSON.stringify({status:"APROVADO",keyId,...compareRestoredDump(original,restored,flags.includes("--include-sessions"))},null,2));
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error("Verificação REPROVADA. Confira chave, schema, banco isolado existente, contagens, conteúdo e razão. Detalhes de registros foram omitidos.");process.exitCode=1;});
