"use client";
import { useRef,useState,type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useApi,ErrorNotice } from "@/components/financeiro/shared";
import { parseBRLToCents,fmtBRL } from "@/lib/money";
type Issue={id:string;status:string;reason:string;resolution:string|null};
type Row={id:string;description:string;direction:string;remainingCents:string;amountCents:string;issues?:Issue[]};
type Overview={canClose:boolean;statements:Row[];ledger:Row[];closed:{month:string}|null;summary:{opening:string;closing:string;statementsPending:number;ledgerPending:number;issuesOpen:number;bankLedgerBalanced:boolean}};
export function FinancialClosePanel({onChanged}:{onChanged:()=>void}){
  const catalog=useApi<{accounts:{id:string;name:string}[]}>("/api/controle/catalogo");
  const [bank,setBank]=useState(""),[month,setMonth]=useState(()=>{const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7);});
  return <Card className="mt-6 space-y-4 p-5"><h2 className="text-xl font-semibold">Conciliação parcial e fechamento mensal</h2>
    <p className="text-sm text-slate-600">Selecione conta e competência em UTC. As alocações não movimentam dinheiro. O fechamento financeiro é separado do fechamento contábil.</p>
    {catalog.error&&<ErrorNotice message={catalog.error} retry={catalog.reload}/>}
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Conta<select aria-label="Conta do fechamento" className="mt-1 block w-full rounded-lg border p-2" value={bank} onChange={e=>setBank(e.target.value)}><option value="">Selecione</option>{catalog.data?.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="text-sm">Competência<Input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label></div>
    {bank&&/^\d{4}-\d{2}$/.test(month)&&<PeriodDetail key={`${bank}:${month}`} bank={bank} month={month} onChanged={onChanged}/>}
  </Card>;
}
function PeriodDetail({bank,month,onChanged}:{bank:string;month:string;onChanged:()=>void}){
  const data=useApi<Overview>(`/api/controle/fechamento?bankAccountId=${encodeURIComponent(bank)}&month=${month}`);
  const [statement,setStatement]=useState(""),[ledger,setLedger]=useState(""),[amount,setAmount]=useState(""),[reason,setReason]=useState(""),[balance,setBalance]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const identity=useRef<{payload:string;key:string}|null>(null);
  const row=data.data?.statements.find(s=>s.id===statement);
  const issue=row?.issues?.find(i=>i.status==="OPEN");
  async function send(body:Record<string,unknown>){
    setBusy(true);setMessage("");
    try{const response=await fetch("/api/controle/fechamento",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||"Falha ao registrar operação.");
      identity.current=null;setMessage(result.duplicate?"Operação já registrada; nenhuma duplicação foi criada.":"Operação registrada.");data.reload();onChanged();
    }catch(e){setMessage(e instanceof Error?e.message:"Falha ao registrar operação.");}finally{setBusy(false);}
  }
  async function allocate(event:FormEvent){event.preventDefault();try{
    const payload={action:"ALLOCATE",statementId:statement,ledgerEntryId:ledger,amountCents:parseBRLToCents(amount)};
    const encoded=JSON.stringify(payload);if(identity.current?.payload!==encoded)identity.current={payload:encoded,key:crypto.randomUUID()};
    await send({...payload,requestKey:identity.current.key});
  }catch(e){setMessage(e instanceof Error?e.message:"Valor inválido.");}}
  async function close(event:FormEvent){event.preventDefault();try{const trimmed=balance.trim(),negative=trimmed.startsWith("-"),cents=parseBRLToCents(negative?trimmed.slice(1):trimmed);await send({action:"CLOSE",bankAccountId:bank,month,declaredBalanceCents:negative?`-${cents}`:cents});}catch(e){setMessage(e instanceof Error?e.message:"Saldo inválido.");}}
  if(data.error)return <ErrorNotice message={data.error} retry={data.reload}/>;
  if(data.loading||!data.data)return <p role="status">Carregando competência...</p>;
  const overview=data.data;
  return <div className="space-y-5">
    <Button type="button" variant="outline" disabled={busy} onClick={data.reload}>Atualizar competência</Button>
    {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
    <div className="grid gap-3 text-sm sm:grid-cols-2"><p>Saldo inicial no razão: <strong>{fmtBRL(overview.summary.opening)}</strong></p><p>Saldo final no razão: <strong>{fmtBRL(overview.summary.closing)}</strong></p><p>Extratos pendentes: {overview.summary.statementsPending}</p><p>Lançamentos pendentes: {overview.summary.ledgerPending}</p><p>Divergências abertas: {overview.summary.issuesOpen}</p><p>Saldo atual versus razão: {overview.summary.bankLedgerBalanced?"Conferido":"Divergente"}</p></div>
    {overview.closed?<p className="rounded-lg bg-emerald-50 p-3 font-semibold">Competência fechada. Alterações neste período e anteriores estão bloqueadas.</p>:<>
      <form onSubmit={allocate} className="grid gap-3 border-t pt-4 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Vincular valor parcial ou integral</h3>
        <label className="text-sm">Extrato<select required aria-label="Extrato para alocação" className="mt-1 block w-full rounded-lg border p-2" value={statement} onChange={e=>setStatement(e.target.value)}><option value="">Selecione</option>{overview.statements.map(s=><option key={s.id} value={s.id}>{s.direction==="CREDIT"?"Entrada":"Saída"} · {s.description} · restante {fmtBRL(s.remainingCents)}</option>)}</select></label>
        <label className="text-sm">Razão<select required aria-label="Razão para alocação" className="mt-1 block w-full rounded-lg border p-2" value={ledger} onChange={e=>setLedger(e.target.value)}><option value="">Selecione</option>{overview.ledger.filter(l=>BigInt(l.remainingCents)>0n&&(!row||l.direction===row.direction)).map(l=><option key={l.id} value={l.id}>{l.description} · restante {fmtBRL(l.remainingCents)}</option>)}</select></label>
        <label className="text-sm">Valor a vincular (R$)<Input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label><div className="self-end"><Button type="submit" disabled={busy}>Registrar alocação</Button></div>
      </form>
      <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Tratar divergência do extrato selecionado</h3>{row?.issues?.map(i=><p key={i.id} className="text-sm">{i.status==="OPEN"?"Aberta":"Resolvida"}: {i.reason}{i.resolution?` — ${i.resolution}`:""}</p>)}<label className="block text-sm">Motivo ou resolução<Input minLength={5} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button type="button" variant="outline" disabled={busy||!statement||reason.trim().length<5} onClick={()=>void send({action:issue?"RESOLVE":"ISSUE",statementId:statement,reason,...(issue?{issueId:issue.id}:{})})}>{issue?"Registrar resolução":"Abrir divergência"}</Button></div>
      {overview.canClose?<form onSubmit={close} className="space-y-3 border-t pt-4"><h3 className="font-semibold">Fechar competência</h3><p className="text-sm text-slate-600">Apenas meses encerrados podem ser fechados. O fechamento bloqueia novas importações e alterações de conciliação até o fim desse mês.</p><label className="block text-sm">Saldo final conferido no banco (R$)<Input required value={balance} onChange={e=>setBalance(e.target.value)} placeholder="0,00"/></label><label className="flex items-center gap-2 text-sm"><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Conferi o saldo e as pendências desta conta.</label><Button type="submit" disabled={busy||!confirmed}>Fechar competência</Button></form>:<p className="border-t pt-4 text-sm">O fechamento da competência exige perfil Administrador.</p>}
    </>}
    <p className="text-xs text-slate-500">Seletores exibem até 100 linhas de cada tipo deste mês. O resumo e o fechamento verificam a competência inteira.</p>
  </div>;
}
