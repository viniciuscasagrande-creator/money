"use client";
import {useState,type FormEvent} from "react";
import Link from "next/link";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {api,PageHeading,Loading,ErrorNotice,Field,useApi} from "@/components/financeiro/shared";
import {fmtBRL,parseBRLToCents} from "@/lib/money";

type EventItem={id:string;name:string;producerId:string;producerName?:string;repasseCents:string;reserveCents:string;transferReservedCents:string};
type Res={id:string;eventId:string;eventName:string;producerName:string;purpose:string;amountCents:string;status:string};
type Transfer={id:string;origin:string;destination:string;status:string;amountCents:string;reason:string};
type Permission={producerId:string;name:string;enabled:boolean;maxPerTransferCents:string};
type ProducerOption={id:string;name:string};

export function RetentionsTransfers({mode}:{mode:"retencoes"|"transferencias"}){
 const payouts=useApi<{events:EventItem[];role:string}>("/api/repasses");
 const reserves=useApi<{items:Res[]}>("/api/financeiro/retencoes");
 const transfers=useApi<{items:Transfer[]}>("/api/financeiro/transferencias");
 const permissions=useApi<{items:Permission[];producers?:ProducerOption[]}>("/api/financeiro/permissoes-transferencia");
 const [event,setEvent]=useState(""),[dest,setDest]=useState(""),[purpose,setPurpose]=useState(""),[amount,setAmount]=useState(""),[reason,setReason]=useState("");
 const [retMode,setRetMode]=useState<"FIXED"|"PERCENT">("FIXED"),[retPct,setRetPct]=useState("5,00");
 const [producer,setProducer]=useState(""),[limit,setLimit]=useState(""),[enabled,setEnabled]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [justificationModal,setJustificationModal]=useState<{kind:"RELEASE_RESERVE"|"REJECT_TRANSFER";id:string;label:string}|null>(null);
 const [modalReason,setModalReason]=useState("");

 const internal=payouts.data?.role!=="PRODUCER";
 const events=payouts.data?.events||[];
 const origins=events.filter(e=>e.id!==dest);
 const fromEvents=events.map(e=>({id:e.producerId,name:e.producerName||e.name}));
 const fromPerms=(permissions.data?.producers||[]);
 const producers=[...new Map([...fromPerms,...fromEvents].map(p=>[p.id,p])).values()];
 const source=events.find(e=>e.id===event);
 const destinations=events.filter(e=>e.producerId===source?.producerId && e.id!==source?.id);

 const reserveItems=reserves.data?.items||[];
 const transferItems=transfers.data?.items||[];
 const activeReserveSum=reserveItems.filter(r=>r.status==="ACTIVE").reduce((s,r)=>s+BigInt(r.amountCents||"0"),0n);
 const activeTransferSum=transferItems.filter(t=>t.status==="REQUESTED"||t.status==="APPROVED").reduce((s,t)=>s+BigInt(t.amountCents||"0"),0n);
 const executedTransferSum=transferItems.filter(t=>t.status==="EXECUTED").reduce((s,t)=>s+BigInt(t.amountCents||"0"),0n);
 const totalEligibleSum=events.reduce((s,e)=>s+BigInt(e.repasseCents||"0"),0n);

 function selectProducerForPolicy(prodId:string){
  setProducer(prodId);
  const existing=(permissions.data?.items||[]).find(p=>p.producerId===prodId);
  if(existing){
   setEnabled(existing.enabled);
   setLimit(fmtBRL(existing.maxPerTransferCents).replace("R$ ","").trim());
  } else {
   setEnabled(true);
   setLimit("");
  }
 }

 async function send(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try {
  const endpoint=mode==="retencoes"?"/api/financeiro/retencoes":"/api/financeiro/transferencias";
  let computedAmountCents = "";
  let computedPurpose = purpose;
  if (mode === "retencoes" && retMode === "PERCENT") {
   const normalized = retPct.replace(",", ".");
   const [whole, dec = ""] = normalized.split(".");
   const bps = Number(whole) * 100 + Number((dec + "00").slice(0, 2));
   const baseCents = BigInt(source?.repasseCents || "0");
   const calc = (baseCents * BigInt(bps) + 5000n) / 10000n;
   computedAmountCents = calc > 0n ? calc.toString() : parseBRLToCents(amount || "1,00");
   computedPurpose = `${purpose} (${retPct}%)`;
  } else {
   computedAmountCents = parseBRLToCents(amount);
  }
  const body=mode==="retencoes"?{eventId:event,purpose:computedPurpose,amountCents:computedAmountCents}:
   {originEventId:event,destinationEventId:dest,amountCents:parseBRLToCents(amount),reason};
  await api(endpoint,{method:"POST",body:JSON.stringify(body)});
  setAmount("");setReason("");setPurpose("");setMessage("Registro criado. Indicadores atualizados.");
  reserves.reload();transfers.reload();payouts.reload();
 }catch(err){setMessage(err instanceof Error?err.message:"Falha ao registrar.");}finally{setBusy(false);}}

 async function change(url:string,body:object){setBusy(true);setMessage("");try{await api(url,{method:"POST",body:JSON.stringify(body)});reserves.reload();transfers.reload();permissions.reload();payouts.reload();setMessage("Operação concluída.");}catch(err){setMessage(err instanceof Error?err.message:"Falha na operação.");}finally{setBusy(false);}}

 async function confirmModalJustification(e:FormEvent){
  e.preventDefault();
  if(!justificationModal)return;
  const target=justificationModal;
  const text=modalReason.trim();
  setJustificationModal(null);
  setModalReason("");
  if(target.kind==="RELEASE_RESERVE"){
   await change(`/api/financeiro/retencoes/${target.id}`,{reason:text});
  } else {
   await change(`/api/financeiro/transferencias/${target.id}`,{action:"REJECT",reason:text});
  }
 }

 return <>
 <PageHeading eyebrow="Financeiro · Controle por evento" title={mode==="retencoes"?"Retenções Obrigatórias":"Transferências entre Eventos"}
 subtitle={mode==="retencoes"?"Proteja compromissos de ECAD, aluguel, tributos e custos do evento (em % ou valor fixo R$); somente o Financeiro pode alterar reservas.":"Transfira posições internamente entre eventos do mesmo produtor, com reserva de origem, permissão e aprovação interna."}
 action={<div className="flex flex-wrap gap-2">
  <Link href={mode==="retencoes"?"/transferencias":"/retencoes"} className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">{mode==="retencoes"?"Ir para Transferências entre Eventos":"Ir para Retenções Obrigatórias"}</Link>
  <Link href="/repasses" className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800">Voltar para Repasses & Central de 20 Travas</Link>
 </div>}/>

 <div className="mb-5 grid gap-4 md:grid-cols-4">
  <Card className="p-4">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Saldo Elegível Consolidado</p>
   <p className="mt-2 font-mono text-xl font-semibold text-emerald-700">{fmtBRL(totalEligibleSum.toString())}</p>
   <p className="mt-1 text-xs text-slate-500">{events.length} evento(s) monitorado(s)</p>
  </Card>
  <Card className="p-4">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Retenções Ativas (Prisma)</p>
   <p className="mt-2 font-mono text-xl font-semibold text-amber-700">{fmtBRL(activeReserveSum.toString())}</p>
   <p className="mt-1 text-xs text-slate-500">{reserveItems.filter(r=>r.status==="ACTIVE").length} reserva(s) ativa(s)</p>
  </Card>
  <Card className="p-4">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Transferências em Fila</p>
   <p className="mt-2 font-mono text-xl font-semibold text-indigo-700">{fmtBRL(activeTransferSum.toString())}</p>
   <p className="mt-1 text-xs text-slate-500">{transferItems.filter(t=>t.status==="REQUESTED"||t.status==="APPROVED").length} pendente(s)/aprovada(s)</p>
  </Card>
  <Card className="p-4">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Transferências Executadas</p>
   <p className="mt-2 font-mono text-xl font-semibold text-slate-900">{fmtBRL(executedTransferSum.toString())}</p>
   <p className="mt-1 text-xs text-slate-500">{transferItems.filter(t=>t.status==="EXECUTED").length} concluída(s)</p>
  </Card>
 </div>

 {message&&<div aria-live="polite" className="mb-4"><ErrorNotice message={message}/></div>}
 {payouts.error&&<ErrorNotice message={payouts.error} retry={payouts.reload}/>}
 {(payouts.loading||transfers.loading)&&<Loading/>}
 <div className="grid gap-4 lg:grid-cols-2">
  <Card className="p-5"><h2 className="mb-4 text-lg font-semibold">{mode==="retencoes"?"Nova retenção (% ou R$)":"Solicitar transferência"}</h2>
   {mode==="retencoes"&&!internal?<p>Área restrita ao Financeiro Interno.</p>:<form onSubmit={send} className="space-y-3">
    <label className="block text-sm">Evento de {mode==="retencoes"?"retenção":"origem"}</label>
    <select required className="w-full rounded-xl border border-slate-200 p-3" value={event} onChange={e=>{setEvent(e.target.value);setDest("");}}><option value="">Selecione o evento</option>{origins.map(e=><option key={e.id} value={e.id}>{e.name} · disponível {fmtBRL(e.repasseCents)}</option>)}</select>
    {mode==="transferencias"?<><label className="block text-sm">Evento de destino (mesmo produtor)</label><select required className="w-full rounded-xl border border-slate-200 p-3" value={dest} onChange={e=>setDest(e.target.value)}><option value="">Selecione destino</option>{destinations.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><label className="block text-sm">Justificativa</label><Input required minLength={8} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo operacional da transferência interna"/><label className="block text-sm">Valor (R$)</label><Input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></>:<><label className="block text-sm">Finalidade (ECAD, aluguel, ISS etc.)</label><Input required minLength={3} value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Ex.: Retenção ECAD / Locação de espaço"/>
    <div className="grid grid-cols-2 gap-2 pt-1">
     <button type="button" onClick={()=>setRetMode("FIXED")} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${retMode==="FIXED"?"border-slate-900 bg-slate-900 text-white":"border-slate-200 bg-white text-slate-700"}`}>Valor Fixo (R$)</button>
     <button type="button" onClick={()=>setRetMode("PERCENT")} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${retMode==="PERCENT"?"border-slate-900 bg-slate-900 text-white":"border-slate-200 bg-white text-slate-700"}`}>Percentual (%)</button>
    </div>
    {retMode==="PERCENT"?<><label className="block text-sm">Percentual sobre o saldo do evento (%)</label><Input required value={retPct} onChange={e=>setRetPct(e.target.value)} placeholder="Ex.: 5,00"/></>:<><label className="block text-sm">Valor Fixo (R$)</label><Input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></>}</>}
    <Button type="submit" disabled={busy}>{busy?"Salvando...":mode==="retencoes"?"Criar retenção":"Solicitar transferência"}</Button>
   </form>}
  </Card>
  <Card className="p-5"><h2 className="mb-4 text-lg font-semibold">Posição por evento</h2>
   <div className="space-y-3">{events.length===0?<p className="text-sm text-slate-500">Não há eventos vinculados.</p>:events.map(e=><div key={e.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium">{e.name}</p>{e.producerName&&<Badge tone="neutral">{e.producerName}</Badge>}</div><p className="mt-1 text-xs text-slate-500">Elegível: <strong className="text-emerald-700">{fmtBRL(e.repasseCents)}</strong> · Retido: <strong className="text-amber-700">{fmtBRL(e.reserveCents||"0")}</strong> · Transf. reservada: <strong className="text-indigo-700">{fmtBRL(e.transferReservedCents||"0")}</strong></p></div>)}</div></Card>
 </div>
 <Card className="mt-5 p-5"><h2 className="mb-4 text-lg font-semibold">Histórico</h2>
 {mode==="retencoes"?(reserveItems.length===0?<p className="text-sm text-slate-500">Nenhuma retenção registrada.</p>:reserveItems.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm"><span><strong>{r.eventName}</strong> ({r.producerName}) · {r.purpose} · <span className="font-mono font-semibold">{fmtBRL(r.amountCents)}</span> · <Badge tone={r.status==="ACTIVE"?"amber":"green"}>{r.status}</Badge></span>{internal&&r.status==="ACTIVE"&&<Button variant="outline" disabled={busy} onClick={()=>{setModalReason("");setJustificationModal({kind:"RELEASE_RESERVE",id:r.id,label:`${r.eventName} · ${r.purpose} (${fmtBRL(r.amountCents)})`});}}>Liberar com justificativa</Button>}</div>)):(transferItems.length===0?<p className="text-sm text-slate-500">Nenhuma transferência solicitada.</p>:transferItems.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm"><span><strong>{t.origin}</strong> → <strong>{t.destination}</strong> · <span className="font-mono font-semibold">{fmtBRL(t.amountCents)}</span> · <Badge tone={t.status==="EXECUTED"?"green":t.status==="REJECTED"?"red":"amber"}>{t.status}</Badge> · <span className="text-xs text-slate-500">{t.reason}</span></span><div className="flex flex-wrap gap-2">{internal&&t.status==="REQUESTED"&&<Button disabled={busy} onClick={()=>change(`/api/financeiro/transferencias/${t.id}`,{action:"APPROVE"})}>Aprovar</Button>}{internal&&t.status==="APPROVED"&&<Button disabled={busy} onClick={()=>change(`/api/financeiro/transferencias/${t.id}`,{action:"EXECUTE"})}>Registrar transferência interna</Button>}{internal&&(t.status==="REQUESTED"||t.status==="APPROVED")&&<Button variant="outline" disabled={busy} onClick={()=>{setModalReason("");setJustificationModal({kind:"REJECT_TRANSFER",id:t.id,label:`${t.origin} → ${t.destination} (${fmtBRL(t.amountCents)})`});}}>Reprovar</Button>}</div></div>))}
 </Card>
 {internal&&mode==="transferencias"&&<Card className="mt-5 p-5"><h2 className="mb-3 text-lg font-semibold">Habilitar produtor</h2><p className="mb-3 text-xs text-slate-500">O Financeiro decide quais produtores poderão solicitar transferências.</p><form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();change("/api/financeiro/permissoes-transferencia",{producerId:producer,enabled,maxPerTransferCents:parseBRLToCents(limit||"0")});}}><select required className="rounded-xl border p-3 text-sm" value={producer} onChange={e=>selectProducerForPolicy(e.target.value)}><option value="">Produtor</option>{producers.map(pr=><option value={pr.id} key={pr.id}>{pr.name} ({pr.id.slice(0,8)}…)</option>)}</select><label className="text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Habilitado</label><Input required placeholder="Limite por operação R$" value={limit} onChange={e=>setLimit(e.target.value)}/><Button disabled={busy} type="submit">Salvar política</Button></form>
 <div className="mt-3 space-y-1 text-sm">{permissions.data?.items.map(q=><p key={q.producerId}><strong>{q.name}</strong>: {q.enabled?"permitido":"bloqueado"} · teto por operação {fmtBRL(q.maxPerTransferCents)}</p>)}</div></Card>}

 <Dialog open={Boolean(justificationModal)} onOpenChange={v=>{if(!v){setJustificationModal(null);setModalReason("");}}}>
  <DialogContent>
   <DialogTitle className="text-xl font-bold">
    {justificationModal?.kind==="RELEASE_RESERVE"?"Liberar retenção obrigatória":"Reprovar transferência entre eventos"}
   </DialogTitle>
   <DialogDescription>
    {justificationModal?.label} — Informe a justificativa auditável ({justificationModal?.kind==="RELEASE_RESERVE"?"mínimo 10 caracteres":"mínimo 8 caracteres"}).
   </DialogDescription>
   <form className="mt-4 space-y-4" onSubmit={confirmModalJustification}>
    <Field label="Justificativa para trilha de auditoria">
     <Input
      required
      minLength={justificationModal?.kind==="RELEASE_RESERVE"?10:8}
      value={modalReason}
      onChange={e=>setModalReason(e.target.value)}
      placeholder="Descreva o motivo comprovado da decisão financeira"
     />
    </Field>
    <div className="flex justify-end gap-2">
     <Button type="button" variant="outline" onClick={()=>{setJustificationModal(null);setModalReason("");}}>Cancelar</Button>
     <Button type="submit" disabled={busy}>Confirmar registro auditado</Button>
    </div>
   </form>
  </DialogContent>
 </Dialog>
 </>;
}
