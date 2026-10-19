"use client";
import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, Empty, ErrorNotice, Field, Loading, PageHeading, useApi } from "@/components/financeiro/shared";
import { FormCard, SelectField, bpsToPercent, percentToBps, nonnegativeBRLInput, type Catalog } from "@/components/financeiro/operations-shared";
import { fmtBRL } from "@/lib/money";
export function GatewaysPage() {
  const { data, loading, error, reload } = useApi<Catalog>("/api/financeiro/catalogo");
  const [gatewayName, setGatewayName] = useState(""), [brandName, setBrandName] = useState("");
  const [gatewayId, setGatewayId] = useState(""), [brandId, setBrandId] = useState("");
  const [installments, setInstallments] = useState("1"), [rate, setRate] = useState(""), [fixed, setFixed] = useState("0,00");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function submit(e: FormEvent, endpoint: string, body: unknown, clear?: () => void) {
    e.preventDefault(); setBusy(true); setMessage("");
    try { await api(endpoint, { method: "POST", body: JSON.stringify(body) }); clear?.(); reload(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao salvar cadastro."); }
    finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="Financeiro interno · meios de pagamento" title="Gateways, Bandeiras e MDR" subtitle="Cadastre adquirentes, bandeiras/modalidades e as regras de custo por parcelamento. Alterações não recalculam vendas históricas."/>
    {error && <ErrorNotice message={error} retry={reload}/>} {message && <ErrorNotice message={message}/>}
    {loading ? <Loading/> : <><div className="grid gap-4 lg:grid-cols-2">
      <FormCard title="Cadastrar gateway/adquirente"><form className="flex gap-3" onSubmit={e=>submit(e,"/api/financeiro/gateways",{ name: gatewayName },()=>setGatewayName(""))}><Input required minLength={2} placeholder="Nome do gateway" value={gatewayName} onChange={e=>setGatewayName(e.target.value)}/><Button disabled={busy}>Adicionar</Button></form><p className="mt-3 text-xs text-slate-500">Cadastrados: {data?.gateways.map(x=>x.name).join(", ") || "Nenhum"}</p></FormCard>
      <FormCard title="Cadastrar bandeira/modalidade"><form className="flex gap-3" onSubmit={e=>submit(e,"/api/financeiro/bandeiras",{ name: brandName },()=>setBrandName(""))}><Input required minLength={2} placeholder="Ex.: Visa, Mastercard ou PIX" value={brandName} onChange={e=>setBrandName(e.target.value)}/><Button disabled={busy}>Adicionar</Button></form><p className="mt-3 text-xs text-slate-500">Cadastradas: {data?.brands.map(x=>x.name).join(", ") || "Nenhuma"}</p></FormCard>
    </div>
    <div className="mt-4"><FormCard title="Regra MDR — percentual e parcela fixa"><form className="grid gap-4 md:grid-cols-3" onSubmit={e=> { e.preventDefault(); try { const rule={gatewayId,brandId,installments:Number(installments),rateBps:percentToBps(rate),fixedCents:nonnegativeBRLInput(fixed)}; void submit(e,"/api/financeiro/mdr",rule,()=>{setRate("");setFixed("0,00");}); } catch(err) {setMessage(err instanceof Error?err.message:"Valor inválido.");} }}>
      <SelectField label="Adquirente" value={gatewayId} onChange={setGatewayId}><option value="">Selecione</option>{data?.gateways.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</SelectField>
      <SelectField label="Bandeira ou modalidade" value={brandId} onChange={setBrandId}><option value="">Selecione</option>{data?.brands.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</SelectField>
      <Field label="Parcelas"><Input required type="number" min="1" max="48" value={installments} onChange={e=>setInstallments(e.target.value)}/></Field>
      <Field label="Taxa MDR (%)"><Input required placeholder="2,50" value={rate} onChange={e=>setRate(e.target.value)}/></Field>
      <Field label="Custo fixo por transação (R$)"><Input required placeholder="0,00" value={fixed} onChange={e=>setFixed(e.target.value)}/></Field>
      <div className="flex items-end"><Button disabled={busy||!gatewayId||!brandId}>Salvar regra MDR</Button></div>
    </form></FormCard></div>
    <Card className="mt-4 overflow-hidden"><div className="border-b border-slate-100 p-5 font-semibold">Regras MDR configuradas</div>{data?.rules.length ? <div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Adquirente</th><th>Bandeira</th><th>Parcelas</th><th>Taxa</th><th>Fixo/transação</th></tr></thead><tbody>{data.rules.map(r=><tr key={r.id}><td>{r.gatewayName}</td><td>{r.brandName}</td><td>{r.installments}x</td><td>{bpsToPercent(r.rateBps)}</td><td>{fmtBRL(r.fixedCents)}</td></tr>)}</tbody></table></div> : <Empty text="Cadastre uma regra para registrar vendas."/>}</Card></>}
  </>;
}
