"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, CheckCircle2, ReceiptText, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, Empty, ErrorNotice, Field, Loading, PageHeading, StatusBadge, displayDate, useApi, type Account, type Event, type Producer, type Title } from "@/components/financeiro/shared";
import { fmtBRL, parseBRLToCents } from "@/lib/money";
type Kind = "RECEIVABLE" | "PAYABLE";
type Props = { kind: Kind; role: "ADMIN" | "FINANCE_DISK" | "PRODUCER" };
export function TitlesPage({ kind, role }: Props) {
  const internal = role !== "PRODUCER";
  const endpoint = kind === "RECEIVABLE" ? "/api/recebimentos" : "/api/pagamentos";
  const { data, error, loading, reload } = useApi<{ items: Title[] }>(endpoint);
  const [producers, setProducers] = useState<Producer[]>([]), [events, setEvents] = useState<Event[]>([]), [accounts, setAccounts] = useState<Account[]>([]);
  const [formOpen, setFormOpen] = useState(false), [settle, setSettle] = useState<Title | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [description, setDescription] = useState(""), [amount, setAmount] = useState(""), [dueDate, setDueDate] = useState(""), [producerId, setProducerId] = useState(""), [eventId, setEventId] = useState(""), [accountId, setAccountId] = useState("");
  useEffect(() => { if (internal) Promise.all([api<{items:Producer[]}>("/api/admin/produtores"), api<{items:Event[]}>("/api/admin/eventos"), api<{items:Account[]}>("/api/contas")]).then(([p,e,a]) => { setProducers(p.items); setEvents(e.items); setAccounts(a.items.filter(x => x.active)); }).catch(e => setMessage(e.message)); }, [internal]);
  const filteredEvents = useMemo(() => producerId ? events.filter(e => e.producerId === producerId) : events, [events, producerId]);
  const label = kind === "RECEIVABLE" ? "Recebimentos" : "Contas a Pagar";
  function reset() { setDescription(""); setAmount(""); setDueDate(""); setProducerId(""); setEventId(""); setMessage(""); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      await api(endpoint, { method: "POST", body: JSON.stringify({ description, amountCents: parseBRLToCents(amount), dueDate: dueDate || null, producerId: producerId || null, eventId: eventId || null }) });
      setFormOpen(false); reset(); reload();
    } catch(e) { setMessage(e instanceof Error ? e.message : "Não foi possível cadastrar."); } finally { setBusy(false); }
  }
  async function liquidate(e: FormEvent) {
    e.preventDefault(); if (!settle || !accountId) return;
    setBusy(true); setMessage("");
    try { await api(`/api/titulos/${settle.id}/liquidar`, { method: "POST", body: JSON.stringify({ bankAccountId: accountId }) });
      setSettle(null); setAccountId(""); reload();
      const updated = await api<{items:Account[]}>("/api/contas"); setAccounts(updated.items);
    } catch(e) { setMessage(e instanceof Error ? e.message : "Não foi possível liquidar."); } finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="Operações financeiras" title={label} subtitle={internal ? "Cadastre títulos, acompanhe pendências e liquide operações em contas bancárias autorizadas." : "Consulte títulos associados aos seus eventos. Esta visão não calcula valores disponíveis para repasse."} action={internal ? <Button onClick={() => { reset(); setFormOpen(true); }}><Plus size={17}/>Novo {kind === "RECEIVABLE" ? "recebível" : "pagamento"}</Button> : <Badge tone="blue">Somente consulta</Badge>}/>
    {!internal && <div className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><CircleAlert className="mr-2 inline" size={17}/>Os registros exibidos não constituem um saldo de repasse confirmado.</div>}
    {message && <ErrorNotice message={message}/>} {error && <ErrorNotice message={error} retry={reload}/>}
    <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div className="flex items-center gap-2 font-semibold"><ReceiptText size={19} className="text-slate-500"/>Listagem de títulos</div><Badge>{data?.items.length ?? 0} registros</Badge></div>
      {loading ? <Loading/> : data?.items.length ? <div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>Descrição</th><th>Produtor / evento</th><th>Valor</th><th>Vencimento</th><th>Status</th>{internal && <th>Ação</th>}</tr></thead><tbody>{data.items.map(t=><tr key={t.id}><td className="min-w-[200px]"><p className="font-semibold">{t.description}</p><span className="text-xs text-slate-400">{displayDate(t.createdAt)}</span></td><td className="min-w-[170px]"><span className="block">{t.producerName}</span><span className="text-xs text-slate-400">{t.eventName}</span></td><td className="whitespace-nowrap font-semibold">{fmtBRL(t.amountCents)}</td><td>{displayDate(t.dueDate)}</td><td><StatusBadge status={t.status}/></td>{internal && <td>{t.status === "OPEN" ? <Button size="sm" variant="outline" onClick={() => { setMessage(""); setAccountId(""); setSettle(t); }}><CheckCircle2 size={15}/>Liquidar</Button> : <span className="text-xs text-slate-400">Concluído</span>}</td>}</tr>)}</tbody></table></div> : <Empty text="Nenhum título cadastrado neste módulo."/>}</Card>
    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent><DialogTitle className="text-xl font-bold">Novo {kind === "RECEIVABLE" ? "recebível" : "pagamento"}</DialogTitle><DialogDescription className="mt-1 text-sm text-slate-500">O cadastro não altera o saldo da conta até a liquidação.</DialogDescription><form onSubmit={submit} className="mt-6 space-y-4"><Field label="Descrição"><Input required minLength={3} maxLength={180} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descrição da operação" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Valor (R$)"><Input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></Field><Field label="Vencimento"><Input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></Field></div><Field label="Produtor (opcional)"><Select value={producerId || "none"} onValueChange={v=> { setProducerId(v === "none" ? "" : v); setEventId(""); }}><SelectTrigger><SelectValue placeholder="Sem vinculação"/></SelectTrigger><SelectContent><SelectItem value="none">Sem vinculação</SelectItem>{producers.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Evento (opcional)"><Select value={eventId || "none"} onValueChange={v=>setEventId(v === "none" ? "" : v)}><SelectTrigger><SelectValue placeholder="Sem vinculação"/></SelectTrigger><SelectContent><SelectItem value="none">Sem vinculação</SelectItem>{filteredEvents.map(ev=><SelectItem key={ev.id} value={ev.id}>{ev.name} · {ev.producerName}</SelectItem>)}</SelectContent></Select></Field>{message && <ErrorNotice message={message}/>}<div className="flex justify-end gap-3 pt-3"><Button type="button" variant="outline" onClick={()=>setFormOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Cadastrar título"}</Button></div></form></DialogContent></Dialog>
    <Dialog open={!!settle} onOpenChange={open => { if (!open) setSettle(null); }}><DialogContent><DialogTitle className="text-xl font-bold">Confirmar liquidação</DialogTitle><DialogDescription className="mt-2 text-sm leading-6 text-slate-600">{settle?.description} · <strong>{fmtBRL(settle?.amountCents || "0")}</strong>. A operação atualizará o saldo registrado e gravará um lançamento de auditoria. Não executa PIX nem transferência no banco.</DialogDescription><form onSubmit={liquidate} className="mt-6 space-y-4"><Field label="Conta bancária"><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Selecione a conta"/></SelectTrigger><SelectContent>{accounts.filter(x=>x.active).map(a=><SelectItem key={a.id} value={a.id}>{a.name} · {fmtBRL(a.balanceCents)}</SelectItem>)}</SelectContent></Select></Field>{!accounts.length && <p className="text-sm text-amber-700">Cadastre uma conta bancária antes de liquidar.</p>}{message && <ErrorNotice message={message}/>}<div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={()=>setSettle(null)}>Cancelar</Button><Button type="submit" disabled={!accountId || busy}>{busy ? "Liquidando..." : "Confirmar liquidação"}</Button></div></form></DialogContent></Dialog>
  </>;
}
