"use client";
import {useState,type FormEvent} from "react";
import {Plus,Pencil,Calculator,Sliders,Percent,DollarSign} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {api,Empty,ErrorNotice,Field,Loading,PageHeading,useApi} from "@/components/financeiro/shared";
import {SelectField,percentToBps,bpsToPercent,nonnegativeBRLInput,type Catalog,type FeeItem} from "@/components/financeiro/operations-shared";
import {ListSearch,searchRows} from "@/components/financeiro/list-search";
import {fmtBRL} from "@/lib/money";
import {percentageCents,simulateInstallmentMatrix,type CostBearer,type SaleChannel} from "@/lib/split-calculation";

type UIFeeType = "PERCENT_ONLY" | "FIXED_ONLY" | "PERCENT_PLUS_FIXED";

function formatFeeRuleLabel(f: FeeItem): string {
  if (f.mode === "FIXED_PER_TICKET") {
    return `${fmtBRL(f.value)} / ingresso (Valor Fixo)`;
  }
  const pctStr = bpsToPercent(Number(f.value));
  const extra = BigInt(f.extraFixedCents || "0");
  if (extra > 0n) {
    return `${pctStr} + ${fmtBRL(extra.toString())} / ingresso (% + Fixo)`;
  }
  return `${pctStr} sobre o ingresso (Percentual %)`;
}

