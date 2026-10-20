import "dotenv/config";
import fs from "node:fs";
import {prisma} from "../src/lib/prisma";
import {exportDatabaseDump} from "../src/lib/backup-data";
import {migrateLegacyFinance} from "../src/lib/legacy-finance-migration";
async function main(){
  const dump=await exportDatabaseDump(prisma);
  fs.mkdirSync("backups",{recursive:true});
  const file=`backups/pre-migration-${Date.now()}.json`;
  fs.writeFileSync(file,JSON.stringify(dump,null,2),{flag:"wx"});
  console.log(JSON.stringify({backup:file,result:await migrateLegacyFinance(prisma)},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
