"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, Empty, ErrorNotice, Field, Loading, PageHeading, useApi, displayDateTime, type Account } from "@/components/financeiro/shared";
import { FormCard, SelectField } from "@/components/financeiro/operations-shared";
import { fmtBRL, parseBRLToCents } from "@/lib/money";
type Status = "REQUESTED" | "APPROVED" | "REJECTED" | "PRODUCER_ACCEPTED" | "READY_TO_SETTLE" | "SETTLED";
type Payout = {id:string;type:"REPASSE"|"ANTECIPACAO";status:Status;amountCents:string;eventId:string;producerId:string;
  eventName:string;producerName:string;createdAt:string;approvedAt:string|null;producerAcceptedAt:string|null;financeSignedAt:string|null;
  settledAt:string|null;rejectionReason:string|null;settlementReference?:string|null };
type Balance = {id:string;name:string;producerId:string;totalCents:string;settledCents:string;committedCents:string;
  repasseCents:string;antecipacaoCents:string};
type Payload = {items:Payout[];events:Balance[];role:"ADMIN"|"FINANCE_DISK"|"PRODUCER"};
const statuses:Record<Status,string>={ REQUESTED:"Aguardando aprovação",APPROVED:"Aguardando produtor",REJECTED:"Reprovado",
  PRODUCER_ACCEPTED:"Aceite do produtor registrado",READY_TO_SETTLE:"Aguardando baixa externa",SETTLED:"Baixa registrada" };
