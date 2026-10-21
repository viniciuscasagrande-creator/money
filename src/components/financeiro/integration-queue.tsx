"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useApi,ErrorNotice } from "@/components/financeiro/shared";
type Job={id:string;externalReference:string;status:string;attempts:number;totalAttempts:number;nextAttemptAt:string;lastErrorCode:string|null};
const labels:Record<string,string>={PENDING:"Aguardando",PROCESSING:"Processando",RETRY:"Nova tentativa agendada",SUCCEEDED:"Concluído",DEAD:"Falha encerrada"};
const errors:Record<string,string>={BUSINESS_RULE:"Revise produtor, evento e referência externa.",ACTOR_INACTIVE:"Operador original inativo ou sem permissão.",INVALID_PAYLOAD:"Conteúdo armazenado inválido.",TEMPORARY_FAILURE:"Falha temporária de processamento.",ATTEMPTS_EXHAUSTED:"Tentativas esgotadas após interrupção."};
export function IntegrationQueue(){
  const [page,setPage]=useState(1),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[selected,setSelected]=useState<string|null>(null),[reason,setReason]=useState("");
  const queue=useApi<{items:Job[];total:number;pageSize:number}>(`/api/integracao/fila?page=${page}`);
  async function act(body:unknown){setBusy(true);setMessage("");try{
    const response=await fetch("/api/integracao/fila",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha na fila.");
    setMessage(data.results?(data.results.length?"Processamento executado. Confira o estado atualizado.":"Nenhum item disponível para processamento."):"Reprocessamento registrado.");setSelected(null);setReason("");queue.reload();
  }catch(e){setMessage(e instanceof Error?e.message:"Falha na fila.");}finally{setBusy(false);}}
  return <Card className="mt-5 space-y-4 p-5"><h2 className="text-lg font-semibold">Fila de integrações</h2>
    <p className="text-sm text-slate-600">Acompanhe importações assíncronas. Falhas encerradas exigem correção da causa e reabertura por Administrador.</p>
    <div className="flex flex-wrap gap-2"><Button disabled={busy} type="button" onClick={()=>void act({action:"PROCESS"})}>Processar próximo item</Button><Button type="button" variant="outline" disabled={busy} onClick={queue.reload}>Atualizar</Button></div>
    {queue.error&&<ErrorNotice message={queue.error} retry={queue.reload}/>}
    {message&&<p role="status" className="text-sm">{message}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Referência</th><th className="p-2">Estado</th><th className="p-2">Tentativas</th><th className="p-2">Detalhes</th><th className="p-2">Ação</th></tr></thead><tbody>
      {queue.data?.items.map(job=><tr key={job.id} className="border-t"><td className="p-2">{job.externalReference}</td><td className="p-2">{labels[job.status]??job.status}</td><td className="p-2">{job.attempts}/5 (total: {job.totalAttempts})</td><td className="p-2">{job.lastErrorCode?(errors[job.lastErrorCode]??"Verifique a integração."):"—"}{job.status==="RETRY"&&<p>Após: {new Date(job.nextAttemptAt).toLocaleString("pt-BR")}</p>}</td><td className="p-2">{job.status==="DEAD"&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>setSelected(job.id)}>Reabrir como Admin</Button>}</td></tr>)}
    </tbody></table></div>
    {queue.data?.items.length===0&&<p className="text-sm">Nenhuma integração na fila.</p>}
    {selected&&<form onSubmit={e=>{e.preventDefault();void act({action:"RETRY",id:selected,reason});}} className="space-y-2 border-t pt-3"><label htmlFor="queue-reason" className="block text-sm">Motivo do reprocessamento (não inclua senhas ou chaves)</label><Input id="queue-reason" required minLength={5} maxLength={200} value={reason} onChange={e=>setReason(e.target.value)}/><Button type="submit" disabled={busy}>Confirmar reprocessamento</Button><Button type="button" variant="ghost" onClick={()=>setSelected(null)}>Cancelar</Button></form>}
    <div className="flex items-center gap-3"><Button type="button" variant="outline" disabled={busy||page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span>Página {page}</span><Button type="button" variant="outline" disabled={busy||!queue.data||page*20>=queue.data.total||page>=1000} onClick={()=>setPage(p=>p+1)}>Próxima</Button></div>
  </Card>;
}