export function FeesPage(){
 const {data,loading,error,reload}=useApi<Catalog>("/api/financeiro/catalogo");
 const [open,setOpen]=useState(false),[extOpen,setExtOpen]=useState(false),[query,setQuery]=useState("");
 const [eventId,setEventId]=useState("");
 const [uiFeeType,setUiFeeType]=useState<UIFeeType>("PERCENT_ONLY");
 const [pctValue,setPctValue]=useState("10,00");
 const [fixedValue,setFixedValue]=useState("0,00");
 const [producerPaysMdr,setProducerPaysMdr]=useState(true),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);

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

 function chooseEvent(id:string){
  setEventId(id);
  const policy=data?.fees.find(x=>x.eventId===id);
  if(policy){
   setProducerPaysMdr(policy.producerPaysMdr);
   if(policy.mode==="FIXED_PER_TICKET"){
    setUiFeeType("FIXED_ONLY");
    setFixedValue(fmtBRL(policy.value).replace("R$ ","").trim());
    setPctValue("0,00");
   } else {
    const extra=BigInt(policy.extraFixedCents||"0");
    setPctValue(bpsToPercent(Number(policy.value)).replace("%",""));
    if(extra>0n){
     setUiFeeType("PERCENT_PLUS_FIXED");
     setFixedValue(fmtBRL(extra.toString()).replace("R$ ","").trim());
    } else {
     setUiFeeType("PERCENT_ONLY");
     setFixedValue("0,00");
    }
   }
  } else {
   setUiFeeType("PERCENT_ONLY");
   setPctValue("10,00");
   setFixedValue("0,00");
   setProducerPaysMdr(true);
  }
 }

 async function save(e:FormEvent){
  e.preventDefault();
  setBusy(true);
  setMessage("");
  try{
   const apiMode: "PERCENT_BPS" | "FIXED_PER_TICKET" = uiFeeType === "FIXED_ONLY" ? "FIXED_PER_TICKET" : "PERCENT_BPS";
   const apiValue = uiFeeType === "FIXED_ONLY"
    ? nonnegativeBRLInput(fixedValue)
    : String(percentToBps(pctValue));
   const apiExtraFixed = uiFeeType === "PERCENT_PLUS_FIXED"
    ? nonnegativeBRLInput(fixedValue || "0,00")
    : "0";
   await api("/api/financeiro/taxas",{
    method:"POST",
    body:JSON.stringify({eventId,mode:apiMode,value:apiValue,extraFixedCents:apiExtraFixed,producerPaysMdr})
   });
   setOpen(false);
   reload();
  }catch(e){
   setMessage(e instanceof Error?e.message:"Não foi possível salvar.");
  }finally{
   setBusy(false);
  }
 }

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

 // Prévia em tempo real no modal (ingresso de referência R$ 100,00 = 10000 centavos)
 let previewFeeCents = 0n;
 try {
  const sampleTicket = 10000n;
  if (uiFeeType === "FIXED_ONLY") {
   previewFeeCents = BigInt(nonnegativeBRLInput(fixedValue || "0,00"));
  } else if (uiFeeType === "PERCENT_ONLY") {
   previewFeeCents = percentageCents(sampleTicket, percentToBps(pctValue || "0,00"));
  } else {
   previewFeeCents = percentageCents(sampleTicket, percentToBps(pctValue || "0,00")) + BigInt(nonnegativeBRLInput(fixedValue || "0,00"));
  }
 } catch { previewFeeCents = 0n; }

 const allFees = data?.fees || [];
 const allEvents = data?.events || [];
 const allRules = data?.rules || [];
 const pctFees = allFees.filter(f => f.mode === "PERCENT_BPS");
 const avgFeeBps = pctFees.length ? Math.round(pctFees.reduce((s, f) => s + Number(f.value || 0), 0) / pctFees.length) : 0;
 const producerPaysMdrCount = allFees.filter(f => f.producerPaysMdr).length;

 return <><PageHeading eyebrow="Financeiro interno · configuração confidencial" title="Motor de Receitas, Taxas (% e R$), Spread, Advanced e Rebate" subtitle="A taxa administrativa SOUL é negociada por evento em Percentual (%), Valor Fixo (R$) ou Híbrida (% + R$) e permanece oculta do Produtor no backend. Configure também canal (Online / Maquininha PagSeguro / Bilheteria), responsável pelo encargo e simulador de parcelamento 1x a 12x." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setMessage("");setExtOpen(true);}}><Sliders size={16}/>Spread, Advanced e Rebate</Button><Button onClick={()=>{setMessage("");setOpen(true);}}><Plus size={16}/>Configurar taxa por evento (% ou R$)</Button></div>}/>
 <div className="mb-5 grid gap-4 md:grid-cols-4">
  <Card className="p-4">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Eventos com Taxa Configurada</p>
   <p className="mt-2 font-mono text-xl font-semibold text-slate-900">{allFees.length} / {allEvents.length}</p>
   <p className="mt-1 text-xs text-slate-500">Políticas comerciais ativas</p>
  </Card>
  <Card className="p-4">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Taxa Percentual Média</p>
   <p className="mt-2 font-mono text-xl font-semibold text-[#b75c53]">{bpsToPercent(avgFeeBps)}</p>
   <p className="mt-1 text-xs text-slate-500">{pctFees.length} evento(s) em percentual (%)</p>
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
 <Card className="overflow-hidden"><div className="border-b border-[#eee9e7] p-5 font-semibold">Regras comerciais internas (Taxa Administrativa SOUL em % / R$ e Absorção de MDR)</div>
 {shown.length?<div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Produtor</th><th>Evento</th><th>Modalidade</th><th>Taxa interna SOUL</th><th>Quem absorve MDR</th><th>Visibilidade Produtor</th><th>Ação</th></tr></thead><tbody>{shown.map(f=>{
  const isHybrid = f.mode==="PERCENT_BPS" && BigInt(f.extraFixedCents||"0")>0n;
  return <tr key={f.id}><td>{f.producerName}</td><td className="font-semibold">{f.eventName}</td><td><Badge tone={f.mode==="PERCENT_BPS"?"blue":"neutral"}>{isHybrid?"Percentual (%) + Fixo (R$)":f.mode==="PERCENT_BPS"?"Percentual (%)":"Valor Fixo (R$)"}</Badge></td><td className="font-mono font-semibold">{formatFeeRuleLabel(f)}</td><td>{f.producerPaysMdr?"Produtor":"SOUL (Administradora)"}</td><td><Badge tone="amber">Confidencial no Backend</Badge></td><td><Button size="sm" variant="outline" onClick={()=>{chooseEvent(f.eventId);setOpen(true);}}><Pencil size={14}/>Editar</Button></td></tr>;
 })}</tbody></table></div>:<Empty text="Nenhuma regra corresponde à busca ou foi cadastrada."/>}</Card>

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
    <p><strong>2. Taxa Administrativa SOUL (% e R$):</strong> Negociável por evento em Percentual (%), Valor Fixo por ingresso (R$) ou composta (% + R$), permanecendo visível ao Financeiro SOUL e oculta nas APIs do Produtor.</p>
    <p><strong>3. Spread, Advanced e Rebate:</strong> Parametrizáveis por evento e canal (Online, Maquininha PagSeguro EDI ou Bilheteria), preservando a memória de cálculo imutável por transação.</p>
   </div>
  </Card>
 </div>
 </>}

 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-[600px]"><DialogTitle className="text-xl font-bold">Configurar taxa por evento (% e Valor Fixo R$)</DialogTitle><DialogDescription>Escolha se a taxa do evento será cobrada em Percentual (%), Valor Fixo por ingresso (R$) ou ambos (% + R$). Alterações valem para novas vendas.</DialogDescription>
 <form className="mt-5 space-y-4" onSubmit={save}>
 <SelectField label="Evento e produtor" value={eventId} onChange={chooseEvent}><option value="">Selecione evento</option>{data?.events.filter(e=>e.status!=="CLOSED").map(e=><option key={e.id} value={e.id}>{e.producerName} · {e.name}</option>)}</SelectField>

 <div>
  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Modalidade de cobrança da taxa</span>
  <div className="grid grid-cols-3 gap-2">
   <button
    type="button"
    onClick={()=>setUiFeeType("PERCENT_ONLY")}
    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${uiFeeType==="PERCENT_ONLY"?"border-slate-900 bg-slate-900 text-white":"border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
   >
    <Percent size={14}/>
    Percentual (%)
   </button>
   <button
    type="button"
    onClick={()=>setUiFeeType("FIXED_ONLY")}
    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${uiFeeType==="FIXED_ONLY"?"border-slate-900 bg-slate-900 text-white":"border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
   >
    <DollarSign size={14}/>
    Valor Fixo (R$)
   </button>
   <button
    type="button"
    onClick={()=>setUiFeeType("PERCENT_PLUS_FIXED")}
    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${uiFeeType==="PERCENT_PLUS_FIXED"?"border-slate-900 bg-slate-900 text-white":"border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
   >
    <Percent size={13}/>+<DollarSign size={13}/>
    % + Valor Fixo
   </button>
  </div>
 </div>

 {(uiFeeType==="PERCENT_ONLY" || uiFeeType==="PERCENT_PLUS_FIXED") && (
  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
   <Field label="Taxa Percentual sobre o valor do ingresso (%)">
    <Input required value={pctValue} onChange={e=>setPctValue(e.target.value)} placeholder="Ex.: 10,00"/>
   </Field>
   <div className="flex flex-wrap items-center gap-1.5 pt-1">
    <span className="text-[11px] font-medium text-slate-500">Atalhos rápidos (%):</span>
    {["5,00","8,00","10,00","12,00","15,00"].map(preset=>(
     <button
      key={preset}
      type="button"
      onClick={()=>setPctValue(preset)}
      className={`rounded-lg border px-2 py-0.5 text-xs font-semibold transition ${pctValue===preset?"border-[#b75c53] bg-[#b75c53] text-white":"border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
     >
      {preset}%
     </button>
    ))}
   </div>
  </div>
 )}

 {(uiFeeType==="FIXED_ONLY" || uiFeeType==="PERCENT_PLUS_FIXED") && (
  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
   <Field label="Valor Fixo por ingresso vendido (R$)">
    <Input required value={fixedValue} onChange={e=>setFixedValue(e.target.value)} placeholder="Ex.: 5,00"/>
   </Field>
  </div>
 )}

 <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950">
  <span className="font-semibold">Simulação em ingresso de R$ 100,00:</span>{" "}
  Taxa SOUL = <strong>{fmtBRL(previewFeeCents.toString())}</strong> · Repasse base ao produtor (antes de MDR) = <strong>{fmtBRL((10000n > previewFeeCents ? 10000n - previewFeeCents : 0n).toString())}</strong>
 </div>

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
