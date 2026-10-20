import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseCents } from "@/lib/money";
import { ruleError } from "@/lib/split-calculation";

// Receivable import; sales with MDR/split are registered through registerSale.
export const ticketingInput = z.object({
  externalReference:z.string().trim().min(3).max(150),producerName:z.string().trim().min(2).max(140),
  producerDocument:z.string().trim().min(5).max(30).nullable().optional(),eventName:z.string().trim().min(2).max(140),
  description:z.string().trim().min(3).max(180),amountCents:z.string().regex(/^[1-9]\d{0,15}$/),dueDate:z.string().date().nullable().optional()
}).strict();
export async function importTicketingReceivable(raw:unknown,actorId:string) {
  const input=ticketingInput.parse(raw),amountCents=parseCents(input.amountCents),provider="ticketing";
  const payloadHash=createHash("sha256").update(JSON.stringify({...input,producerDocument:input.producerDocument??null,dueDate:input.dueDate??null})).digest("hex");
  const key={provider_externalReference:{provider,externalReference:input.externalReference}};
  const existing=async()=>{
    const found=await prisma.integrationDelivery.findUnique({where:key});if(!found)return null;
    if(found.payloadHash!==payloadHash)return ruleError("Referência externa já utilizada com outro conteúdo.");
    const title=await prisma.financialTitle.findUniqueOrThrow({where:{id:found.titleId},include:{producer:true,event:true}});
    return {ok:true,titleId:title.id,producerName:title.producer?.name,eventName:title.event?.name,duplicate:true,operation:"RECEIVABLE_IMPORT"};
  };
  const found=await existing();if(found)return found;
  for(let attempt=0;attempt<3;attempt++)try {
    return await prisma.$transaction(async tx=>{
      let producer=input.producerDocument?await tx.producer.findUnique({where:{document:input.producerDocument}}):await tx.producer.findFirst({where:{name:input.producerName}});
      if(!producer)producer=await tx.producer.create({data:{name:input.producerName,document:input.producerDocument}});
      if(!producer.active)return ruleError("Produtor inativo.");
      let event=await tx.event.findFirst({where:{producerId:producer.id,name:input.eventName}});
      if(!event)event=await tx.event.create({data:{name:input.eventName,producerId:producer.id,status:"ACTIVE"}});
      if(event.status==="CLOSED")return ruleError("Evento encerrado.");
      const title=await tx.financialTitle.create({data:{kind:"RECEIVABLE",description:input.description,amountCents,dueDate:input.dueDate?new Date(`${input.dueDate}T12:00:00.000Z`):null,producerId:producer.id,eventId:event.id,createdById:actorId}});
      await tx.integrationDelivery.create({data:{provider,externalReference:input.externalReference,payloadHash,titleId:title.id}});
      await tx.auditLog.create({data:{actorId,entity:"FinancialTitle",entityId:title.id,action:"API_INGRESSOS_SYNC",summary:`Recebível importado: ${input.externalReference}. Não representa venda com split.`}});
      return {ok:true,titleId:title.id,producerName:producer.name,eventName:event.name,duplicate:false,operation:"RECEIVABLE_IMPORT"};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:15000});
  }catch(e){
    if(e instanceof Prisma.PrismaClientKnownRequestError&&["P2002","P2034"].includes(e.code)) {
      const duplicate=await existing();if(duplicate)return duplicate;if(attempt<2)continue;
    }
    throw e;
  }
  throw new Error("Importação não concluída.");
}