const actions:Record<string,string>={APPROVE:"Aprovar",REJECT:"Reprovar",PRODUCER_ACCEPT:"Registrar meu aceite",FINANCE_SIGN:"Assinar por último (Financeiro)",SETTLE:"Registrar baixa comprovada"};
function availableActions(p:Payout,role:Payload["role"]){const internal=role!=="PRODUCER";if(internal){
  if(p.status==="REQUESTED")return ["APPROVE","REJECT"];
  if(p.status==="APPROVED")return ["REJECT"];
  if(p.status==="PRODUCER_ACCEPTED")return ["FINANCE_SIGN"];
  if(p.status==="READY_TO_SETTLE")return ["SETTLE"];
  return [];
}return p.status==="APPROVED"?["PRODUCER_ACCEPT"]:[];}
export function PayoutsPage(){
  const {data,error,loading,reload}=useApi<Payload>("/api/repasses");
  const internal=data?.role!=="PRODUCER";
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [eventId,setEventId]=useState(""),[type,setType]=useState<"REPASSE"|"ANTECIPACAO">("REPASSE"),[amount,setAmount]=useState("");
  const [selected,setSelected]=useState<{p:Payout;action:string}|null>(null),[reason,setReason]=useState(""),
    [bankId,setBankId]=useState(""),[reference,setReference]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{if(data && data.role!=="PRODUCER")api<{items:Account[]}>("/api/contas").then(x=>setAccounts(x.items.filter(a=>a.active))).catch(e=>setMessage(e.message));},[data?.role]);
  const current=data?.events.find(e=>e.id===eventId);
  async function request(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{
    await api("/api/repasses",{method:"POST",body:JSON.stringify({eventId,type,amountCents:parseBRLToCents(amount)})});setAmount("");reload();
  }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível solicitar.");}finally{setBusy(false);}}
  async function act(e:FormEvent){e.preventDefault();if(!selected)return;setBusy(true);setMessage("");try{
    await api(`/api/repasses/${selected.p.id}/acoes`,{method:"POST",body:JSON.stringify({action:selected.action,
      ...(selected.action==="REJECT"?{reason}:{}),...(selected.action==="SETTLE"?{bankAccountId:bankId,settlementReference:reference}:{})})});
    setSelected(null);setReason("");setBankId("");setReference("");reload();
  }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível executar a etapa.");}finally{setBusy(false);}}
  return <><PageHeading eyebrow="Fluxo financeiro de eventos" title="Repasses e Antecipações" subtitle={internal
    ?"Acompanhe solicitações, aprovações, aceite do produtor, assinatura final do Financeiro e baixa manual de transferências externas comprovadas."
    :"Solicite repasses ou antecipações dos seus eventos e registre seu aceite após a aprovação interna."}/>
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Não há integração para executar PIX, TED ou pagamentos bancários. O botão de baixa só registra contabilmente uma transferência externa já realizada e identificada. O aceite eletrônico desta etapa não substitui uma assinatura digital certificada.</div>
    {message&&<ErrorNotice message={message}/>} {error&&<ErrorNotice message={error} retry={reload}/>}
    {loading?<Loading/>:<><div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <FormCard title="Nova solicitação"><form onSubmit={request} className="space-y-4">
        <SelectField label="Evento" value={eventId} onChange={setEventId}><option value="">Selecione</option>{data?.events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</SelectField>
        <SelectField label="Tipo de operação" value={type} onChange={v=>setType(v as typeof type)}><option value="REPASSE">Repasse</option><option value="ANTECIPACAO">Antecipação</option></SelectField>
        <Field label="Valor solicitado (R$)"><Input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></Field>
        <div className="rounded-xl bg-slate-50 p-4 text-sm">{current?<>
          <p>Elegível para repasse: <strong>{fmtBRL(current.repasseCents)}</strong></p>
          <p className="mt-1">Limite para solicitar antecipação: <strong>{fmtBRL(current.antecipacaoCents)}</strong></p>
          <p className="mt-1 text-xs text-slate-500">Solicitações abertas e valores já baixados são abatidos dos limites. Antecipações usam vendas registradas ainda não recebidas e dependem de aprovação.</p>
        </>:"Selecione um evento para consultar os limites."}</div>
        <Button disabled={busy||!eventId}>{busy?"Enviando...":"Solicitar operação"}</Button>
      </form></FormCard>
      <FormCard title="Posição por evento"><div className="space-y-3">{data?.events.map(e=><div className="rounded-xl border border-slate-100 p-3" key={e.id}>
        <p className="font-semibold">{e.name}</p><div className="mt-2 grid grid-cols-2 gap-3 text-xs text-slate-500"><div>Direito registrado<p className="mt-1 text-sm font-semibold text-slate-900">{fmtBRL(e.totalCents)}</p></div>
        <div>Recebido / liquidado<p className="mt-1 text-sm font-semibold text-slate-900">{fmtBRL(e.settledCents)}</p></div>
        <div>Comprometido / baixado<p className="mt-1 text-sm font-semibold text-slate-900">{fmtBRL(e.committedCents)}</p></div>
        <div>Repasse disponível<p className="mt-1 text-sm font-semibold text-slate-900">{fmtBRL(e.repasseCents)}</p></div></div></div>)}
        {!data?.events.length&&<Empty text="Nenhum evento disponível."/>}</div></FormCard>
    </div>
    <Card className="mt-5 overflow-hidden"><div className="border-b border-slate-100 p-5 font-semibold">Solicitações e etapas de aprovação</div>
      {data?.items.length?<div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Produtor / evento</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Registro</th><th>Próxima ação</th></tr></thead><tbody>{data.items.map(p=><tr key={p.id}>
        <td><strong className="block">{p.eventName}</strong><span className="text-xs text-slate-500">{p.producerName}</span></td>
        <td>{p.type==="REPASSE"?"Repasse":"Antecipação"}</td><td className="font-semibold">{fmtBRL(p.amountCents)}</td>
        <td><Badge tone={p.status==="SETTLED"?"green":p.status==="REJECTED"?"red":"amber"}>{statuses[p.status]}</Badge>{p.rejectionReason&&<p className="mt-2 max-w-56 text-xs text-red-600">{p.rejectionReason}</p>}</td>
        <td>{displayDateTime(p.createdAt)}</td><td><div className="flex flex-wrap gap-2">{availableActions(p,data.role).map(a=><Button key={a} variant="outline" size="sm" onClick={()=>{setSelected({p,action:a});setMessage("");}}>{actions[a]}</Button>)}</div></td>
      </tr>)}</tbody></table></div>:<Empty text="Nenhuma solicitação registrada."/>}</Card>
    {selected&&<Card className="mt-5 border border-sky-200 p-5"><h2 className="text-lg font-semibold">{actions[selected.action]}</h2>
      <p className="mt-2 text-sm text-slate-500">{selected.p.eventName} · {fmtBRL(selected.p.amountCents)} · {selected.p.type}</p>
      <form onSubmit={act} className="mt-4 max-w-lg space-y-4">
        {selected.action==="REJECT"&&<Field label="Motivo da reprovação"><Input required minLength={8} value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
        {selected.action==="SETTLE"&&<><SelectField label="Conta financeira já debitada externamente" value={bankId} onChange={setBankId}><option value="">Selecione</option>{accounts.map(a=><option value={a.id} key={a.id}>{a.name} · {fmtBRL(a.balanceCents)}</option>)}</SelectField><Field label="Referência documental da transferência externa"><Input required minLength={8} maxLength={100} value={reference} onChange={e=>setReference(e.target.value)} placeholder="ID comprovante externo já realizado"/></Field></>}
        <div className="flex gap-2"><Button disabled={busy}>{busy?"Processando...":"Confirmar etapa"}</Button><Button type="button" variant="outline" onClick={()=>setSelected(null)}>Cancelar</Button></div>
      </form></Card>}</>}
  </>;
}
