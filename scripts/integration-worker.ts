import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { processIntegrationQueue } from "../src/lib/integration-queue";
const option=process.argv.slice(2);
if(option.some(v=>!/^--limit=\d+$/.test(v))||option.length>1)throw new Error("Use integration:work -- --limit=10 (de 1 a 20).");
const limit=option.length?Number(option[0].split("=")[1]):10;
processIntegrationQueue(prisma,limit).then(results=>console.log(JSON.stringify({processed:results.length,results})))
  .catch(()=>{console.error("Falha no worker de integração; verifique conectividade, migrações e fila.");process.exitCode=1;})
  .finally(()=>prisma.$disconnect());
