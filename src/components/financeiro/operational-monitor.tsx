"use client";
import {useState} from "react";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {useApi,api,ErrorNotice,displayDateTime} from "./shared";
const labels:Record<string,string>={INTEGRATION_DEAD:"Integrações com tentativas esgotadas",INTEGRATION_OVERDUE:"Integrações atrasadas",INTEGRATION_EXPIRED_LEASE:"Processamentos interrompidos",ACCOUNTING_ERROR:"Fatos contábeis com erro",ACCOUNTING_OVERDUE:"Fatos contábeis pendentes",WORKER_STALE:"Execução do worker desatualizada",BACKUP_STALE:"Cópia de backup desatualizada"};
type Monitor={checkedAt:string;lastEvaluationAt:string|null;evaluationFresh:boolean;status:string;channelConfigured:boolean;signals:{code:string;count:number;active:boolean;enabled:boolean}[];notifications:{pending:number;dead:number;recent:{id:string;signal:string;transition:string;status:string;attempts:number;createdAt:string}[]}};
export function OperationalMonitor(){
  const {data,error,reload}=useApi<Monitor>("/api/sistema/monitoramento"),[busy,setBusy]=useState(""),[notice,setNotice]=useState("");
  async function retry(id:string){setBusy(id);setNotice("");try{await api("/api/sistema/monitoramento",{method:"POST",body:JSON.stringify({action:"RETRY",id})});setNotice("Alerta reenfileirado. O despachante fará a próxima tentativa.");reload();}catch(e){setNotice(e instanceof Error?e.message:"Erro ao reenfileirar.");}finally{setBusy("");}}
  return <Card className="mb-6 p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Monitoramento operacional</h2><Button variant="outline" size="sm" onClick={reload}>Atualizar sinais</Button></div>
    {error&&<ErrorNotice message={error} retry={reload}/>}
    {data&&<><p className="my-3 text-xs text-slate-600">Consulta: {displayDateTime(data.checkedAt)} · {data.channelConfigured?"Canal configurado; execução do despachante depende do agendador.":"Canal de alertas ainda não configurado."}</p>
      <p className={`mb-3 text-sm ${data.evaluationFresh?"text-slate-600":"text-red-700"}`}>Última verificação da rotina: {data.lastEvaluationAt?displayDateTime(data.lastEvaluationAt):"nunca executada"}{!data.evaluationFresh&&" · sem execução recente nos últimos 10 minutos"}</p>
      <div className="grid gap-2 md:grid-cols-2">{data.signals.map(s=><p key={s.code} className={`rounded border p-2 text-sm ${s.active?"border-red-200 bg-red-50":"border-slate-200"}`}>{labels[s.code]??s.code}: <strong>{s.enabled?s.count:"verificação desativada"}</strong></p>)}</div>
      <p className="my-3 text-sm">Notificações aguardando envio: {data.notifications.pending} · Tentativas esgotadas: {data.notifications.dead}</p>
      <div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Data</th><th>Sinal</th><th>Transição</th><th>Entrega</th><th>Ação</th></tr></thead><tbody>{data.notifications.recent.map(n=><tr key={n.id}><td>{displayDateTime(n.createdAt)}</td><td>{labels[n.signal]??n.signal}</td><td>{n.transition==="OPEN"?"Ocorrência aberta":"Sinal normalizado"}</td><td>{n.status} · {n.attempts} tentativa(s)</td><td>{n.status==="DEAD"&&<Button size="sm" disabled={!!busy} onClick={()=>retry(n.id)}>Reenfileirar</Button>}</td></tr>)}</tbody></table></div>
      <p className="mt-3 text-xs text-slate-500">A consulta não cria nem envia alertas. A rotina de verificação precisa estar agendada. Falhas do próprio banco exigem monitoramento externo.</p>
    </>}{notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}</Card>;
}
