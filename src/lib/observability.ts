import {AsyncLocalStorage} from "node:async_hooks";
import {randomUUID} from "node:crypto";

type Context={requestId:string;route:string;method:string;failure?:string};
const globalContext=globalThis as unknown as {moneyRequestContext?:AsyncLocalStorage<Context>};
export const requestContext=globalContext.moneyRequestContext??=new AsyncLocalStorage<Context>();
export const currentRequestId=()=>requestContext.getStore()?.requestId;
export const validRequestId=(value:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
type Event="http_request"|"operation_failure"|"worker_completed"|"worker_failed"|"monitor_completed"|"monitor_failed"|"notification_sent"|"notification_failed";
// Lista fechada: não serializa Error, stack, URL, cabeçalhos, corpo, SQL nem atributos livres.
export function operationalLog(event:Event,fields:{status?:number;durationMs?:number;count?:number;code?:string}={}){
  const context=requestContext.getStore();
  const record={timestamp:new Date().toISOString(),event,...(context?{requestId:context.requestId,route:context.route,method:context.method}:{}),
    ...(Number.isSafeInteger(fields.status)?{status:fields.status}:{}),
    ...(Number.isFinite(fields.durationMs)?{durationMs:Math.max(0,Math.round(fields.durationMs!))}:{}),
    ...(Number.isSafeInteger(fields.count)?{count:fields.count}:{}),
    ...(fields.code&&/^[A-Z0-9_]{1,50}$/.test(fields.code)?{code:fields.code}:{})};
  try{if((fields.status??0)>=500||event.endsWith("failed"))console.error(JSON.stringify(record));else console.info(JSON.stringify(record));}catch{/* Telemetria não altera o resultado financeiro. */}
}
export function recordOperationFailure(){
  const context=requestContext.getStore();
  if(context){context.failure="INTERNAL_ERROR";return;}
  operationalLog("operation_failure",{status:500,code:"INTERNAL_ERROR"});
}
export function withMonitoring<A extends unknown[]>(route:string,handler:(...args:A)=>Promise<Response>){
  if(!/^\/api(?:\/[a-zA-Z0-9_\[\]-]+)*$/.test(route))throw new Error("Use o template estático da rota.");
  return async(...args:A):Promise<Response>=>{
    const request=args[0] as Request|undefined,started=performance.now();
    // Identificador sempre gerado pelo servidor; nunca confia em valor enviado pelo cliente.
    return requestContext.run({requestId:randomUUID(),route,method:["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"].includes(request?.method??"")?request!.method:"OTHER"},async()=>{
      let response:Response;
      try{response=await handler(...args);}catch{recordOperationFailure();response=Response.json({error:"Não foi possível concluir a operação."},{status:500});}
      response.headers.set("X-Request-ID",currentRequestId()!);
      operationalLog("http_request",{status:response.status,durationMs:performance.now()-started,...(requestContext.getStore()?.failure?{code:"INTERNAL_ERROR"}:{})});
      return response;
    });
  };
}
export function withOperationContext<T>(route:"worker"|"monitor",handler:()=>Promise<T>){
  return requestContext.run({requestId:randomUUID(),route,method:"JOB"},handler);
}
