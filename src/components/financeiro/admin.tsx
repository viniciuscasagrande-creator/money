"use client";
import { useState, type FormEvent } from "react";
import { Building2, CalendarDays, UserRoundPlus, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, Empty, ErrorNotice, Field, Loading, PageHeading, useApi, type Event, type Producer } from "@/components/financeiro/shared";
type User = { id: string; name: string; email: string; role: string; active: boolean; producer: { name: string } | null };
type Mode = "producer" | "event" | "user";
const roles: Record<string,string> = { ADMIN: "Administrador", FINANCE_DISK: "Financeiro Interno", PRODUCER: "Produtor" };
export function AdminPage() {
  const producerQ = useApi<{items:Producer[]}>("/api/admin/produtores");
  const eventsQ = useApi<{items:Event[]}>("/api/admin/eventos");
  const usersQ = useApi<{items:User[]}>("/api/admin/usuarios");
  const [mode,setMode] = useState<Mode|null>(null), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const [name,setName] = useState(""), [document,setDocument] = useState(""), [producerId,setProducerId] = useState(""), [status,setStatus] = useState("PLANNED"), [email,setEmail] = useState(""), [password,setPassword] = useState(""), [role,setRole] = useState("PRODUCER");
  function start(next: Mode) { setName(""); setDocument(""); setProducerId(""); setStatus("PLANNED"); setEmail(""); setPassword(""); setRole("PRODUCER"); setError(""); setMode(next); }
  async function submit(e: FormEvent) { e.preventDefault(); if(!mode) return; setBusy(true); setError("");
    try {
      if (mode === "producer") { await api("/api/admin/produtores", { method: "POST", body: JSON.stringify({ name, document: document || null }) }); producerQ.reload(); }
      else if (mode === "event") { await api("/api/admin/eventos", { method: "POST", body: JSON.stringify({ name, producerId, status }) }); eventsQ.reload(); }
      else { await api("/api/admin/usuarios", { method: "POST", body: JSON.stringify({ name, email, password, role, producerId: role === "PRODUCER" ? producerId : null }) }); usersQ.reload(); }
      setMode(null);
    } catch(e) { setError(e instanceof Error ? e.message : "Erro no cadastro."); } finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="Fundação e permissões" title="Cadastros e Acessos" subtitle="Cadastre produtores, eventos e usuários. Cada login terá permissões conforme seu perfil."/><div className="mb-5 grid gap-4 xl:grid-cols-3">
    <Summary title="Produtores" count={producerQ.data?.items.length} loading={producerQ.loading} Icon={Building2} click={()=>start("producer")} button="Novo produtor" />
    <Summary title="Eventos" count={eventsQ.data?.items.length} loading={eventsQ.loading} Icon={CalendarDays} click={()=>start("event")} button="Novo evento"/>
    <Summary title="Usuários" count={usersQ.data?.items.length} loading={usersQ.loading} Icon={UserRoundPlus} click={()=>start("user")} button="Novo usuário"/>
  </div>
  {[producerQ.error,eventsQ.error,usersQ.error].filter(Boolean).map((x,i)=><ErrorNotice key={i} message={x}/>)}
  <div className="grid gap-5 xl:grid-cols-2"><Card className="overflow-hidden"><div className="border-b border-slate-100 p-5 font-semibold">Produtores cadastrados</div>{producerQ.loading ? <Loading/> : producerQ.data?.items.length ? <div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Produtor</th><th>Documento</th></tr></thead><tbody>{producerQ.data.items.map(p=><tr key={p.id}><td className="font-semibold">{p.name}</td><td>{p.document||"—"}</td></tr>)}</tbody></table></div> : <Empty text="Nenhum produtor cadastrado."/>}</Card>
    <Card className="overflow-hidden"><div className="border-b border-slate-100 p-5 font-semibold">Eventos</div>{eventsQ.loading ? <Loading/> : eventsQ.data?.items.length ? <div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Evento</th><th>Produtor</th><th>Situação</th></tr></thead><tbody>{eventsQ.data.items.map(e=><tr key={e.id}><td className="font-semibold">{e.name}</td><td>{e.producerName}</td><td><Badge>{e.status === "ACTIVE" ? "Ativo" : e.status === "CLOSED" ? "Encerrado" : "Planejado"}</Badge></td></tr>)}</tbody></table></div> : <Empty text="Nenhum evento cadastrado."/>}</Card></div>
  <Card className="mt-5 overflow-hidden"><div className="flex items-center gap-2 border-b border-slate-100 p-5 font-semibold"><ShieldCheck size={17}/>Usuários e perfis de acesso</div>{usersQ.loading ? <Loading/> : usersQ.data?.items.length ? <div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Vinculação</th></tr></thead><tbody>{usersQ.data.items.map(u=><tr key={u.id}><td className="font-semibold">{u.name}</td><td>{u.email}</td><td><Badge tone={u.role === "ADMIN" ? "blue" : "neutral"}>{roles[u.role] || u.role}</Badge></td><td>{u.producer?.name||"—"}</td></tr>)}</tbody></table></div> : <Empty text="Não há usuários cadastrados."/>}</Card>
  <Dialog open={!!mode} onOpenChange={o=> { if(!o)setMode(null); }}><DialogContent><DialogTitle className="text-xl font-bold">{mode === "producer" ? "Novo produtor" : mode === "event" ? "Novo evento" : "Novo usuário"}</DialogTitle><DialogDescription className="mt-1 text-sm text-slate-500">Cadastro persistido e registrado na auditoria.</DialogDescription><form onSubmit={submit} className="mt-6 space-y-4"><Field label={mode === "user" ? "Nome do usuário" : mode === "producer" ? "Nome do produtor" : "Nome do evento"}><Input required minLength={2} value={name} onChange={e=>setName(e.target.value)}/></Field>
    {mode === "producer" && <Field label="Documento (CPF/CNPJ ou identificação)"><Input value={document} onChange={e=>setDocument(e.target.value)} placeholder="Opcional"/></Field>}
    {(mode === "event" || (mode === "user" && role === "PRODUCER")) && <Field label="Produtor responsável"><Select value={producerId} onValueChange={setProducerId}><SelectTrigger><SelectValue placeholder="Selecione um produtor"/></SelectTrigger><SelectContent>{producerQ.data?.items.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></Field>}
    {mode === "event" && <Field label="Situação do evento"><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="PLANNED">Planejado</SelectItem><SelectItem value="ACTIVE">Ativo</SelectItem><SelectItem value="CLOSED">Encerrado</SelectItem></SelectContent></Select></Field>}
    {mode === "user" && <><Field label="E-mail de login"><Input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Senha inicial (mín. 12 caracteres)"><Input required minLength={12} maxLength={128} autoComplete="new-password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/></Field><Field label="Perfil de acesso"><Select value={role} onValueChange={v=> {setRole(v);setProducerId("");}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="PRODUCER">Produtor</SelectItem><SelectItem value="FINANCE_DISK">Financeiro Interno</SelectItem><SelectItem value="ADMIN">Administrador</SelectItem></SelectContent></Select></Field></>}
    {error && <ErrorNotice message={error}/>}<div className="flex justify-end gap-3 pt-3"><Button type="button" variant="outline" onClick={()=>setMode(null)}>Cancelar</Button><Button type="submit" disabled={busy || ((mode==="event" || (mode==="user" && role==="PRODUCER")) && !producerId)}>{busy ? "Salvando..." : "Salvar cadastro"}</Button></div>
  </form></DialogContent></Dialog>
  </>;
}
function Summary({title,count,loading,Icon,click,button}:{title:string;count:number|undefined;loading:boolean;Icon:typeof Building2;click:()=>void;button:string}) { return <Card><div className="p-5"><div className="flex justify-between"><span className="rounded-xl bg-slate-100 p-2.5 text-slate-600"><Icon size={20}/></span><span className="text-3xl font-bold">{loading ? "—" : count??0}</span></div><p className="mt-4 font-semibold">{title}</p><Button variant="outline" size="sm" className="mt-4" onClick={click}><Plus size={14}/>{button}</Button></div></Card>; }
