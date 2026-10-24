import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { processIntegrationQueue } from "../src/lib/integration-queue";
import {monitorHeartbeat} from "../src/lib/operational-monitor";
import {withOperationContext,operationalLog} from "../src/lib/observability";
withOperationContext("worker",async()=>{
  try{
    const option=process.argv.slice(2);
    if(option.some(v=>!/^--limit=\d+$/.test(v))||option.length>1)throw new Error("Opção inválida.");
    const limit=option.length?Number(option[0].split("=")[1]):10;
    const results=await processIntegrationQueue(prisma,limit);
    await monitorHeartbeat(prisma,"worker");
    operationalLog("worker_completed",{count:results.length});
  }catch{operationalLog("worker_failed",{code:"WORKER_UNAVAILABLE"});process.exitCode=1;}
  finally{await prisma.$disconnect().catch(()=>{operationalLog("worker_failed",{code:"DISCONNECT_FAILED"});process.exitCode=1;});}
});
