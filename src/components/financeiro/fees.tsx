"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { api, Empty, ErrorNotice, Field, Loading, PageHeading, useApi } from "@/components/financeiro/shared";
import { FormCard, SelectField, percentToBps, bpsToPercent, nonnegativeBRLInput, type Catalog } from "@/components/financeiro/operations-shared";
import { fmtBRL } from "@/lib/money";
export function FeesPage() {
  const { data, loading, error, reload } = useApi<Catalog>("/api/financeiro/catalogo");
  const [eventId, setEventId] = useState(""), [mode,setMode] = useState<"PERCENT_BPS"|"FIXED_PER_TICKET">("PERCENT_BPS"),
    [value,setValue] = useState(""), [producerPaysMdr,setProducerPaysMdr] = useState(true), [message,setMessage] = useState(""), [busy,setBusy] = useState(false);
  function chooseEvent(id:string) {
    setEventId(id); const rule=data?.fees.find(x=>x.eventId===id);
    if(rule){ setMode(rule.mode); setProducerPaysMdr(rule.producerPaysMdr); setValue(rule.mode==="PERCENT_BPS"?bpsToPercent(Number(rule.value)).replace("%",""):fmtBRL(rule.value).replace("R$ ","")); }
    else {setValue("");setMode("PERCENT_BPS");setProducerPaysMdr(true);}
  }
  async function save(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{
    const parsed=mode==="PERCENT_BPS"?String(percentToBps(value)):nonnegativeBRLInput(value);
    await api("/api/financeiro/taxas",{method:"POST",body:JSON.stringify({eventId,mode,value:parsed,producerPaysMdr})});reload();
  }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível salvar.");}finally{setBusy(false);}}
  return <><PageHeading eyebrow="Financeiro interno · configuração confidencial" title="Divisão de Receitas e Taxas" subtitle="A taxa da Disk é negociada por evento, pode ser percentual sobre o ingresso ou fixa por ingresso, e não é exposta ao produtor em telas ou APIs."/>
    {error&&<ErrorNotice message={error} retry={reload}/>} {message&&<ErrorNotice message={message}/>}
    {loading?<Loading/>:<><FormCard title="Taxa da Disk por evento"><form className="grid gap-4 md:grid-cols-2" onSubmit={save}>
      <SelectField label="Evento e produtor" value={eventId} onChange={chooseEvent}><option value="">Selecione um evento</option>{data?.events.filter(x=>x.status!=="CLOSED").map(ev=><option key={ev.id} value={ev.id}>{ev.producerName} · {ev.name}</option>)}</SelectField>
      <SelectField label="Tipo de cobrança" value={mode} onChange={x=>{setMode(x as typeof mode);setValue("");}}><option value="PERCENT_BPS">Percentual sobre o valor do ingresso</option><option value="FIXED_PER_TICKET">Valor fixo por ingresso vendido</option></SelectField>
      <Field label={mode==="PERCENT_BPS"?"Taxa Disk (%)":"Taxa por ingresso (R$)"}><Input required value={value} placeholder={mode==="PERCENT_BPS"?"10,00":"5,00"} onChange={e=>setValue(e.target.value)}/></Field>
      <div className="flex items-end"><label className="flex gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={producerPaysMdr} onChange={e=>setProducerPaysMdr(e.target.checked)}/><span>MDR é descontado da parcela do produtor (desmarcado: custo da Disk)</span></label></div>
      <div className="md:col-span-2"><Button disabled={busy||!eventId}>{busy?"Salvando...":"Salvar taxa exclusiva do evento"}</Button></div>
    </form></FormCard>
    <Card className="mt-4 overflow-hidden"><div className="border-b border-slate-100 p-5 font-semibold">Regras comerciais internas</div>{data?.fees.length?<div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Produtor</th><th>Evento</th><th>Taxa Disk</th><th>Quem absorve MDR</th></tr></thead><tbody>{data.fees.map(f=><tr key={f.id}><td>{f.producerName}</td><td>{f.eventName}</td><td>{f.mode==="PERCENT_BPS"?bpsToPercent(Number(f.value)):fmtBRL(f.value)+" / ingresso"}</td><td>{f.producerPaysMdr?"Produtor":"Disk"}</td></tr>)}</tbody></table></div>:<Empty text="Nenhuma taxa por evento configurada."/>}</Card></>}
  </>;
}
