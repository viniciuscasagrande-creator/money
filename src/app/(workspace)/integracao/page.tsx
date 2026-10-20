"use client";
import {useState,type FormEvent} from "react";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {PageHeading,Field,useApi,ErrorNotice} from "@/components/financeiro/shared";
import {parseBRLToCents} from "@/lib/money";
export default function IntegracaoIngressosPage(){
 const status=useApi<{configured:boolean;maskedKey:string|null;stats:{producersCount:number;eventsCount:number;receivablesCount:number}}>("/api/integracao/ingressos");
 const [reference,setReference]=useState(""),[producer,setProducer]=useState(""),[document,setDocument]=useState(""),[event,setEvent]=useState(""),[description,setDescription]=useState(""),[amount,setAmount]=useState(""),[due,setDue]=useState("");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function send(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{
  const response=await fetch("/api/integracao/ingressos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({externalReference:reference,producerName:producer,producerDocument:document||null,eventName:event,description,amountCents:parseBRLToCents(amount),dueDate:due||null})});
  const result=await response.json();if(!response.ok)throw new Error(result.error);
  setMessage(result.duplicate?"Entrega já importada. Nenhum novo recebível criado.":"Recebível importado com sucesso.");status.reload();
 }catch(error){setMessage(error instanceof Error?error.message:"Falha na importação.");}finally{setBusy(false);}}
 return <><PageHeading eyebrow="Integração de ingressos" title="Integração de recebíveis" subtitle="Importe títulos de ingressos usando uma referência única do provedor. Reenvios com a mesma referência preservam o título original."/>
 {status.error&&<ErrorNotice message={status.error} retry={status.reload}/>}
 <Card className="mb-4 p-5"><p>Webhook: {status.data?.configured?"configurado":"aguardando configuração"}</p><p>Identificação da chave: {status.data?.maskedKey??"—"}</p><p>Recebíveis cadastrados: {status.data?.stats.receivablesCount??0}</p><p className="mt-3 text-sm text-slate-600">Esta importação cria contas a receber. Para registrar vendas com taxas e divisão entre produtor e SOUL, utilize o módulo Vendas.</p></Card>
 <Card className="p-5"><form onSubmit={send} className="grid gap-4 md:grid-cols-2">
 <Field label="Referência única do pedido"><Input required minLength={3} value={reference} onChange={e=>setReference(e.target.value)}/></Field>
 <Field label="Produtor"><Input required minLength={2} value={producer} onChange={e=>setProducer(e.target.value)}/></Field>
 <Field label="Documento do produtor"><Input value={document} onChange={e=>setDocument(e.target.value)}/></Field>
 <Field label="Evento"><Input required minLength={2} value={event} onChange={e=>setEvent(e.target.value)}/></Field>
 <Field label="Descrição"><Input required minLength={3} value={description} onChange={e=>setDescription(e.target.value)}/></Field>
 <Field label="Valor R$"><Input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="150,00"/></Field>
 <Field label="Vencimento"><Input type="date" value={due} onChange={e=>setDue(e.target.value)}/></Field>
 <div><Button disabled={busy} type="submit">{busy?"Importando…":"Importar recebível"}</Button></div>
 </form>{message&&<p className="mt-4" role="status">{message}</p>}</Card></>;
}
