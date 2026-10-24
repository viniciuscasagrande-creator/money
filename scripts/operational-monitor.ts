import "dotenv/config";
import {prisma} from "../src/lib/prisma";
import {evaluateOperationalMonitor,dispatchOperationalNotifications,webhookConfig} from "../src/lib/operational-monitor";
import {withOperationContext,operationalLog} from "../src/lib/observability";

withOperationContext("monitor",async()=>{
  try{
    const args=process.argv.slice(2);
    if(args.length>1||args[0]&&!['--check','--dispatch'].includes(args[0]))throw new Error("Opção inválida.");
    if(args[0]==="--dispatch"){
      const result=await dispatchOperationalNotifications(prisma,webhookConfig());
      operationalLog("monitor_completed",{count:result.sent});
      if(result.failed)process.exitCode=1;
    }else{
      const result=await evaluateOperationalMonitor(prisma);
      console.log(JSON.stringify(result));operationalLog("monitor_completed",{count:result.enqueued});
      if(result.signals.some(x=>x.active))process.exitCode=2;
    }
  }catch{operationalLog("monitor_failed",{code:"MONITOR_UNAVAILABLE"});process.exitCode=1;}
  finally{await prisma.$disconnect().catch(()=>{operationalLog("monitor_failed",{code:"DISCONNECT_FAILED"});process.exitCode=1;});}
});
