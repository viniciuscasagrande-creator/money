"use client";
import {useState,type FormEvent} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card} from "@/components/ui/card";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {useApi,ErrorNotice} from "@/components/financeiro/shared";
import {parseBRLToCents,fmtBRL} from "@/lib/money";
type Account={id:string;code:string;name:string;type:string;postable:boolean;active:boolean};
type Business={id:string;type:string;sourceId:string;amountCents:string;status:string};
type Rule={id:string;eventType:string;version:number;active:boolean};
type Draft={accountId:string;debit:string;credit:string;eventId:string};
const empty=():Draft=>({accountId:"",debit:"",credit:"",eventId:""});
export function AccountingWorkflow({onPosted}:{onPosted:()=>void}){
 const events=useApi<{items:Business[]}>("/api/contabilidade?visao=eventos"),accounts=useApi<{items:Account[]}>("/api/contabilidade?visao=contas"),rules=useApi<{items:Rule[]}>("/api/contabilidade?visao=regras"),catalog=useApi<{events:{id:string;name:string}[]}>("/api/controle/catalogo");
 const [event,setEvent]=useState(""),[rule,setRule]=useState(""),[lines,setLines]=useState<Draft[]>([empty(),empty()]),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[reviewed,setReviewed]=useState(false);
 const [preview,setPreview]=useState<{signature:string;hash:string;canPost:boolean}|null>(null);
 const selected=events.data?.items.find(e=>e.id===event),signature=JSON.stringify({event,rule,lines});
 function cents(value:string){return !value.trim()||/^0(?:,0{1,2})?$/.test(value.trim())?"0":parseBRLToCents(value);}
 async function submit(e:FormEvent,post=false){e.preventDefault();setBusy(true);setMessage("");try{
  const payload={businessEventId:event,ruleId:rule,customPostings:lines.map(l=>({accountId:l.accountId,debitCents:cents(l.debit),creditCents:cents(l.credit),...(l.eventId?{eventId:l.eventId}:{})})),...(post?{previewHash:preview?.hash}:{})};
  const response=await fetch(post?"/api/contabilidade/processar":"/api/contabilidade/previa",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha de contabilização.");
  if(post){setMessage(data.duplicate?"Fato já contabilizado; lançamento anterior preservado.":"Lançamento contábil registrado sem alterar o saldo bancário.");setPreview(null);setReviewed(false);events.reload();onPosted();}
  else{setPreview({signature,hash:data.previewHash,canPost:data.canPost});setReviewed(false);setMessage("Prévia balanceada. Confira contas, valores e eventos antes de confirmar.");}
 }catch(error){setPreview(null);setReviewed(false);setMessage(error instanceof Error?error.message:"Falha ao consultar prévia.");}finally{setBusy(false);}}
 function update(index:number,key:keyof Draft,value:string){setLines(all=>all.map((line,i)=>i===index?{...line,[key]:value}:line));setPreview(null);setReviewed(false);}
 const error=events.error||accounts.error||rules.error||catalog.error;
 return <Card className="space-y-4 p-5"><h2 className="text-lg font-semibold">Revisar e contabilizar um fato</h2><p className="text-sm text-slate-600">Selecione a regra e distribua o valor entre contas analíticas. Vendas e transferências integradas exigem partidas explícitas; alíquotas e contas não são escolhidas automaticamente. A confirmação exige Administrador.</p>
  {error&&<ErrorNotice message={error}/>}
  {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
  <form onSubmit={e=>void submit(e)} className="space-y-4">
   <label className="block text-sm">Fato pendente (até 100 eventos recentes)<select required value={event} onChange={e=>{setEvent(e.target.value);setRule("");setPreview(null);setReviewed(false);}} className="mt-1 w-full rounded-lg border p-2"><option value="">Selecione</option>{events.data?.items.filter(e=>e.status==="PENDING").map(e=><option key={e.id} value={e.id}>{e.type} · {e.sourceId} · {fmtBRL(e.amountCents)}</option>)}</select></label>
   <label className="block text-sm">Regra ativa<select required value={rule} onChange={e=>{setRule(e.target.value);setPreview(null);setReviewed(false);}} className="mt-1 w-full rounded-lg border p-2"><option value="">Selecione</option>{rules.data?.items.filter(r=>r.active&&r.eventType===selected?.type).map(r=><option key={r.id} value={r.id}>{r.eventType} · versão {r.version}</option>)}</select></label>
   {lines.map((line,index)=><div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4"><label className="text-sm">Conta<select required value={line.accountId} onChange={e=>update(index,"accountId",e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Selecione</option>{accounts.data?.items.filter(a=>a.active&&a.postable).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label><label className="text-sm">Débito (R$)<Input value={line.debit} onChange={e=>update(index,"debit",e.target.value)} placeholder="0,00"/></label><label className="text-sm">Crédito (R$)<Input value={line.credit} onChange={e=>update(index,"credit",e.target.value)} placeholder="0,00"/></label><label className="text-sm">Evento da partida<select value={line.eventId} onChange={e=>update(index,"eventId",e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Usar evento do fato</option>{catalog.data?.events.map(ev=><option key={ev.id} value={ev.id}>{ev.name}</option>)}</select></label></div>)}
   <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy||lines.length>=20} onClick={()=>{setLines(all=>[...all,empty()]);setPreview(null);setReviewed(false);}}>Adicionar partida</Button><Button type="button" variant="outline" disabled={busy||lines.length<=2} onClick={()=>{setLines(all=>all.slice(0,-1));setPreview(null);setReviewed(false);}}>Remover última</Button><Button type="submit" disabled={busy||!event||!rule}>Conferir prévia</Button></div>
   {preview?.signature===signature&&(preview.canPost?<div className="space-y-3 border-t pt-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>Revisei as contas, a competência e a distribuição dos valores.</label><Button type="button" disabled={busy||!reviewed} onClick={e=>void submit(e,true)}>Confirmar contabilização</Button></div>:<p className="text-sm">Prévia disponível para consulta. A confirmação exige Administrador.</p>)}
  </form>
 </Card>;
}
export function AccountingRulesEditor({onChanged}:{onChanged:()=>void}){
 const rules=useApi<{items:Rule[];canManage:boolean}>("/api/contabilidade?visao=regras"),accounts=useApi<{items:Account[]}>("/api/contabilidade?visao=contas");
 const [type,setType]=useState(""),[version,setVersion]=useState("1"),[debit,setDebit]=useState(""),[credit,setCredit]=useState(""),[from,setFrom]=useState(new Date().toISOString().slice(0,10)),[until,setUntil]=useState(""),[target,setTarget]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function send(url:string,method:string,body:unknown){setBusy(true);setMessage("");try{const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||"Falha ao registrar regra.");setMessage("Regra registrada. A ativação é uma ação separada e substitui a regra ativa desse tipo de fato.");rules.reload();onChanged();}catch(e){setMessage(e instanceof Error?e.message:"Falha na regra.");}finally{setBusy(false);}}
 if(rules.error||accounts.error)return <ErrorNotice message={rules.error||accounts.error}/>;
 if(!rules.data)return <p role="status">Carregando regras...</p>;
 if(!rules.data.canManage)return <p className="text-sm">Criação e ativação de regras exigem Administrador.</p>;
 const options=accounts.data?.items.filter(a=>a.active&&a.postable)??[];
 return <Card className="space-y-4 p-5"><h2 className="font-semibold">Criar versão de regra</h2><p className="text-sm text-slate-600">As contas padrão servem de referência para lançamentos simples. Revise as partidas e os centros de evento antes de contabilizar vendas e transferências.</p>{message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
  <form onSubmit={e=>{e.preventDefault();void send("/api/contabilidade/cadastros","POST",{kind:"rule",eventType:type,version:Number(version),debitAccountId:debit,creditAccountId:credit,validFrom:`${from}T00:00:00.000Z`,validUntil:until?`${until}T23:59:59.999Z`:null});}} className="grid gap-3 sm:grid-cols-2">
   <label className="text-sm">Tipo do fato (como aparece nos eventos)<Input required pattern="[A-Z_]{3,60}" value={type} onChange={e=>setType(e.target.value.toUpperCase())} placeholder="TICKET_SALE_CAPTURED"/></label><label className="text-sm">Versão<Input required type="number" min={1} step={1} value={version} onChange={e=>setVersion(e.target.value)}/></label>
   <label className="text-sm">Conta padrão de débito<select required value={debit} onChange={e=>setDebit(e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Selecione</option>{options.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label><label className="text-sm">Conta padrão de crédito<select required value={credit} onChange={e=>setCredit(e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Selecione</option>{options.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
   <label className="text-sm">Válida desde<Input required type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">Válida até (opcional)<Input type="date" value={until} onChange={e=>setUntil(e.target.value)}/></label><div><Button disabled={busy} type="submit">Criar regra inativa</Button></div>
  </form><div className="space-y-3 border-t pt-4"><label className="block text-sm">Versão para ativar ou desativar<select value={target} onChange={e=>setTarget(e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Selecione</option>{rules.data.items.map(r=><option key={r.id} value={r.id}>{r.eventType} · v{r.version} · {r.active?"Ativa":"Inativa"}</option>)}</select></label><div className="flex gap-2"><Button disabled={busy||!target} onClick={()=>void send("/api/contabilidade/regras","PATCH",{ruleId:target,active:true})}>Ativar versão</Button><Button variant="outline" disabled={busy||!target} onClick={()=>void send("/api/contabilidade/regras","PATCH",{ruleId:target,active:false})}>Desativar versão</Button></div></div>
 </Card>;
}
type Trail={journal:{id:string;occurredAt:string;ruleVersion:number;period:{name:string};businessEvent:{externalKey:string;type:string;sourceId:string};postings:{id:string;debitCents:string;creditCents:string;eventId:string|null;account:{id:string;code:string;name:string}}[]};origin:{kind:string;id?:string;reference?:string;amountCents?:string};snapshot:{accounts:Account[]}|null;operator:{name:string}|null;legacySnapshotUnavailable:boolean};
export function AccountingTrail({id,onClose}:{id:string;onClose:()=>void}){
 const data=useApi<Trail>(`/api/contabilidade/trilha?journalId=${encodeURIComponent(id)}`),trail=data.data;
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-h-[85vh] overflow-auto sm:max-w-3xl"><DialogTitle>Origem e partidas do lançamento</DialogTitle><DialogDescription>Consulte o fato, a operação vinculada e as contas usadas na contabilização.</DialogDescription>
  {data.error&&<ErrorNotice message={data.error} retry={data.reload}/>}
  {data.loading&&<p role="status">Carregando trilha...</p>}
  {trail&&<div className="space-y-4 text-sm"><p>Competência: {trail.journal.period.name} · Regra v{trail.journal.ruleVersion} · Responsável: {trail.operator?.name??"Não registrado no legado"}</p><p>Fato: {trail.journal.businessEvent.type} · Referência: {trail.journal.businessEvent.externalKey}</p><p>Origem: {({SALE:"Venda",TITLE:"Título financeiro",PAYOUT:"Repasse",RESERVE:"Retenção",TRANSFER:"Transferência interna",MANUAL:"Registro manual sem vínculo automático",SOURCE_NOT_FOUND:"Operação não localizada"} as Record<string,string>)[trail.origin.kind]??trail.origin.kind}{trail.origin.reference?` · ${trail.origin.reference}`:""}</p><p>Identificador da operação: {trail.origin.id??trail.journal.businessEvent.sourceId}</p>
    {trail.legacySnapshotUnavailable&&<p className="rounded-lg bg-amber-50 p-3">Este lançamento antigo não possui cópia histórica da regra e das contas. Os nomes abaixo são do cadastro atual.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Conta na contabilização</th><th>Débito</th><th>Crédito</th><th>Evento</th></tr></thead><tbody>{trail.journal.postings.map(p=>{const account=trail.snapshot?.accounts.find(a=>a.id===p.account.id)??p.account;return <tr key={p.id} className="border-t"><td className="py-2">{account.code} · {account.name}</td><td>{fmtBRL(p.debitCents)}</td><td>{fmtBRL(p.creditCents)}</td><td>{p.eventId??"Consolidado"}</td></tr>;})}</tbody></table></div>
  </div>}
 </DialogContent></Dialog>;
}
