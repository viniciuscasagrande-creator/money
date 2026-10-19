import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { hasCapability } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
export const runtime="nodejs";
export async function GET(req:NextRequest){
 const {error,user}=await authorize(req);if(error||!user)return error!;
 if(!await hasCapability(user,"REPORT_VIEW"))return NextResponse.json({error:"Acesso negado."},{status:403});
 const producerId=user.role==="PRODUCER"?user.producerId!:undefined;
 const [producers,events]=await Promise.all([
  prisma.producer.findMany({where:producerId?{id:producerId}:{},select:{id:true,name:true},orderBy:{name:"asc"}}),
  prisma.event.findMany({where:producerId?{producerId}:{},select:{id:true,name:true,producerId:true},orderBy:{name:"asc"}})
 ]);
 return NextResponse.json({producers,events});
}
