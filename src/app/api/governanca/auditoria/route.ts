import {withMonitoring} from "@/lib/observability";
import {NextRequest,NextResponse} from "next/server";
import {authorize,fail} from "@/lib/auth";
import {hasCapability} from "@/lib/governance";
import {prisma} from "@/lib/prisma";
import {encodeReportCsv} from "@/lib/report-math";
import {validRequestId} from "@/lib/observability";
export const runtime="nodejs";
async function GETHandler(req:NextRequest){
 const {error,user}=await authorize(req,["ADMIN"]);if(error||!user)return error!;
 if(!await hasCapability(user,"AUDIT_VIEW"))return fail("Sem permissão para auditoria.",403);
 const q=req.nextUrl.searchParams;
 const page=Number(q.get("pagina")??1),size=Number(q.get("limite")??30);
 if(!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(size)||size<1||size>100)return fail("Paginação inválida.");
 const action=q.get("acao")?.trim().slice(0,80), actor=q.get("usuarioId")?.trim().slice(0,100), entity=q.get("entidade")?.trim().slice(0,80);
 const requestId=q.get("requestId")?.trim();
 if(requestId&&!validRequestId(requestId))return fail("Identificador de requisição inválido.");
 const start=q.get("inicio")||"",end=q.get("fim")||"";
 if((start&&!/^\d{4}-\d{2}-\d{2}$/.test(start))||(end&&!/^\d{4}-\d{2}-\d{2}$/.test(end))||start&&end&&end<start)return fail("Período inválido.");
 const where={...(requestId?{requestId}:{}),...(action?{action:{contains:action}}:{}),...(actor?{actorId:actor}:{}),...(entity?{entity:{contains:entity}}:{}),...(start||end?{createdAt:{...(start?{gte:new Date(`${start}T00:00:00.000Z`)}:{}),...(end?{lte:new Date(`${end}T23:59:59.999Z`)}:{})}}:{})};
 if(q.get("formato")==="csv") {
  const count=await prisma.auditLog.count({where});
  if(count>5000)return fail("Exportação limitada a 5.000 registros. Refine os filtros.",413);
  const entries=await prisma.auditLog.findMany({where,include:{actor:{select:{name:true,email:true,role:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],take:5000});
  const data=encodeReportCsv([["Data UTC","Ação","Entidade","Identificador","Descrição","Ator","E-mail","Perfil","Requisição"],
   ...entries.map(x=>[x.createdAt.toISOString(),x.action,x.entity,x.entityId,x.summary,x.actor.name,x.actor.email,x.actor.role,x.requestId??""])]);
  return new NextResponse(data,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=auditoria-financeira.csv","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"}});
 }
 const [count,items]=await Promise.all([
  prisma.auditLog.count({where}),
  prisma.auditLog.findMany({where,include:{actor:{select:{id:true,name:true,email:true,role:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*size,take:size})
 ]);
 return NextResponse.json({count,page,size,items:items.map(i=>({id:i.id,requestId:i.requestId,createdAt:i.createdAt.toISOString(),action:i.action,entity:i.entity,entityId:i.entityId,summary:i.summary,actorId:i.actor.id,actor:i.actor.name,actorEmail:i.actor.email,actorRole:i.actor.role}))},{headers:{"Cache-Control":"no-store"}});
}

export const GET=withMonitoring("/api/governanca/auditoria",GETHandler);
