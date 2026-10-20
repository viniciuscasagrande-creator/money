import {NextRequest,NextResponse} from "next/server";
import {timingSafeEqual,createHash} from "node:crypto";
import {authorize,fail} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {apiCatch} from "@/lib/validation";
import {importTicketingReceivable} from "@/lib/ticketing-import";
export const runtime="nodejs";
function keyValid(value:string|null){
  const configured=process.env.EXTERNAL_TICKETING_API_KEY?.trim();if(!configured||!value)return false;
  const a=Buffer.from(configured),b=Buffer.from(value.trim());return a.length===b.length&&timingSafeEqual(a,b);
}
export async function GET(req:NextRequest){
  const {error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error)return error;
  const key=process.env.EXTERNAL_TICKETING_API_KEY?.trim();
  const [producersCount,eventsCount,receivablesCount]=await Promise.all([prisma.producer.count(),prisma.event.count(),prisma.financialTitle.count({where:{kind:"RECEIVABLE"}})]);
  return NextResponse.json({configured:!!key,maskedKey:key?"SHA-256 "+createHash("sha256").update(key).digest("hex").slice(0,12):null,keyLength:key?.length??0,
    operation:"RECEIVABLE_IMPORT",stats:{producersCount,eventsCount,receivablesCount}});
}
export async function POST(req:NextRequest){
  try {
    let actorId:string;
    if(keyValid(req.headers.get("x-api-key"))){
      const actor=process.env.EXTERNAL_TICKETING_ACTOR_ID?await prisma.user.findUnique({where:{id:process.env.EXTERNAL_TICKETING_ACTOR_ID}}):null;
      if(!actor||!actor.active||!["ADMIN","FINANCE_DISK"].includes(actor.role))return fail("Configure EXTERNAL_TICKETING_ACTOR_ID com operador ativo da integração.",503);
      actorId=actor.id;
    }else{
      const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;actorId=user.id;
    }
    const body=await req.json();const reference=req.headers.get("idempotency-key");
    if(reference&&body.externalReference&&reference!==body.externalReference)return fail("Referências de idempotência divergentes.");
    return NextResponse.json(await importTicketingReceivable({...body,externalReference:body.externalReference??reference},actorId));
  }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
