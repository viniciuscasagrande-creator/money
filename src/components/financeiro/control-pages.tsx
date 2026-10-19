"use client";
import {useState, type FormEvent} from "react";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {api,Empty,ErrorNotice,Field,Loading,PageHeading,useApi,displayDate} from "@/components/financeiro/shared";
import {FormCard,SelectField,inputClass} from "@/components/financeiro/operations-shared";
import {fmtBRL,parseBRLToCents} from "@/lib/money";

type Catalog={accounts:{id:string;name:string;institution:string}[];events:{id:string;name:string;producerId:string}[];
  producers:{id:string;name:string}[];sales:{id:string;eventId:string;externalReference:string;producerNetCents:string}[]};
function useCatalog(){return useApi<Catalog>("/api/controle/catalogo");}
function PanelMessage({text}:{text:string}){return text?<ErrorNotice message={text}/>:null;}
function Submit({busy,children}:{busy:boolean;children:React.ReactNode}){return <Button disabled={busy}>{busy?"Salvando...":children}</Button>;}
function Table({heads,children}:{heads:string[];children:React.ReactNode}){return <Card className="overflow-x-auto"><table className="dashboard-table"><thead><tr>{heads.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></Card>;}

type Statement={id:string;bankAccountId:string;accountName:string;externalId:string;postedAt:string;description:string;amountCents:string;
  direction:"CREDIT"|"DEBIT";status:"PENDING"|"MATCHED";ledgerEntryId:string|null};
type Ledger={id:string;bankAccountId:string;description:string;amountCents:string;direction:"CREDIT"|"DEBIT";createdAt:string};
export function ReconciliationPage(){
 const {data:c,error:ce,loading:cl}=useCatalog();const {data,error,loading,reload}=useApi<{statements:Statement[];ledger:Ledger[]}>("/api/controle/extratos");
 const [account,setAccount]=useState(""),[reference,setReference]=useState(""),[date,setDate]=useState(""),[description,setDescription]=useState(""),
  [direction,setDirection]=useState<"CREDIT"|"DEBIT">("CREDIT"),[amount,setAmount]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [matches,setMatches]=useState<Record<string,string>>({});
 async function create(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{
  await api("/api/controle/extratos",{method:"POST",body:JSON.stringify({bankAccountId:account,externalId:reference,date,description,direction,amountCents:parseBRLToCents(amount)})});
  setReference("");setDescription("");setAmount("");reload();
 }catch(err){setMessage(err instanceof Error?err.message:"Não foi possível cadastrar a linha.");}finally{setBusy(false);}}
 async function match(statementId:string){const ledgerEntryId=matches[statementId];if(!ledgerEntryId)return;setBusy(true);setMessage("");try{
  await api("/api/controle/conciliar",{method:"POST",body:JSON.stringify({statementId,ledgerEntryId})});reload();
 }catch(err){setMessage(err instanceof Error?err.message:"Não foi possível conciliar.");}finally{setBusy(false);}}
 return <><PageHeading eyebrow="Pacote 03 · Tesouraria" title="Conciliação bancária" subtitle="Importe lançamentos de extrato e confira manualmente contra o razão. Nenhuma importação ou conciliação altera o saldo bancário."/>
 <PanelMessage text={message}/>{ce&&<ErrorNotice message={ce}/>} {error&&<ErrorNotice message={error} retry={reload}/>}
 {(cl||loading)?<Loading/>:<><div className="mb-5 grid gap-5 lg:grid-cols-2">
 <FormCard title="Registrar linha de extrato"><form className="space-y-3" onSubmit={create}>
 <SelectField label="Conta bancária" value={account} onChange={setAccount}><option value="">Selecione</option>{c?.accounts.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</SelectField>
 <Field label="Referência única do extrato"><Input required value={reference} minLength={4} maxLength={100} onChange={e=>setReference(e.target.value)}/></Field>
 <Field label="Data do lançamento"><Input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field>
 <Field label="Descrição"><Input required minLength={3} value={description} onChange={e=>setDescription(e.target.value)}/></Field>
 <SelectField label="Sentido" value={direction} onChange={v=>setDirection(v as typeof direction)}><option value="CREDIT">Entrada</option><option value="DEBIT">Saída</option></SelectField>
 <Field label="Valor (R$)"><Input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></Field>
 <Submit busy={busy}>Registrar para conferência</Submit></form></FormCard>
 <Card className="p-5"><h2 className="font-semibold">Critérios de correspondência</h2><p className="mt-3 text-sm text-slate-600">É necessário que conta bancária, direção e valor coincidam. Cada linha de extrato e cada lançamento do razão só podem ser utilizados uma vez.</p>
 <p className="mt-4 text-sm text-amber-800">A conciliação não confirma que a operação tenha sido autorizada ou executada por integração bancária. Dados importados aqui precisam ser confrontados com a origem oficial.</p></Card></div>
 {data?.statements.length?<Table heads={["Extrato","Valor","Status","Vincular ao razão"]}>{data.statements.map(s=>{
  const options=data.ledger.filter(x=>x.bankAccountId===s.bankAccountId&&x.direction===s.direction&&x.amountCents===s.amountCents);
  return <tr key={s.id}><td><strong>{s.accountName}</strong><p className="text-xs text-slate-500">{s.externalId} · {displayDate(s.postedAt)} · {s.description}</p></td>
  <td>{s.direction==="CREDIT"?"Entrada":"Saída"} · {fmtBRL(s.amountCents)}</td><td>{s.status==="MATCHED"?"Conciliado":"Pendente"}</td>
  <td>{s.status==="MATCHED"?"Vínculo registrado":<div className="flex flex-wrap items-center gap-2"><select className={inputClass} aria-label="Lançamento contábil" value={matches[s.id]??""} onChange={e=>setMatches(v=>({...v,[s.id]:e.target.value}))}><option value="">Escolha o lançamento</option>{options.map(x=><option key={x.id} value={x.id}>{x.description.slice(0,60)} · {x.id.slice(-6)}</option>)}</select><Button variant="outline" size="sm" disabled={!matches[s.id]||busy} onClick={()=>match(s.id)}>Conciliar</Button></div>}</td></tr>;
 })}</Table>:<Empty text="Não existem linhas de extrato importadas."/>}</>}
 </>;
}

type Risk={id:string;externalId:string;saleReference:string;eventName:string;type:"REFUND"|"CHARGEBACK";
 status:"OPEN"|"CONFIRMED"|"REJECTED";reason:string;exposureCents:string;createdAt:string};
export function RiskPage(){
 const {data:c,error:ce}=useCatalog();const {data,error,loading,reload}=useApi<{items:Risk[]}>("/api/controle/riscos");
 const [sale,setSale]=useState(""),[reference,setReference]=useState(""),[type,setType]=useState<"REFUND"|"CHARGEBACK">("REFUND"),
 [amount,setAmount]=useState(""),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function create(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{
 await api("/api/controle/riscos",{method:"POST",body:JSON.stringify({saleId:sale,externalId:reference,type,exposureCents:parseBRLToCents(amount),reason})});
 setReference("");setReason("");setAmount("");reload();}catch(err){setMessage(err instanceof Error?err.message:"Falha no registro.");}finally{setBusy(false);}}
 async function decide(id:string,decision:"CONFIRMED"|"REJECTED"){
 if(!window.confirm(decision==="CONFIRMED"?"Confirmar perda contabilizada no direito do produtor, sem transferência bancária?":"Rejeitar ocorrência e liberar a reserva?"))return;
 setBusy(true);setMessage("");try{await api("/api/controle/risco-decisao",{method:"POST",body:JSON.stringify({id,decision})});reload();}
 catch(err){setMessage(err instanceof Error?err.message:"Falha na decisão.");}finally{setBusy(false);}}
 return <><PageHeading eyebrow="Pacote 03 · Controle" title="Estornos e chargebacks" subtitle="Registre exposições de risco por venda, bloqueie a capacidade de repasse e confirme ou libere a retenção. Sem execução de reembolso real."/>
 <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">O valor informado é a parcela do direito do produtor exposta ao risco, não necessariamente o reembolso bruto ao consumidor. Para casos já repassados ou que excedam o saldo livre, é necessária análise manual separada.</div>
 <PanelMessage text={message}/>{ce&&<ErrorNotice message={ce}/>} {error&&<ErrorNotice message={error} retry={reload}/>}
 <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1fr]"><FormCard title="Nova ocorrência"><form className="space-y-3" onSubmit={create}>
 <SelectField label="Venda de origem" value={sale} onChange={setSale}><option value="">Selecione</option>{c?.sales.map(x=><option value={x.id} key={x.id}>{x.externalReference} · {fmtBRL(x.producerNetCents)}</option>)}</SelectField>
 <Field label="Protocolo externo único"><Input required minLength={4} value={reference} onChange={e=>setReference(e.target.value)}/></Field>
 <SelectField label="Tipo" value={type} onChange={v=>setType(v as typeof type)}><option value="REFUND">Estorno</option><option value="CHARGEBACK">Chargeback</option></SelectField>
 <Field label="Exposição do produtor (R$)"><Input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></Field>
 <Field label="Justificativa"><Input required minLength={8} value={reason} onChange={e=>setReason(e.target.value)}/></Field>
 <Submit busy={busy}>Abrir ocorrência</Submit></form></FormCard>
 <Card className="p-5"><h2 className="font-semibold">Efeito sobre saldos</h2><p className="mt-3 text-sm text-slate-600">Abertura: reserva o valor, diminuindo os limites de repasse e antecipação. Confirmação: registra a perda do direito. Rejeição: libera a reserva.</p>
 <p className="mt-3 text-sm text-slate-600">Nenhuma etapa executa PIX, devolução na adquirente, movimentação em conta ou compensação fiscal automática.</p></Card></div>
 {loading?<Loading/>:data?.items.length?<Table heads={["Ocorrência","Evento / venda","Impacto","Situação","Decisão"]}>{data.items.map(x=><tr key={x.id}>
 <td><strong>{x.externalId}</strong><p className="text-xs text-slate-500">{x.type==="REFUND"?"Estorno":"Chargeback"} · {x.reason}</p></td>
 <td>{x.eventName}<p className="text-xs text-slate-500">{x.saleReference}</p></td><td>{fmtBRL(x.exposureCents)}</td>
 <td>{x.status==="OPEN"?"Em análise":x.status==="CONFIRMED"?"Perda confirmada":"Rejeitado"}</td><td>{x.status==="OPEN"&&<div className="flex gap-2"><Button size="sm" disabled={busy} onClick={()=>decide(x.id,"CONFIRMED")}>Confirmar</Button><Button size="sm" disabled={busy} variant="outline" onClick={()=>decide(x.id,"REJECTED")}>Rejeitar</Button></div>}</td>
 </tr>)}</Table>:<Empty text="Nenhuma ocorrência cadastrada."/>}
 </>;
}

type Budget={id:string;eventId:string;eventName:string;kind:"REVENUE"|"EXPENSE";category:string;description:string;amountCents:string};
export function BudgetPage(){
 const {data:c,error:ce}=useCatalog();const {data,error,loading,reload}=useApi<{items:Budget[];truncated:boolean;summaries:{eventId:string;eventName:string;revenue:string;expense:string;result:string}[]}>("/api/controle/orcamentos");
 const [event,setEvent]=useState(""),[kind,setKind]=useState<"REVENUE"|"EXPENSE">("REVENUE"),[category,setCategory]=useState(""),
 [description,setDescription]=useState(""),[amount,setAmount]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{await api("/api/controle/orcamentos",{method:"POST",
 body:JSON.stringify({eventId:event,kind,category,description,amountCents:parseBRLToCents(amount)})});setDescription("");setAmount("");reload();}
 catch(err){setMessage(err instanceof Error?err.message:"Falha ao salvar.");}finally{setBusy(false);}}
 return <><PageHeading eyebrow="Pacote 03 · Planejamento" title="Orçamento financeiro por evento" subtitle="Projete receitas e despesas futuras por centro de interesse, sem lançar valores no caixa. A visão abaixo é exclusivamente orçada."/>
 <PanelMessage text={message}/>{ce&&<ErrorNotice message={ce}/>} {error&&<ErrorNotice message={error} retry={reload}/>}
 <FormCard title="Nova previsão"><form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
 <SelectField label="Evento" value={event} onChange={setEvent}><option value="">Selecione</option>{c?.events.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</SelectField>
 <SelectField label="Tipo" value={kind} onChange={v=>setKind(v as typeof kind)}><option value="REVENUE">Receita prevista</option><option value="EXPENSE">Despesa prevista</option></SelectField>
 <Field label="Categoria"><Input required value={category} onChange={e=>setCategory(e.target.value)}/></Field>
 <Field label="Descrição"><Input required value={description} onChange={e=>setDescription(e.target.value)}/></Field>
 <Field label="Valor (R$)"><Input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></Field>
 <div className="flex items-end"><Submit busy={busy}>Incluir previsão</Submit></div></form></FormCard>
 <div className="my-5 grid gap-3 md:grid-cols-3">{data?.summaries.map(x=><Card className="p-4" key={x.eventId}><p className="font-semibold">{x.eventName}</p><p className="mt-2 text-xs text-slate-500">Receitas previstas {fmtBRL(x.revenue)}</p><p className="text-xs text-slate-500">Despesas previstas {fmtBRL(x.expense)}</p><p className="mt-1 font-semibold">Saldo planejado {fmtBRL(x.result)}</p></Card>)}</div>
 {data?.truncated&&<p className="mb-3 text-sm text-amber-700">Exibindo somente 200 lançamentos; totais incompletos. Aplique filtros em evolução posterior.</p>}
 {loading?<Loading/>:data?.items.length?<Table heads={["Evento","Categoria","Descrição","Tipo","Valor previsto"]}>{data.items.map(x=><tr key={x.id}><td>{x.eventName}</td><td>{x.category}</td><td>{x.description}</td><td>{x.kind==="REVENUE"?"Receita":"Despesa"}</td><td>{fmtBRL(x.amountCents)}</td></tr>)}</Table>:<Empty text="Nenhum orçamento registrado."/>}
 </>;
}

type Contract={id:string;title:string;counterparty:string;eventName:string;status:"DRAFT"|"ACTIVE"|"EXPIRED";startDate:string;endDate:string|null;terms:string};
export function ContractsPage(){
 const {data:c,error:ce}=useCatalog();const {data,error,loading,reload}=useApi<{items:Contract[]}>("/api/controle/contratos");
 const [title,setTitle]=useState(""),[counterparty,setCounterparty]=useState(""),[event,setEvent]=useState(""),[status,setStatus]=useState<Contract["status"]>("DRAFT"),
 [start,setStart]=useState(""),[end,setEnd]=useState(""),[terms,setTerms]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{await api("/api/controle/contratos",{method:"POST",
 body:JSON.stringify({title,counterparty,eventId:event||null,status,startDate:start,endDate:end||null,terms})});setTitle("");setCounterparty("");setTerms("");reload();}
 catch(err){setMessage(err instanceof Error?err.message:"Falha no contrato.");}finally{setBusy(false);}}
 return <><PageHeading eyebrow="Pacote 03 · Documentação" title="Contratos financeiros" subtitle="Cadastre condições, partes e vigência. Os registros são documentais e não substituem a assinatura eletrônica nem alteram MDR ou taxas automaticamente."/>
 <PanelMessage text={message}/>{ce&&<ErrorNotice message={ce}/>} {error&&<ErrorNotice message={error} retry={reload}/>}
 <FormCard title="Cadastrar contrato"><form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
 <Field label="Título"><Input required value={title} onChange={e=>setTitle(e.target.value)}/></Field>
 <Field label="Contraparte"><Input required value={counterparty} onChange={e=>setCounterparty(e.target.value)}/></Field>
 <SelectField label="Evento (opcional)" required={false} value={event} onChange={setEvent}><option value="">Sem vínculo</option>{c?.events.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</SelectField>
 <SelectField label="Status" value={status} onChange={v=>setStatus(v as typeof status)}><option value="DRAFT">Rascunho</option><option value="ACTIVE">Ativo</option><option value="EXPIRED">Encerrado</option></SelectField>
 <Field label="Início"><Input required type="date" value={start} onChange={e=>setStart(e.target.value)}/></Field>
 <Field label="Fim (opcional)"><Input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></Field>
 <div className="md:col-span-3"><Field label="Condições e observações"><textarea required minLength={6} maxLength={3000} className={inputClass+" min-h-20"} value={terms} onChange={e=>setTerms(e.target.value)}/></Field></div>
 <div><Submit busy={busy}>Cadastrar contrato</Submit></div></form></FormCard>
 <div className="mt-5">{loading?<Loading/>:data?.items.length?<Table heads={["Contrato","Contraparte","Evento","Vigência","Situação"]}>{data.items.map(x=><tr key={x.id}>
 <td><strong>{x.title}</strong><p className="text-xs text-slate-500">{x.terms.slice(0,100)}</p></td><td>{x.counterparty}</td><td>{x.eventName}</td>
 <td>{displayDate(x.startDate)} — {displayDate(x.endDate)}</td><td>{x.status==="DRAFT"?"Rascunho":x.status==="ACTIVE"?"Ativo":"Encerrado"}</td></tr>)}</Table>:<Empty text="Nenhum contrato cadastrado."/>}</div>
 </>;
}

type Journal={id:string;date:string;bank:string;origin:string;description:string;amountCents:string;debit:string;credit:string};
export function AccountingPage(){
 const [start,setStart]=useState(""),[end,setEnd]=useState(""),[rows,setRows]=useState<Journal[]>([]),[count,setCount]=useState<number|null>(null),
 [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function run(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const response=await api<{rows:Journal[];count:number}>(`/api/controle/contabilidade?inicio=${start}&fim=${end}`);
 setRows(response.rows);setCount(response.count);}catch(err){setMessage(err instanceof Error?err.message:"Não foi possível consultar.");}finally{setBusy(false);}}
 function exportCsv(){window.location.href=`/api/controle/contabilidade?inicio=${start}&fim=${end}&formato=csv`;}
 return <><PageHeading eyebrow="Pacote 03 · Contabilidade" title="Pré-exportação contábil" subtitle="Consulta de partidas sugeridas a partir do razão bancário, com exportação CSV para conferência de contador. Não transmite dados nem fecha livros fiscais."/>
 <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Classificações contábeis provisórias devem ser revisadas, principalmente receitas próprias, obrigações com produtores, retenções e tributos. A exportação não equivale a DRE ou balanço homologado.</div>
 <PanelMessage text={message}/><FormCard title="Período da consulta (máximo 93 dias)"><form onSubmit={run} className="flex flex-wrap items-end gap-3">
 <Field label="De"><Input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></Field><Field label="Até"><Input type="date" required value={end} onChange={e=>setEnd(e.target.value)}/></Field>
 <Submit busy={busy}>Consultar razão</Submit>{count!==null&&<Button type="button" variant="outline" onClick={exportCsv}>Exportar CSV</Button>}
 </form></FormCard>
 {count!==null&&<div className="mt-5"><p className="mb-3 text-sm text-slate-500">{count} movimentações · lançamentos sugeridos (débito = crédito em cada movimento)</p>
 {rows.length?<Table heads={["Data","Conta bancária","Histórico","Conta débito sugerida","Conta crédito sugerida","Valor"]}>{rows.map(x=><tr key={x.id}>
 <td>{displayDate(x.date)}</td><td>{x.bank}</td><td>{x.description}</td><td>{x.debit}</td><td>{x.credit}</td><td>{fmtBRL(x.amountCents)}</td></tr>)}</Table>:<Empty text="Nenhum lançamento encontrado neste período."/>}</div>}
 </>;
}
