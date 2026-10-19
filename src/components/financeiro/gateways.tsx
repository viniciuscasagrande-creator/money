"use client";
import {useState,type FormEvent} from "react";
import {Plus,Settings2,Landmark,CreditCard} from "lucide-react";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {api,Empty,ErrorNotice,Field,Loading,PageHeading,useApi} from "@/components/financeiro/shared";
import {SelectField,bpsToPercent,percentToBps,nonnegativeBRLInput,type Catalog} from "@/components/financeiro/operations-shared";
import {ListSearch,searchRows} from "@/components/financeiro/list-search";
import {fmtBRL} from "@/lib/money";

type Modal="gateway"|"brand"|"mdr"|null;
export function GatewaysPage(){
 const {data,loading,error,reload}=useApi<Catalog>("/api/financeiro/catalogo");
 const [modal,setModal]=useState<Modal>(null),[query,setQuery]=useState("");
 const [gatewayName,setGatewayName]=useState(""),[brandName,setBrandName]=useState("");
 const [gatewayId,setGatewayId]=useState(""),[brandId,setBrandId]=useState("");
 const [installments,setInstallments]=useState("1"),[rate,setRate]=useState(""),[fixed,setFixed]=useState("0,00");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const shown=searchRows(data?.rules,query,r=>[r.gatewayName,r.brandName,r.installments,r.rateBps]);
 function open(next:Modal){setMessage("");setModal(next);}
 async function submit(e:FormEvent){e.preventDefault();if(!modal)return;setBusy(true);setMessage("");
  try{
   if(modal==="gateway")await api("/api/financeiro/gateways",{method:"POST",body:JSON.stringify({name:gatewayName})});
   if(modal==="brand")await api("/api/financeiro/bandeiras",{method:"POST",body:JSON.stringify({name:brandName})});
   if(modal==="mdr")await api("/api/financeiro/mdr",{method:"POST",body:JSON.stringify({gatewayId,brandId,installments:Number(installments),rateBps:percentToBps(rate),fixedCents:nonnegativeBRLInput(fixed)})});
   setGatewayName("");setBrandName("");setRate("");setFixed("0,00");setModal(null);reload();
  }catch(err){setMessage(err instanceof Error?err.message:"Não foi possível salvar.");}finally{setBusy(false);}
 }
 return <><PageHeading eyebrow="Financeiro interno · meios de pagamento" title="Gateways, Bandeiras e MDR" subtitle="Mantenha as adquirentes e custos financeiros. As alterações não modificam a memória histórica de vendas." action={<Button onClick={()=>open("mdr")}><Plus size={16}/>Nova regra MDR</Button>}/>
 {error&&<ErrorNotice message={error} retry={reload}/>} {loading?<Loading/>:<>
 <div className="mb-5 grid gap-4 sm:grid-cols-2">
  <Card className="p-5"><div className="flex items-center gap-2"><Landmark size={19} className="text-[#b75c53]"/><h2 className="font-semibold">Adquirentes</h2></div><p className="mt-3 text-xs leading-5 text-slate-500">{data?.gateways.length??0} cadastradas · {data?.gateways.map(g=>g.name).join(", ")||"Nenhuma"}</p><Button variant="outline" size="sm" className="mt-4" onClick={()=>open("gateway")}><Plus size={14}/>Cadastrar adquirente</Button></Card>
  <Card className="p-5"><div className="flex items-center gap-2"><CreditCard size={19} className="text-[#b75c53]"/><h2 className="font-semibold">Bandeiras e modalidades</h2></div><p className="mt-3 text-xs leading-5 text-slate-500">{data?.brands.length??0} cadastradas · {data?.brands.map(b=>b.name).join(", ")||"Nenhuma"}</p><Button variant="outline" size="sm" className="mt-4" onClick={()=>open("brand")}><Plus size={14}/>Cadastrar bandeira</Button></Card>
 </div>
 <ListSearch value={query} onChange={setQuery} count={shown.length} label="Buscar adquirente, bandeira ou parcelamento"/>
 <Card className="overflow-hidden"><div className="flex items-center gap-2 border-b border-[#eee9e7] p-5 font-semibold"><Settings2 size={18}/>Regras MDR configuradas</div>
 {shown.length?<div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Adquirente</th><th>Bandeira</th><th>Parcelas</th><th>MDR</th><th>Fixo/transação</th><th>Situação</th></tr></thead><tbody>{shown.map(r=><tr key={r.id}><td>{r.gatewayName}</td><td>{r.brandName}</td><td>{r.installments}x</td><td>{bpsToPercent(r.rateBps)}</td><td>{fmtBRL(r.fixedCents)}</td><td>{r.active?"Ativa":"Inativa"}</td></tr>)}</tbody></table></div>:<Empty text="Nenhuma regra corresponde à busca ou foi cadastrada."/>}</Card>
 </>}
 <Dialog open={!!modal} onOpenChange={o=>{if(!o)setModal(null);}}><DialogContent className="max-w-[650px]"><DialogTitle className="text-xl font-bold">{modal==="gateway"?"Nova adquirente":modal==="brand"?"Nova bandeira ou modalidade":"Configurar regra MDR"}</DialogTitle><DialogDescription>Cadastro exclusivo do Financeiro Interno. Registros financeiros existentes permanecem inalterados.</DialogDescription>
 <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
 {modal==="gateway"&&<div className="sm:col-span-2"><Field label="Nome da adquirente"><Input required minLength={2} value={gatewayName} onChange={e=>setGatewayName(e.target.value)} placeholder="Nome oficial"/></Field></div>}
 {modal==="brand"&&<div className="sm:col-span-2"><Field label="Bandeira/modalidade"><Input required minLength={2} value={brandName} onChange={e=>setBrandName(e.target.value)} placeholder="Identificação do meio de pagamento"/></Field></div>}
 {modal==="mdr"&&<>
  <SelectField label="Adquirente" value={gatewayId} onChange={setGatewayId}><option value="">Selecione</option>{data?.gateways.filter(g=>g.active).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</SelectField>
  <SelectField label="Bandeira" value={brandId} onChange={setBrandId}><option value="">Selecione</option>{data?.brands.filter(b=>b.active).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</SelectField>
  <Field label="Parcelas"><Input required type="number" min="1" max="48" value={installments} onChange={e=>setInstallments(e.target.value)}/></Field>
  <Field label="Taxa MDR (%)"><Input required value={rate} onChange={e=>setRate(e.target.value)} placeholder="2,50"/></Field>
  <div className="sm:col-span-2"><Field label="Custo fixo por transação (R$)"><Input required value={fixed} onChange={e=>setFixed(e.target.value)} placeholder="0,00"/></Field></div>
 </>}
 {message&&<div className="sm:col-span-2"><ErrorNotice message={message}/></div>}
 <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={()=>setModal(null)}>Cancelar</Button><Button disabled={busy||(modal==="mdr"&&(!gatewayId||!brandId))}>{busy?"Salvando...":"Salvar cadastro"}</Button></div>
 </form></DialogContent></Dialog>
 </>;
}
