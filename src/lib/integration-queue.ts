import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizedTicketing, ticketingHashMatches, importTicketingInTransaction } from "@/lib/ticketing-import";

const maxAttempts=5,leaseMs=120000;
export const jobSelection={id:true,externalReference:true,status:true,attempts:true,totalAttempts:true,nextAttemptAt:true,lastErrorCode:true,titleId:true,createdAt:true,finishedAt:true} as const;
const conflict=(message:string):never=>{throw new Error(`REGRA:${message}`);};
export function queueFailure(error:unknown){
  if(error instanceof Error && error.message.startsWith("REGRA:"))return {code:"BUSINESS_RULE",retry:false};
  if(error instanceof SyntaxError || (error instanceof Error && error.name==="ZodError"))return {code:"INVALID_PAYLOAD",retry:false};
  if(error instanceof Error && error.message==="ACTOR_INACTIVE")return {code:"ACTOR_INACTIVE",retry:false};
  return {code:"TEMPORARY_FAILURE",retry:true};
}
export function retryDelay(attempt:number){return Math.min(3600000,30000*2**Math.max(0,attempt-1));}

export async function enqueueTicketing(db:PrismaClient,raw:unknown,actorId:string){
  const {input,payload,payloadHash}=normalizedTicketing(raw),provider="ticketing";
  const key={provider_externalReference:{provider,externalReference:input.externalReference}};
  for(let attempt=0;attempt<3;attempt++)try{
    return await db.$transaction(async tx=>{
      const actor=await tx.user.findUnique({where:{id:actorId}});
      if(!actor?.active || !["ADMIN","FINANCE_DISK"].includes(actor.role))return conflict("Operador da integração inativo ou sem permissão.");
      const delivery=await tx.integrationDelivery.findUnique({where:key});
      if(delivery&&!ticketingHashMatches(input,delivery.payloadHash))return conflict("Referência externa já utilizada com outro conteúdo.");
      const found=await tx.integrationJob.findUnique({where:key});
      if(found){if(found.payloadHash!==payloadHash)return conflict("Referência externa já utilizada com outro conteúdo.");return {job:await tx.integrationJob.findUniqueOrThrow({where:{id:found.id},select:jobSelection}),duplicate:true};}
      const job=await tx.integrationJob.create({data:{provider,externalReference:input.externalReference,payloadHash,payload,actorId,...(delivery?{status:"SUCCEEDED",titleId:delivery.titleId,finishedAt:new Date()}: {})},select:jobSelection});
      await tx.auditLog.create({data:{actorId,entity:"IntegrationJob",entityId:job.id,action:"INTEGRATION_ENQUEUED",summary:"Recebível recebido pela fila persistente."}});
      return {job,duplicate:!!delivery};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&["P2002","P2034"].includes(e.code)&&attempt<2)continue;throw e;}
  throw new Error("Falha ao receber integração.");
}

export async function claimIntegrationJob(db:PrismaClient){
  const now=new Date();
  const due:Prisma.IntegrationJobWhereInput={OR:[{status:{in:["PENDING","RETRY"]},nextAttemptAt:{lte:now}},{status:"PROCESSING",leaseUntil:{lte:now}}]};
  for(let scan=0;scan<10;scan++){
    const candidate=await db.integrationJob.findFirst({where:due,orderBy:[{nextAttemptAt:"asc"},{id:"asc"}]});
    if(!candidate)return null;
    const condition={AND:[due,{id:candidate.id,attempts:candidate.attempts,status:candidate.status,leaseToken:candidate.leaseToken}]};
    if(candidate.attempts>=maxAttempts){
      await db.$transaction(async tx=>{
        const changed=await tx.integrationJob.updateMany({where:condition,data:{status:"DEAD",lastErrorCode:"ATTEMPTS_EXHAUSTED",finishedAt:now,leaseToken:null,leaseUntil:null}});
        if(changed.count)await tx.auditLog.create({data:{actorId:candidate.actorId,entity:"IntegrationJob",entityId:candidate.id,action:"INTEGRATION_DEAD",summary:"Limite de tentativas atingido após interrupção do processamento."}});
      });continue;
    }
    const token=randomUUID();
    const claimed=await db.integrationJob.updateMany({where:condition,data:{status:"PROCESSING",attempts:{increment:1},totalAttempts:{increment:1},leaseToken:token,leaseUntil:new Date(now.getTime()+leaseMs)}});
    if(claimed.count)return {id:candidate.id,token,attempt:candidate.attempts+1};
  }
  return null;
}

export async function executeIntegrationClaim(db:PrismaClient,claim:{id:string;token:string;attempt:number}){
  const owned={id:claim.id,status:"PROCESSING",leaseToken:claim.token};
  try{
    return await db.$transaction(async tx=>{
      // Lock the owned job before financial writes. A stale worker never imports a title.
      const locked=await tx.integrationJob.updateMany({where:{...owned,leaseUntil:{gt:new Date()}},data:{leaseUntil:new Date(Date.now()+leaseMs)}});
      if(!locked.count)return {status:"STALE",id:claim.id};
      const job=await tx.integrationJob.findUniqueOrThrow({where:{id:claim.id},include:{actor:true}});
      if(!job.actor.active||!["ADMIN","FINANCE_DISK"].includes(job.actor.role))throw new Error("ACTOR_INACTIVE");
      const normalized=normalizedTicketing(JSON.parse(job.payload));
      if(normalized.payloadHash!==job.payloadHash || normalized.input.externalReference!==job.externalReference)throw new SyntaxError("Invalid stored payload");
      const result=await importTicketingInTransaction(tx,normalized.input,job.actorId);
      await tx.integrationJob.update({where:{id:job.id},data:{status:"SUCCEEDED",titleId:result.titleId,lastErrorCode:null,finishedAt:new Date(),leaseToken:null,leaseUntil:null}});
      await tx.auditLog.create({data:{actorId:job.actorId,entity:"IntegrationJob",entityId:job.id,action:"INTEGRATION_SUCCEEDED",summary:`Recebível confirmado na tentativa ${job.totalAttempts}.`}});
      return {status:"SUCCEEDED",id:job.id};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:30000});
  }catch(error){
    const failure=queueFailure(error),status=failure.retry&&claim.attempt<maxAttempts?"RETRY":"DEAD";
    return db.$transaction(async tx=>{
      const changed=await tx.integrationJob.updateMany({where:owned,data:{status,lastErrorCode:failure.code,leaseToken:null,leaseUntil:null,nextAttemptAt:new Date(Date.now()+retryDelay(claim.attempt)),finishedAt:status==="DEAD"?new Date():null}});
      if(!changed.count)return {status:"STALE",id:claim.id};
      const job=await tx.integrationJob.findUniqueOrThrow({where:{id:claim.id}});
      await tx.auditLog.create({data:{actorId:job.actorId,entity:"IntegrationJob",entityId:job.id,action:`INTEGRATION_${status}`,summary:`Tentativa ${job.totalAttempts}: ${failure.code}.`}});
      return {status,id:claim.id};
    });
  }
}
export async function processIntegrationQueue(db:PrismaClient,limit=10){
  if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error("Limite de processamento inválido.");
  const results=[];
  for(let i=0;i<limit;i++){const claim=await claimIntegrationJob(db);if(!claim)break;results.push(await executeIntegrationClaim(db,claim));}
  return results;
}
export async function retryIntegrationJob(db:PrismaClient,id:string,actorId:string,reason:string){
  if(reason.trim().length<5||reason.length>200)return conflict("Informe um motivo de 5 a 200 caracteres.");
  return db.$transaction(async tx=>{
    const actor=await tx.user.findUnique({where:{id:actorId}});
    if(!actor?.active||actor.role!=="ADMIN")return conflict("Somente Administrador pode reabrir uma falha.");
    const updated=await tx.integrationJob.updateMany({where:{id,status:"DEAD"},data:{status:"PENDING",attempts:0,nextAttemptAt:new Date(),finishedAt:null,lastErrorCode:null,leaseToken:null,leaseUntil:null}});
    if(!updated.count)return conflict("Apenas falhas encerradas podem ser reprocessadas.");
    await tx.auditLog.create({data:{actorId,entity:"IntegrationJob",entityId:id,action:"INTEGRATION_REQUEUED",summary:`Reprocessamento solicitado: ${reason.trim()}`}});
    return tx.integrationJob.findUniqueOrThrow({where:{id},select:jobSelection});
  });
}
