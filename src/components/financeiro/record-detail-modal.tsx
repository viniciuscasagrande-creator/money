"use client";
import { useEffect,useState } from "react";
import { Eye,RefreshCw,ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog,DialogTitle,DialogDescription,DialogContent } from "@/components/ui/dialog";
import { api } from "@/components/financeiro/shared";
import type { RecordType } from "@/lib/financeiro/constants";

type DetailResponse={title:string;subtitle:string;fields:{label:string;value:string}[];warning?:string};
/** Nunca envia valores diretamente do cliente para autorizar acesso: consulta endpoint com escopo por sessão. */
export function RecordDetailModal({record,onClose}:{record:{type:RecordType;id:string}|null;onClose:()=>void}){
 const [data,setData]=useState<DetailResponse|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 useEffect(()=>{
  if(!record)return;
  const controller=new AbortController();setLoading(true);setData(null);setError("");
  api<DetailResponse>(`/api/registros/${record.type}/${encodeURIComponent(record.id)}`,{signal:controller.signal})
   .then(setData).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Falha na consulta.");})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[record?.id,record?.type]);
 return <Dialog open={!!record} onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-w-[680px]">
  <DialogTitle className="pr-8 text-xl font-bold tracking-tight text-[#27262b]">{data?.title??"Detalhes da operação"}</DialogTitle>
  <DialogDescription className="mt-1 text-sm text-[#8c858a]">{data?.subtitle??"Consultando registro autorizado..."}</DialogDescription>
  {loading?<div className="flex items-center gap-2 py-12 text-sm text-slate-500"><RefreshCw size={17} className="animate-spin"/>Carregando dados reais...</div>:error?
   <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>:data?<>
   <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">{data.fields.map((f,i)=><div key={`${f.label}-${i}`} className="rounded-2xl border border-[#ece9e8] bg-[#faf9f8] px-4 py-3"><dt className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#958e92]">{f.label}</dt><dd className="break-words text-sm font-semibold text-[#343136]">{f.value||"—"}</dd></div>)}</dl>
   {data.warning&&<p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{data.warning}</p>}
   <p className="mt-4 flex items-center gap-2 text-xs text-[#8c858a]"><ShieldCheck size={15}/> Informações consultadas no backend conforme seu perfil e vínculo.</p>
  </>:null}
  <div className="mt-5 flex justify-end"><Button variant="outline" onClick={onClose}>Fechar</Button></div>
 </DialogContent></Dialog>;
}
export function DetailsButton({onClick}:{onClick:()=>void}){return <Button type="button" size="sm" variant="outline" onClick={onClick}><Eye size={14}/> Detalhes</Button>;}
