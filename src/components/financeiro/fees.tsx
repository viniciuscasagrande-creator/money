"use client";
import {useState,type FormEvent} from "react";
import {Plus,Pencil,Calculator,Sliders} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {api,Empty,ErrorNotice,Field,Loading,PageHeading,useApi} from "@/components/financeiro/shared";
import {SelectField,percentToBps,bpsToPercent,nonnegativeBRLInput,type Catalog} from "@/components/financeiro/operations-shared";
import {ListSearch,searchRows} from "@/components/financeiro/list-search";
import {fmtBRL} from "@/lib/money";
import {simulateInstallmentMatrix,type CostBearer,type SaleChannel} from "@/lib/split-calculation";

export function FeesPage(){
 const {data,loading,error,reload}=useApi<Catalog>("/api/financeiro/catalogo");
 const [open,setOpen]=useState(false),[extOpen,setExtOpen]=useState(false),[query,setQuery]=useState("");
 const [eventId,setEventId]=useState(""),[mode,setMode]=useState<"PERCENT_BPS"|"FIXED_PER_TICKET">("PERCENT_BPS");
 const [value,setValue]=useState(""),[producerPaysMdr,setProducerPaysMdr]=useState(true),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);

 // Spread, Advanced, Rebate & Canal
 const [extEventId,setExtEventId]=useState("");
 const [channel,setChannel]=useState<SaleChannel>("ONLINE");
 const [costBearer,setCostBearer]=useState<CostBearer>("PRODUCER");
 const [spreadPct,setSpreadPct]=useState("0,00"),[advancedPct,setAdvancedPct]=useState("0,00"),[rebatePct,setRebatePct]=useState("0,00"),[interestPct,setInterestPct]=useState("8,00");

 // Simulador de matriz de parcelamento (1x a 12x)
 const [simTicketBRL,setSimTicketBRL]=useState("200,00");
 const [simChargePct,setSimChargePct]=useState("8,00");
 const [simBearer,setSimBearer]=useState<CostBearer>("BUYER");
 const [simInstallments,setSimInstallments]=useState("12");

 const shown=searchRows(data?.fees,query,f=>[f.eventName,f.producerName,f.mode]);
 function chooseEvent(id:string){setEventId(id);const policy=data?.fees.find(x=>x.eventId===id);
  if(policy){setMode(policy.mode);setProducerPaysMdr(policy.producerPaysMdr);setValue(policy.mode==="PERCENT_BPS"?bpsToPercent(Number(policy.value)).replace("%",""):fmtBRL(policy.value).replace("R$ ",""));}
  else {setValue("");setMode("PERCENT_BPS");setProducerPaysMdr(true);}
 }
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{
  const parsed=mode==="PERCENT_BPS"?String(percentToBps(value)):nonnegativeBRLInput(value);
  await api("/api/financeiro/taxas",{method:"POST",body:JSON.stringify({eventId,mode,value:parsed,producerPaysMdr})});setOpen(false);reload();
 }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível salvar.");}finally{setBusy(false);}}

 async function saveExt(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{
  await api("/api/repasses/travas",{method:"POST",body:JSON.stringify({
   kind:"FEE_EXTENSION_SAVE",eventId:extEventId,channel,costBearer,
   spreadBps:percentToBps(spreadPct),advancedBps:percentToBps(advancedPct),
   rebateBps:percentToBps(rebatePct),installmentInterestBps:percentToBps(interestPct)
  })});
  setExtOpen(false);reload();
 }catch(e){setMessage(e instanceof Error?e.message:"Erro ao salvar parâmetros avançados.");}finally{setBusy(false);}}

 let simMatrix: ReturnType<typeof simulateInstallmentMatrix> | null = null;
 try {
  simMatrix = simulateInstallmentMatrix({
   ticketPriceCents: BigInt(nonnegativeBRLInput(simTicketBRL || "0,00")),
   totalChargeBps: percentToBps(simChargePct || "0,00"),
   costBearer: simBearer,
   installments: Number(simInstallments) || 12
  });
 } catch { simMatrix = null; }

 const allFees = data?.fees || [];
 const allEvents = data?.events || [];
 const allRules = data?.rules || [];
 const pctFees = allFees.filter(f => f.mode === "PERCENT_BPS");
 const avgFeeBps = pctFees.length ? Math.round(pctFees.reduce((s, f) => s + Number(f.value || 0), 0) / pctFees.length) : 0;
 const producerPaysMdrCount = allFees.filter(f => f.producerPaysMdr).length;

 return <><PageHeading eyebrow="Financeiro interno · configuração confidencial" title="Motor de Receitas, Taxas, Spread, Advanced e Rebate" subtitle="A taxa administrativa SOUL é negociada por evento (percentual ou fixa) e permanece oculta do Produtor no backend. Configure também canal (Online / Maquininha PagSeguro / Bilheteria), responsável pelo encargo e simulador de parcelamento 1x a 12x." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setMessage("");setExtOpen(true);}}><Sliders size={16}/>Spread, Advanced e Rebate</Button><Button onClick={()=>{setMessage("");setOpen(true);}}><Plus size={16}/>Configurar taxa por evento</Button></div>}/>
 <div className="mb-5 grid gap-4 md:grid-cols-4">
  <Card className="p-4">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Eventos com Taxa Configurada</p>
   <p className="mt-2 font-mono text-xl font-semibold text-slate-900">{allFees.length} / {allEvents.length}</p>
   <p className="mt-1 text-xs text-slate-500">Políticas comerciais ativas</p>
  </Card>
  <Card className="p-4">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Taxa Percentual Média</p>
   <p className="mt-2 font-mono text-xl font-semibold text-[#b75c53]">{bpsToPercent(avgFeeBps)}</p>
   <p className="mt-1 text-xs text-slate-500">{pctFees.length} evento(s) em percentual</p>
  </Card>
  <Card className="p-4">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">MDR Absorvido pelo Produtor</p>
   <p className="mt-2 font-mono text-xl font-semibold text-emerald-700">{producerPaysMdrCount}</p>
   <p className="mt-1 text-xs text-slate-500">{allFees.length - producerPaysMdrCount} absorvido(s) pela SOUL</p>
  </Card>
  <Card className="p-4">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Regras de MDR no Catálogo</p>
   <p className="mt-2 font-mono text-xl font-semibold text-indigo-700">{allRules.filter(r => r.active).length}</p>
   <p className="mt-1 text-xs text-slate-500">Gateways e bandeiras habilitados</p>
  </Card>
 </div>
 {error&&<ErrorNotice message={error} retry={reload}/>} {loading?<Loading/>:<><ListSearch value={query} onChange={setQuery} count={shown.length} label="Buscar taxa por evento ou produtor"/>
 <Card className="overflow-hidden"><div className="border-b border-[#eee9e7] p-5 font-semibold">Regras comerciais internas (Taxa Administrativa SOUL e Absorção de MDR)</div>
 {shown.length?<div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Produtor</th><th>Evento</th><th>Taxa interna SOUL</th><th>Quem absorve MDR</th><th>Visibilidade Produtor</th><th>Ação</th></tr></thead><tbody>{shown.map(f=><tr key={f.id}><td>{f.producerName}</td><td>{f.eventName}</td><td>{f.mode==="PERCENT_BPS"?bpsToPercent(Number(f.value)):fmtBRL(f.value)+" / ingresso"}</td><td>{f.producerPaysMdr?"Produtor":"SOUL (Administradora)"}</td><td><Badge tone="amber">Confidencial no Backend</Badge></td><td><Button size="sm" variant="outline" onClick={()=>{chooseEvent(f.eventId);setOpen(true);}}><Pencil size={14}/>Editar</Button></td></tr>)}</tbody></table></div>:<Empty text="Nenhuma regra corresponde à busca ou foi cadastrada."/>}</Card>

 <div className="mt-5 grid gap-5 lg:grid-cols-2">
  <Card className="p-5">
   <div className="flex items-center gap-2"><Calculator size={18} className="text-[#b75c53]"/><h2 className="text-lg font-semibold">Simulador de Matriz de Parcelamento (1x a 12x)</h2></div>
   <p className="mt-1 text-xs text-slate-500">Simule quem absorve o encargo do parcelamento (Cliente final, Produtor ou SOUL Administradora) para vendas Online e Maquininhas PagSeguro/PagBank.</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <Field label="Valor do ingresso (R$)"><Input value={simTicketBRL} onChange={e=>setSimTicketBRL(e.target.value)} placeholder="200,00"/></Field>
    <Field label="Encargo total da parcela (%)"><Input value={simChargePct} onChange={e=>setSimChargePct(e.target.value)} placeholder="8,00"/></Field>
    <Field label="Número de parcelas (1x a 12x)"><Input type="number" min="1" max="12" value={simInstallments} onChange={e=>setSimInstallments(e.target.value)}/></Field>
    <SelectField label="Quem absorve o encargo?" value={simBearer} onChange={v=>setSimBearer(v as CostBearer)}>
     <option value="BUYER">Cliente final (Comprador)</option>
     <option value="PRODUCER">Produtor do evento</option>
     <option value="SOUL">SOUL (Administradora)</option>
    </SelectField>
   </div>
   {simMatrix && (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
     <div className="grid grid-cols-2 gap-3">
      <div><span className="text-xs text-slate-500">Encargo estimado ({simMatrix.installments}x)</span><p className="text-lg font-bold text-slate-900">{fmtBRL(simMatrix.chargeCents.toString())}</p></div>
      <div><span className="text-xs text-slate-500">Total cobrado ao cliente</span><p className="text-xl font-extrabold text-emerald-700">{fmtBRL(simMatrix.buyerTotalCents.toString())}</p></div>
      <div><span className="text-xs text-slate-500">Valor estimado por parcela</span><p className="font-semibold">{simMatrix.installments}x de {fmtBRL(simMatrix.installmentValueCents.toString())}</p></div>
      <div><span className="text-xs text-slate-500">Responsável pelo custo</span><p className="font-semibold">{simMatrix.costBearer==="BUYER"?"Cliente final":simMatrix.costBearer==="PRODUCER"?"Produtor":"SOUL (Administradora)"}</p></div>
     </div>
    </div>
   )}
  </Card>

  <Card className="p-5">
   <h2 className="text-lg font-semibold">Separação de Receitas, Spread, Advanced e Rebate</h2>
   <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
    <p><strong>1. Valor vendido vs. Valor liquidado:</strong> Um pagamento apenas autorizado ou capturado nunca entra como saldo disponível antes da liquidação efetiva pela adquirente/banco.</p>
    <p><strong>2. Taxa Administrativa SOUL (3 níveis):</strong> Visível integralmente para o Financeiro SOUL; ocultada no backend das APIs do Produtor, exibindo ao produtor apenas deduções contratualmente conciliáveis.</p>
    <p><strong>3. Spread, Advanced e Rebate:</strong> Parametrizáveis por evento e canal (Online, Maquininha PagSeguro EDI ou Bilheteria), preservando a memória de cálculo imutável por transação.</p>
   </div>
  </Card>
 </div>
 </>}

 <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle className="text-xl font-bold">Taxa e divisão de receita</DialogTitle><DialogDescription>Alterações são aplicadas apenas às novas vendas. Valores históricos não são recalculados.</DialogDescription>
 <form className="mt-5 space-y-4" onSubmit={save}>
 <SelectField label="Evento e produtor" value={eventId} onChange={chooseEvent}><option value="">Selecione evento</option>{data?.events.filter(e=>e.status!=="CLOSED").map(e=><option key={e.id} value={e.id}>{e.producerName} · {e.name}</option>)}</SelectField>
 <SelectField label="Tipo de cobrança" value={mode} onChange={v=>{setMode(v as typeof mode);setValue("");}}><option value="PERCENT_BPS">Percentual sobre valor do ingresso</option><option value="FIXED_PER_TICKET">Valor fixo por ingresso</option></SelectField>
 <Field label={mode==="PERCENT_BPS"?"Taxa interna (%)":"Taxa por ingresso (R$)"}><Input required value={value} onChange={e=>setValue(e.target.value)} placeholder="Informe o valor real negociado"/></Field>
 <label className="flex items-start gap-3 rounded-xl border border-[#eee9e7] p-4 text-sm"><input type="checkbox" className="mt-1" checked={producerPaysMdr} onChange={e=>setProducerPaysMdr(e.target.checked)}/><span>O MDR será descontado da parcela do produtor. Desmarcado: custo da plataforma.</span></label>
 {message&&<ErrorNotice message={message}/>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button disabled={busy||!eventId}>{busy?"Salvando...":"Salvar taxa do evento"}</Button></div></form>
 </DialogContent></Dialog>

 <Dialog open={extOpen} onOpenChange={setExtOpen}><DialogContent className="max-w-[650px]"><DialogTitle className="text-xl font-bold">Configurar Canal, Spread, Advanced e Rebate</DialogTitle><DialogDescription>Parametrize componentes independentes de receita e origem de venda (Online, POS PagSeguro ou Bilheteria) com registro na auditoria.</DialogDescription>
 <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={saveExt}>
  <SelectField label="Evento" value={extEventId} onChange={setExtEventId}><option value="">Selecione</option>{data?.events.filter(e=>e.status!=="CLOSED").map(e=><option key={e.id} value={e.id}>{e.producerName} · {e.name}</option>)}</SelectField>
  <SelectField label="Canal padrão da regra" value={channel} onChange={v=>setChannel(v as SaleChannel)}>
   <option value="ONLINE">Venda Online (Site / Checkout)</option>
   <option value="POS">Maquininha POS (PagSeguro / PagBank EDI)</option>
   <option value="BILHETERIA">Bilheteria Física</option>
  </SelectField>
  <SelectField label="Responsável pelo encargo de parcelamento" value={costBearer} onChange={v=>setCostBearer(v as CostBearer)}>
   <option value="PRODUCER">Produtor</option>
   <option value="BUYER">Cliente final (Comprador)</option>
   <option value="SOUL">SOUL (Administradora)</option>
  </SelectField>
  <Field label="Juros de parcelamento (%)"><Input required value={interestPct} onChange={e=>setInterestPct(e.target.value)} placeholder="8,00"/></Field>
  <Field label="Spread comercial (%)"><Input required value={spreadPct} onChange={e=>setSpreadPct(e.target.value)} placeholder="0,00"/></Field>
  <Field label="Advanced / Antecipação (%)"><Input required value={advancedPct} onChange={e=>setAdvancedPct(e.target.value)} placeholder="0,00"/></Field>
  <div className="sm:col-span-2"><Field label="Rebate contratado com adquirente (%)"><Input required value={rebatePct} onChange={e=>setRebatePct(e.target.value)} placeholder="0,00"/></Field></div>
  {message&&<div className="sm:col-span-2"><ErrorNotice message={message}/></div>}
  <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={()=>setExtOpen(false)}>Cancelar</Button><Button disabled={busy||!extEventId}>{busy?"Salvando...":"Salvar parâmetros"}</Button></div>
 </form></DialogContent></Dialog>
 </>;
}

