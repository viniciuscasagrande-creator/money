"use client";
import { useState, type FormEvent } from "react";
import { Landmark, Plus, Wallet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api, Empty, ErrorNotice, Field, Loading, PageHeading, useApi, type Account } from "@/components/financeiro/shared";
import { fmtBRL, parseBRLToCents } from "@/lib/money";
export function AccountsPage() {
  const { data, error, loading, reload } = useApi<{items: Account[]}>("/api/contas");
  const [open,setOpen] = useState(false), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const [name,setName] = useState(""), [institution,setInstitution] = useState(""), [lastFour,setLastFour] = useState(""), [initial,setInitial] = useState("0,00");
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setMessage("");
    try { await api("/api/contas", { method: "POST", body: JSON.stringify({ name, institution, lastFour: lastFour || null, initialBalanceCents: initial.trim() === "0,00" || initial.trim() === "0" ? "0" : parseBRLToCents(initial) }) });
      setOpen(false); setName(""); setInstitution(""); setLastFour(""); setInitial("0,00"); reload();
    } catch(e) { setMessage(e instanceof Error ? e.message : "Erro ao cadastrar conta."); } finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="Tesouraria e bancos" title="Contas Bancárias" subtitle="Controle os saldos reais informados e os lançamentos financeiros de cada conta." action={<Button onClick={()=>{setMessage("");setOpen(true);}}><Plus size={17}/>Nova conta</Button>}/>
    {error && <ErrorNotice message={error} retry={reload}/>} {loading && <Loading/>}
    {data && (data.items.length === 0 ? <Card><Empty text="Nenhuma conta cadastrada. Adicione uma conta bancária para registrar liquidações."/></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.items.map(a=><Card key={a.id}><CardContent className="p-6"><div className="flex items-start justify-between"><span className="rounded-xl bg-sky-50 p-3 text-sky-700"><Landmark size={21}/></span><Badge tone={a.active ? "green" : "neutral"}>{a.active ? "Ativa" : "Inativa"}</Badge></div><h3 className="mt-6 font-bold">{a.name}</h3><p className="mt-1 text-xs text-slate-500">{a.institution}{a.lastFour ? ` · Final ${a.lastFour}` : ""}</p><div className="mt-6 border-t border-slate-100 pt-5"><p className="flex items-center gap-2 text-xs text-slate-500"><Wallet size={14}/> Saldo atual</p><p className="mt-2 text-[27px] font-bold tracking-tight">{fmtBRL(a.balanceCents)}</p></div></CardContent></Card>)}</div>)}
    <div className="mt-6 flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={16}/>Saldos registrados em centavos e movimentações persistidas no banco de dados.</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle className="text-xl font-bold">Cadastrar conta bancária</DialogTitle><DialogDescription className="mt-2 text-sm text-slate-500">O saldo inicial é registrado como lançamento de abertura no razão financeiro.</DialogDescription><form onSubmit={submit} className="mt-6 space-y-4"><Field label="Nome de identificação"><Input required minLength={2} value={name} onChange={e=>setName(e.target.value)} placeholder="Conta operacional"/></Field><Field label="Instituição"><Input required minLength={2} value={institution} onChange={e=>setInstitution(e.target.value)} placeholder="Banco ou instituição financeira"/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Últimos quatro dígitos"><Input inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={lastFour} onChange={e=>setLastFour(e.target.value)} placeholder="Opcional"/></Field><Field label="Saldo inicial (R$)"><Input inputMode="decimal" required value={initial} onChange={e=>setInitial(e.target.value)}/></Field></div>{message && <ErrorNotice message={message}/>}<div className="flex justify-end gap-2 pt-3"><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button disabled={busy} type="submit">{busy ? "Salvando..." : "Criar conta"}</Button></div></form></DialogContent></Dialog>
  </>;
}
