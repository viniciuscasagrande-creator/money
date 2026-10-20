import {Prisma,PrismaClient} from "@prisma/client";
import {z} from "zod";
const cents=z.string().regex(/^[1-9]\d{0,15}$/);
const retention=z.object({id:z.string(),eventId:z.string(),category:z.enum(["ECAD","ALUGUEL_ESPACO","EQUIPE_PRODUCAO","TRIBUTOS_ENCARGOS","RESERVA_RISCO","OUTRAS_DESPESAS"]),description:z.string(),beneficiary:z.string(),documentRef:z.string(),ownerName:z.string(),dueDate:z.string().nullable(),amountCents:cents,status:z.enum(["ACTIVE","RELEASED","CANCELED"]),createdAt:z.string().datetime(),updatedAt:z.string().datetime()});
const transfer=z.object({id:z.string(),producerId:z.string(),sourceEventId:z.string(),targetEventId:z.string(),amountCents:cents,reason:z.string(),status:z.enum(["REQUESTED","APPROVED","PRODUCER_ACCEPTED","EXECUTED","REJECTED","REVERSED"]),requestedById:z.string(),approvedById:z.string().nullable(),producerAcceptedById:z.string().nullable(),executedById:z.string().nullable(),rejectionReason:z.string().nullable(),createdAt:z.string().datetime(),updatedAt:z.string().datetime()});

export async function migrateLegacyFinance(db:PrismaClient){
  return db.$transaction(async tx=>{
    const settings=await tx.financeSetting.findMany({where:{OR:[{key:{startsWith:"retentions:"}},{key:"event_transfers:all"}]}});
    let reserves=0,transfers=0;
    for(const row of settings){
      if(row.key.startsWith("retentions:"))for(const r of z.array(retention).parse(JSON.parse(row.value))){
        if(row.key!==`retentions:${r.eventId}`)throw new Error("Evento divergente na retenção legada.");
        const existing=await tx.eventReserve.findUnique({where:{id:r.id}});
        if(existing)throw new Error("Colisão de retenção legada; reconcilie manualmente antes da migração.");
        const event=await tx.event.findUniqueOrThrow({where:{id:r.eventId}});
        // Legacy rows had no actor. Use the configuration's actor, or an existing admin.
        const actor=row.changedById??(await tx.user.findFirst({where:{role:"ADMIN"}}))?.id;
        if(!actor)throw new Error("Migração exige administrador existente.");
        await tx.eventReserve.create({data:{id:r.id,eventId:event.id,purpose:r.description,category:r.category,beneficiary:r.beneficiary,documentRef:r.documentRef,ownerName:r.ownerName,dueDate:r.dueDate?new Date(r.dueDate):null,amountCents:BigInt(r.amountCents),status:r.status,createdById:actor,createdAt:new Date(r.createdAt),updatedAt:new Date(r.updatedAt)}});reserves++;
      }
      else for(const t of z.array(transfer).parse(JSON.parse(row.value))){
        const [origin,destination]=await Promise.all([tx.event.findUniqueOrThrow({where:{id:t.sourceEventId}}),tx.event.findUniqueOrThrow({where:{id:t.targetEventId}})]);
        if(origin.producerId!==t.producerId||destination.producerId!==t.producerId)throw new Error("Transferência legada entre produtores incompatíveis.");
        if(await tx.eventTransfer.findUnique({where:{id:t.id}}))throw new Error("Colisão de transferência legada.");
        await tx.eventTransfer.create({data:{id:t.id,producerId:t.producerId,originEventId:t.sourceEventId,destinationEventId:t.targetEventId,amountCents:BigInt(t.amountCents),reason:t.reason,status:t.status,requestedById:t.requestedById,approvedById:t.approvedById,producerAcceptedById:t.producerAcceptedById,executedById:t.executedById,rejectionReason:t.rejectionReason,createdAt:new Date(t.createdAt),updatedAt:new Date(t.updatedAt)}});transfers++;
      }
      await tx.financeSetting.create({data:{key:`legacy_archive:${row.key}`,value:row.value,changedById:row.changedById}});
      await tx.financeSetting.delete({where:{key:row.key}});
    }
    return {reserves,transfers,settings:settings.length};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}
