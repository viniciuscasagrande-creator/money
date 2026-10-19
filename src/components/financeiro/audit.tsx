"use client";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, ErrorNotice, Loading, PageHeading, displayDateTime, useApi } from "@/components/financeiro/shared";
type Log = { id: string; action: string; entity: string; summary: string; actor: string; actorEmail: string; createdAt: string };
export function AuditPage() {
  const { data, error, loading, reload } = useApi<{items:Log[]}>("/api/auditoria");
  return <><PageHeading eyebrow="Governança inicial" title="Trilha de Auditoria" subtitle="Acompanhe os primeiros registros de cadastro e liquidação. Os controles avançados serão ampliados em pacotes posteriores."/>
    {error && <ErrorNotice message={error} retry={reload}/>}<Card className="overflow-hidden"><div className="flex items-center gap-2 border-b border-slate-100 p-5 font-semibold"><ShieldCheck size={18}/>Atividades recentes <Badge>Últimos 100 registros</Badge></div>{loading ? <Loading/> : data?.items.length ? <div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Data</th><th>Operação</th><th>Descrição</th><th>Responsável</th></tr></thead><tbody>{data.items.map(l=><tr key={l.id}><td className="whitespace-nowrap">{displayDateTime(l.createdAt)}</td><td><Badge>{l.action.replaceAll("_", " ")}</Badge></td><td>{l.summary}</td><td>{l.actor}<span className="block text-xs text-slate-400">{l.actorEmail}</span></td></tr>)}</tbody></table></div> : <Empty text="Nenhum registro de auditoria disponível."/>}</Card>
  </>;
}
