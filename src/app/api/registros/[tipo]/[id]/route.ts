import { NextRequest,NextResponse } from "next/server";
import { authorize,fail,isInternal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtBRL } from "@/lib/money";
import { titleDTO,titleInclude,titleWhereFor } from "@/lib/finance";
import { isRecordType,STATUS_LABELS } from "@/lib/financeiro/constants";
import type { SessionUser } from "@/lib/auth";
export const runtime="nodejs";
type Field={label:string;value:string};
const readable=(value:string)=>STATUS_LABELS[value as keyof typeof STATUS_LABELS]??value;
const when=(date:Date|null|undefined)=>date?new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}).format(date):"—";
function field(label:string,value:unknown):Field{return {label,value:String(value??"—")};}
const cash=(value:bigint)=>fmtBRL(value.toString());
function result(title:string,subtitle:string,fields:Field[],warning?:string){return NextResponse.json({title,subtitle,fields,warning},{headers:{"Cache-Control":"private, no-store"}});}
async function detail(tipo:string,id:string,user:SessionUser){
 const internal=isInternal(user.role);
 if(tipo==="titulo"){
  const title=await prisma.financialTitle.findFirst({where:{...titleWhereFor(user),id},include:titleInclude});
  if(!title)return fail("Registro inexistente ou fora de sua área autorizada.",404);
  const t=titleDTO(title,internal);
  return result("Detalhes do título",t.kind==="RECEIVABLE"?"Conta a receber":"Conta a pagar",[
   field("Descrição",t.description),field("Valor",cash(title.amountCents)),field("Situação",readable(t.status)),
   field("Produtor",t.producerName),field("Evento",t.eventName),field("Vencimento",title.dueDate?when(title.dueDate):"—"),
   field("Criado em",when(title.createdAt)),field("Liquidado em",when(title.settledAt)),
   ...(internal?[field("Conta de liquidação",t.bankAccountName),field("Identificador",t.id)]:[])
  ],"A consulta não executa ou autoriza transferências bancárias.");
 }
 if(tipo==="repasse"){
  const p=await prisma.payoutRequest.findFirst({where:{id,...(!internal?{producerId:user.producerId!}:{})},
   include:{producer:{select:{name:true}},event:{select:{name:true}},requestedBy:{select:{name:true}},approvedBy:{select:{name:true}},producerAcceptedBy:{select:{name:true}},financeSignedBy:{select:{name:true}}}});
  if(!p)return fail("Registro inexistente ou fora de sua área autorizada.",404);
  return result("Detalhes da solicitação",readable(p.type),[
   field("Evento",p.event.name),field("Produtor",p.producer.name),field("Valor",cash(p.amountCents)),
   field("Situação",readable(p.status)),field("Solicitado em",when(p.createdAt)),
   field("Aprovado em",when(p.approvedAt)),field("Aceite do produtor",when(p.producerAcceptedAt)),
   field("Assinatura final interna",when(p.financeSignedAt)),field("Baixa registrada",when(p.settledAt)),
   field("Justificativa da reprovação",p.rejectionReason??"—"),
   ...(internal?[field("Solicitante",p.requestedBy.name),field("Aprovador",p.approvedBy?.name),field("Assinatura do produtor",p.producerAcceptedBy?.name),field("Assinatura interna",p.financeSignedBy?.name),field("Referência da baixa externa",p.settlementReference),field("Identificador",p.id)]:[])
  ],"Aceite eletrônico e baixa manual não equivalem a confirmação de transferência real.");
 }
 if(!internal)return fail("Acesso restrito ao Financeiro Interno.",403);
 if(tipo==="venda"){
  const s=await prisma.financialSale.findUnique({where:{id},include:{producer:{select:{name:true}},event:{select:{name:true}},gateway:{select:{name:true}},brand:{select:{name:true}}}});
  if(!s)return fail("Venda não encontrada.",404);
  return result("Memória de cálculo da venda",s.externalReference,[
   field("Produtor",s.producer.name),field("Evento",s.event.name),field("Gateway",s.gateway.name),
   field("Bandeira",s.brand.name),field("Ingressos",s.quantity),field("Valor unitário",cash(s.unitPriceCents)),
   field("Venda bruta",cash(s.grossCents)),field("MDR",cash(s.mdrCents)),field("Taxa interna",cash(s.feeCents)),
   field("Direito do produtor",cash(s.producerNetCents)),field("Receita própria registrada",cash(s.diskNetCents)),
   field("Recebível líquido",cash(s.netSettlementCents)),field("Estado",readable(s.status)),field("Criado em",when(s.createdAt)),
   field("Recebido em",when(s.settledAt)),field("Identificador do título",s.receivableTitleId)
  ],"Memória histórica congelada no momento do registro; taxas atuais não alteram esta venda.");
 }
 if(tipo==="ocorrencia"){
  const r=await prisma.riskCase.findUnique({where:{id},include:{event:{select:{name:true}},producer:{select:{name:true}},sale:{select:{externalReference:true}}}});
  if(!r)return fail("Ocorrência não encontrada.",404);
  return result("Detalhes de risco",readable(r.type),[field("Protocolo",r.externalId),field("Pedido",r.sale.externalReference),
   field("Evento",r.event.name),field("Produtor",r.producer.name),field("Exposição do produtor",cash(r.exposureCents)),
   field("Situação",readable(r.status)),field("Motivo",r.reason),field("Abertura",when(r.createdAt)),field("Decisão",when(r.decidedAt))],
   "A ocorrência registra uma exposição de risco, não a execução de estorno na adquirente.");
 }
 if(tipo==="contrato"){
  const c=await prisma.financialContract.findUnique({where:{id},include:{event:{select:{name:true}},producer:{select:{name:true}}}});
  if(!c)return fail("Contrato não encontrado.",404);
  return result("Detalhes do contrato",c.title,[field("Contraparte",c.counterparty),field("Produtor",c.producer?.name),
   field("Evento",c.event?.name),field("Estado",readable(c.status)),field("Início",when(c.startDate)),field("Fim",when(c.endDate)),
   field("Condições",c.terms),field("Criado em",when(c.createdAt))]);
 }
 if(tipo==="orcamento"){
  const b=await prisma.budgetLine.findUnique({where:{id},include:{event:{select:{name:true}}}});
  if(!b)return fail("Orçamento não encontrado.",404);
  return result("Detalhes da previsão",b.description,[field("Evento",b.event.name),field("Natureza",b.kind==="REVENUE"?"Receita prevista":"Despesa prevista"),
   field("Categoria",b.category),field("Valor previsto",cash(b.amountCents)),field("Criado em",when(b.createdAt))],
   "Previsão orçamentária não representa saldo bancário nem obrigação liquidada.");
 }
 if(tipo==="extrato"){
  const s=await prisma.bankStatementLine.findUnique({where:{id},include:{bankAccount:{select:{name:true}}}});
  if(!s)return fail("Extrato não encontrado.",404);
  return result("Linha do extrato",s.externalId,[field("Conta",s.bankAccount.name),field("Descrição",s.description),
   field("Data",when(s.postedAt)),field("Sentido",s.direction==="CREDIT"?"Entrada":"Saída"),field("Valor",cash(s.amountCents)),
   field("Conciliação",readable(s.status)),field("Conciliado em",when(s.matchedAt)),field("Referência do razão",s.ledgerEntryId)],
   "Uma conciliação é somente uma associação ao razão: não atualiza saldo.");
 }
 return fail("Tipo de registro não encontrado.",404);
}
export async function GET(request:NextRequest,{params}:{params:Promise<{tipo:string;id:string}>}){
 const {user,error}=await authorize(request);if(error||!user)return error!;
 const {tipo,id}=await params;
 if(!isRecordType(tipo)||!id||id.length>100||!/^[-_a-zA-Z0-9]+$/.test(id))return fail("Identificador inválido.",400);
 return detail(tipo,id,user);
}
