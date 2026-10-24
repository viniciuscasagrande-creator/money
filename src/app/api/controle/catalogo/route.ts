import {withMonitoring} from "@/lib/observability";
import { NextRequest,NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const runtime="nodejs";
async function GETHandler(req:NextRequest){
  const {error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error)return error;
  const [accounts,events,sales,producers]=await Promise.all([
    prisma.bankAccount.findMany({where:{active:true},select:{id:true,name:true,institution:true},orderBy:{name:"asc"}}),
    prisma.event.findMany({select:{id:true,name:true,producerId:true},orderBy:{name:"asc"}}),
    prisma.financialSale.findMany({take:150,orderBy:{createdAt:"desc"},select:{id:true,externalReference:true,eventId:true,producerNetCents:true}}),
    prisma.producer.findMany({select:{id:true,name:true},orderBy:{name:"asc"}})
  ]);
  return NextResponse.json({accounts,events,producers,sales:sales.map(s=>({...s,producerNetCents:s.producerNetCents.toString()}))});
}

export const GET=withMonitoring("/api/controle/catalogo",GETHandler);
