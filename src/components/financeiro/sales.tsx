"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {ListSearch,searchRows} from "@/components/financeiro/list-search";
import { Dialog,DialogTitle,DialogDescription,DialogContent } from "@/components/ui/dialog";
import { RecordDetailModal,DetailsButton } from "@/components/financeiro/record-detail-modal";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api, Empty, ErrorNotice, Field, Loading, PageHeading, useApi, displayDate } from "@/components/financeiro/shared";
import { FormCard, SelectField, bpsToPercent, type Catalog } from "@/components/financeiro/operations-shared";
import { fmtBRL, parseBRLToCents } from "@/lib/money";
type Sale = { id:string; reference:string; eventName:string; producerName:string; gatewayName:string; brandName:string;
  status:"AWAITING_SETTLEMENT"|"SETTLED"; quantity:number; grossCents:string; feeCents:string; mdrCents:string; netSettlementCents:string;
  producerNetCents:string; diskNetCents:string; createdAt:string; receivableTitleId:string };
export function SalesPage(){
  const [createOpen,setCreateOpen]=useState(false),[detailId,setDetailId]=useState<string|null>(null),[query,setQuery]=useState("");
  const catalog=useApi<Catalog>("/api/financeiro/catalogo"), sales=useApi<{items:Sale[]}>("/api/financeiro/vendas");
  const [eventId,setEventId]=useState(""),[mdrRuleId,setMdrRuleId]=useState(""),[reference,setReference]=useState(""),
    [unitPrice,setUnitPrice]=useState(""),[quantity,setQuantity]=useState("1"),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const shown=searchRows(sales.data?.items,query,s=>[s.reference,s.eventName,s.producerName,s.status,s.gatewayName]);
  async function save(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{
    await api("/api/financeiro/vendas",{method:"POST",body:JSON.stringify({externalReference:reference,eventId,mdrRuleId,
      quantity:Number(quantity),unitPriceCents:parseBRLToCents(unitPrice)})});setReference("");setUnitPrice("");setQuantity("1");setCreateOpen(false);sales.reload();
  }catch(e){setMessage(e instanceof Error?e.message:"Erro ao registrar venda.");}finally{setBusy(false);}}
  return <><PageHeading eyebrow="Financeiro interno · receitas por evento" title="Vendas e Divisão de Receitas" subtitle="Registre vendas reais com referência exclusiva. A operação gera um recebível líquido de MDR em aberto; a entrada no banco só ocorre quando esse título for liquidado." action={<Button onClick={()=>{setMessage("");setCreateOpen(true);}}><Plus size={16}/>Nova venda</Button>}/>
    {message&&<ErrorNotice message={message}/>} {catalog.error&&<ErrorNotice message={catalog.error} retry={catalog.reload}/>} {sales.error&&<ErrorNotice message={sales.error} retry={sales.reload}/>}
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-w-[800px]"><DialogTitle className="text-xl font-bold">Registrar venda / transação</DialogTitle><DialogDescription>Registro real com regra de taxas e recebível associado.</DialogDescription>{catalog.loading?<Loading/>:<form onSubmit={save} className="grid gap-4 md:grid-cols-3">
      <SelectField label="Evento" value={eventId} onChange={setEventId}><option value="">Selecione</option>{catalog.data?.events.filter(x=>x.status!=="CLOSED").map(x=><option key={x.id} value={x.id}>{x.producerName} · {x.name}</option>)}</SelectField>
      <SelectField label="Gateway / bandeira / parcelamento" value={mdrRuleId} onChange={setMdrRuleId}><option value="">Selecione</option>{catalog.data?.rules.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.gatewayName} · {x.brandName} · {x.installments}x · {bpsToPercent(x.rateBps)}</option>)}</SelectField>
      <Field label="Referência externa da venda"><Input required minLength={5} maxLength={100} value={reference} onChange={e=>setReference(e.target.value)} placeholder="ID real do pedido/transação"/></Field>
      <Field label="Valor unitário do ingresso (R$)"><Input required value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} placeholder="0,00"/></Field>
      <Field label="Quantidade de ingressos"><Input required type="number" min="1" max="10000" value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field>
      <div className="flex items-end"><Button disabled={busy||!eventId||!mdrRuleId}>{busy?"Registrando...":"Registrar venda e gerar recebível"}</Button></div>
      <p className="text-xs text-slate-500 md:col-span-3">Registre apenas transações reais. Regras de MDR e taxa Disk precisam estar configuradas. Não há integração automática com checkout ou gateway neste pacote.</p>
    </form>}</DialogContent></Dialog>
    <div className="mt-5"><ListSearch value={query} onChange={setQuery} count={shown.length} label="Buscar venda, evento, produtor ou gateway"/></div>
    <Card className="mt-4 overflow-hidden"><div className="border-b border-slate-100 p-5 font-semibold">Livro de vendas e divisão calculada</div>{sales.loading?<Loading/>:shown.length?<div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Referência / data</th><th>Evento</th><th>Bruto</th><th>MDR</th><th>Taxa Disk</th><th>Produtor</th><th>Resultado Disk</th><th>Líquido recebido</th><th>Situação</th><th>Detalhes</th></tr></thead><tbody>{shown.map(s=><tr key={s.id}>
      <td><strong className="block">{s.reference}</strong><span className="text-xs text-slate-400">{displayDate(s.createdAt)}</span></td><td><span className="block">{s.eventName}</span><span className="text-xs text-slate-500">{s.producerName} · {s.quantity} ingresso(s)</span></td>
      <td>{fmtBRL(s.grossCents)}</td><td>{fmtBRL(s.mdrCents)}</td><td>{fmtBRL(s.feeCents)}</td><td>{fmtBRL(s.producerNetCents)}</td><td>{fmtBRL(s.diskNetCents)}</td><td>{fmtBRL(s.netSettlementCents)}</td>
      <td><Badge tone={s.status==="SETTLED"?"green":"amber"}>{s.status==="SETTLED"?"Liquidada":"A receber"}</Badge></td><td><DetailsButton onClick={()=>setDetailId(s.id)}/></td>
    </tr>)}</tbody></table></div>:<Empty text="Ainda não há vendas registradas."/>}</Card>
    <RecordDetailModal record={detailId?{type:"venda",id:detailId}:null} onClose={()=>setDetailId(null)}/>
  </>;
}
