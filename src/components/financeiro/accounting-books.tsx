"use client";
import { useEffect, useState, type FormEvent } from "react";
import { FolderTree, Plus, RefreshCw, ShieldCheck, Layers3, Calculator } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/financeiro/shared";
import { parseBRLToCents,fmtBRL } from "@/lib/money";
import { AccountingWorkflow,AccountingTrail,AccountingRulesEditor } from "@/components/financeiro/accounting-workflow";

type Item = Record<string, unknown>;

const views = [
  { id: "contas", label: "M1 · Plano de Contas (Árvore)" },
  { id: "resumo", label: "Dashboard Contábil" },
  { id: "razao", label: "M10 · Livro Razão" },
  { id: "balancete", label: "M10 · Balancete (D=C)" },
  { id: "dre", label: "M10 · DRE Contábil" },
  { id: "passivos", label: "M4 · Passivos & Retenções" },
  { id: "eventos", label: "M2 · Eventos de Negócio" },
  { id: "regras", label: "M2 · Regras Versionadas" },
  { id: "periodos", label: "M1 · Períodos Contábeis" },
];

const TYPE_LABELS: Record<string, string> = {
  ASSET: "1 · Ativo",
  LIABILITY: "2 · Passivo / Obrigações",
  EQUITY: "2.9 · Patrimônio Líquido",
  REVENUE: "3 · Receita Operacional",
  DEDUCTION: "3.2 · Dedução / Tributo",
  EXPENSE: "4 · Custo / Despesa",
};

function fmtBRLCents(v: unknown): string {
  if (v === null || v === undefined) return "—";
  try {
    return fmtBRL(String(v));
  } catch {
    return String(v);
  }
}

export function AccountingBooks() {
  const [trailId,setTrailId]=useState<string|null>(null);
  const [journalPage,setJournalPage]=useState(1);
  const [closeTarget,setCloseTarget]=useState<Item|null>(null),[closeReviewed,setCloseReviewed]=useState(false);
  const [view, setView] = useState("contas");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Item[] | null>(null);
  const [summary, setSummary] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modais de cadastro operacional
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accCode, setAccCode] = useState("");
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<"ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "DEDUCTION" | "EXPENSE">("ASSET");
  const [accPostable, setAccPostable] = useState(true);

  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [newPeriodName, setNewPeriodName] = useState(new Date().toISOString().slice(0, 7));

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [evtType, setEvtType] = useState("TICKET_SALE");
  const [evtSource, setEvtSource] = useState<"ONLINE" | "POS" | "BOX_OFFICE" | "FINANCE">("ONLINE");
  const [evtSourceId, setEvtSourceId] = useState("PED-1001");
  const [evtAmount, setEvtAmount] = useState("100,00");

  const [taxModalOpen, setTaxModalOpen] = useState(false);
  const [issBps, setIssBps] = useState("500");
  const [pisBps, setPisBps] = useState("65");
  const [cofinsBps, setCofinsBps] = useState("300");

  async function load(id = view,page=1) {
    setJournalPage(page);
    setView(id);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/contabilidade?visao=${id}&periodo=${period}&page=${page}`, { cache: "no-store" });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Não foi possível consultar.");
      const items = Array.isArray(out.items) ? out.items : [];
      setData(items);
      setSummary(out);

    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na consulta");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const aba = params.get("aba");
    if (aba === "plano") void load("contas");
    else if (aba === "razao") void load("razao");
    else if (aba === "demonstrativos") void load("balancete");
    else if (aba === "regras") void load("periodos");
    else if (aba === "motor") void load("eventos");
    else void load("contas");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function seedStandardChart() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/contabilidade/cadastros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "seed_chart" }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Erro ao inicializar plano de contas.");
      setNotice(
        `Plano de contas padrão SOUL (M1 a M10) verificado (${out.createdCount ?? 0} novas contas criadas).`
      );
      await load("contas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao semear plano de contas");
    } finally {
      setLoading(false);
    }
  }

  async function closePeriod(){
    if(!closeTarget||!closeReviewed)return;setLoading(true);setError("");
    try{const response=await fetch("/api/contabilidade/periodos",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({periodId:closeTarget.id,status:"CLOSED"})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Falha no fechamento.");setCloseTarget(null);setCloseReviewed(false);setNotice("Competência contábil fechada após as conferências do servidor.");await load("periodos");}
    catch(e){setError(e instanceof Error?e.message:"Falha no fechamento.");setCloseTarget(null);}
    finally{setLoading(false);}
  }

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/contabilidade/cadastros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "account",
          code: accCode.trim(),
          name: accName.trim(),
          type: accType,
          postable: accPostable,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Erro ao cadastrar conta contábil.");
      setAccountModalOpen(false);
      setAccCode("");
      setAccName("");
      setNotice("Conta contábil cadastrada na árvore com sucesso.");
      await load("contas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePeriod(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/contabilidade/cadastros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "period",
          name: newPeriodName,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Erro ao abrir período contábil.");
      setPeriodModalOpen(false);
      setNotice(`Período contábil ${newPeriodName} aberto com sucesso.`);
      await load("periodos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao abrir período.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const cents = parseBRLToCents(evtAmount);
      const extKey = `${evtType}-${evtSource}-${evtSourceId}-${Date.now()}`;
      const res = await fetch("/api/contabilidade/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalKey: extKey,
          type: evtType,
          source: evtSource,
          sourceId: evtSourceId,
          amountCents: cents,
          occurredAt: new Date().toISOString(),
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Erro ao registrar evento contábil.");
      setEventModalOpen(false);
      setNotice(`Evento de negócio registrado (${extKey}).`);
      await load("eventos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar evento.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveTaxConfig(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/contabilidade/cadastros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "tax_config",
          issBps: Number(issBps),
          pisBps: Number(pisBps),
          cofinsBps: Number(cofinsBps),
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Erro ao salvar alíquotas.");
      setTaxModalOpen(false);
      setNotice("Alíquotas tributáveis (ISS, PIS, COFINS) atualizadas no motor contábil.");
      await load("resumo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar tributos.");
    } finally {
      setLoading(false);
    }
  }

  function format(v: unknown, col?: string) {
    if (v === null || v === undefined) return "—";
    if (col && col.endsWith("Cents")) return fmtBRLCents(v);
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  const columns: Record<string, string[]> = {
    contas: ["code", "name", "type", "postable", "active"],
    periodos: ["name", "startAt", "endAt", "status"],
    regras: ["eventType", "version", "debitAccountId", "creditAccountId", "active"],
    eventos: ["type", "source", "externalKey", "amountCents", "status"],
    razao: ["occurredAt", "description", "ruleVersion", "businessEventId"],
    balancete: ["code", "name", "type", "saldoInicialDevedorCents", "debitCents", "creditCents", "saldoDevedorCents"],
    dre: ["linha", "valorCents"],
    passivos: ["eventId", "producerId", "accountCode", "accountName", "saldoInicialCredorCents", "creditCents", "debitCents", "saldoCredorCents"],
  };

  const accountsList = view === "contas" && Array.isArray(data) ? data : [];
  const filteredAccounts = accountsList.filter((acc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(acc.code || "").toLowerCase().includes(q) ||
      String(acc.name || "").toLowerCase().includes(q) ||
      String(acc.type || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <header className="rounded-2xl bg-slate-900 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#ff938b]">
              SOUL v5.1 · Controladoria, Plano de Contas & Motor Contábil (M1 a M10)
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Plano de Contas Hierárquico, Livro Razão, Balancete & DRE</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Árvore contábil com contas sintéticas e analíticas, partidas dobradas (D=C), imutabilidade por estorno inverso, DRE por competência e passivos de produtores/retenções.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAccountModalOpen(true)}
              className="border-white/20 bg-white/10 text-white hover:bg-white/20"
            >
              <Plus size={15} />
              Nova Conta Contábil
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEventModalOpen(true)}
              className="border-white/20 bg-white/10 text-white hover:bg-white/20"
            >
              <Plus size={15} />
              Registrar Evento Contábil
            </Button>
            <Button
              type="button"
              onClick={seedStandardChart}
              disabled={loading}
              className="bg-[#ff746b] text-white hover:bg-[#e86259]"
            >
              <FolderTree size={15} />
              Sincronizar 28 Contas Padrão
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {views.map((v) => (
          <button
            type="button"
            key={v.id}
            onClick={() => load(v.id)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              view === v.id
                ? "bg-slate-900 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-700">
            Competência
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="ml-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <Button size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Consultando..." : "Atualizar"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setPeriodModalOpen(true)}>
            <Plus size={14} />
            Abrir Período (YYYY-MM)
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTaxModalOpen(true)}>
            <Calculator size={14} />
            Configurar ISS / PIS / COFINS
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {/* Árvore Hierárquica do Plano de Contas */}
      {view === "contas" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-medium text-slate-500">Total de Contas na Árvore</p>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">{accountsList.length}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Estrutura hierárquica M1–M10</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-slate-500">Contas Analíticas (Lançáveis)</p>
              <p className="mt-1.5 text-2xl font-bold text-emerald-700">
                {accountsList.filter((a) => a.postable !== false).length}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">Aceitam partidas de débito e crédito</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-slate-500">Contas Sintéticas (Agrupadoras)</p>
              <p className="mt-1.5 text-2xl font-bold text-sky-800">
                {accountsList.filter((a) => a.postable === false).length}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">Bloqueadas para lançamento direto</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-slate-500">Ação Rápida</p>
              <div className="mt-2">
                <Button size="sm" onClick={() => setAccountModalOpen(true)}>
                  <Plus size={14} />
                  Cadastrar Conta Analítica / Sintética
                </Button>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <FolderTree size={18} className="text-[#e3574f]" />
                <span>Árvore Hierárquica do Plano de Contas SOUL</span>
              </div>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por código (ex.: 2.1.01) ou nome da conta..."
                className="max-w-xs"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Código Hierárquico</th>
                    <th>Nome da Conta Contábil</th>
                    <th>Classificação</th>
                    <th>Natureza / Nível</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((acc) => {
                    const code = String(acc.code || "");
                    const depth = Math.max(0, code.split(".").length - 1);
                    const isPostable = acc.postable !== false;
                    return (
                      <tr
                        key={code}
                        className={!isPostable ? "bg-slate-50/90 font-bold text-slate-900" : ""}
                      >
                        <td className="font-mono text-xs font-bold">
                          <span style={{ paddingLeft: `${depth * 14}px` }}>{code}</span>
                        </td>
                        <td>
                          <span style={{ paddingLeft: `${depth * 10}px` }}>
                            {!isPostable ? `▸ ${String(acc.name)}` : String(acc.name)}
                          </span>
                        </td>
                        <td>
                          <Badge tone="neutral">
                            {TYPE_LABELS[String(acc.type)] ?? String(acc.type)}
                          </Badge>
                        </td>
                        <td>
                          <Badge tone={isPostable ? "green" : "blue"}>
                            {isPostable ? "Analítica (Recebe lançamentos)" : "Sintética (Grupo totalizador)"}
                          </Badge>
                        </td>
                        <td>
                          <Badge tone={acc.active !== false ? "green" : "neutral"}>
                            {acc.active !== false ? "Ativa" : "Inativa"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredAccounts.length === 0 && (
                <div className="p-8 text-center text-sm text-slate-500">
                  Nenhuma conta encontrada. Clique em &ldquo;Sincronizar 28 Contas Padrão&rdquo; para carregar a árvore.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {summary && view === "resumo" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Contas no Plano (M1)", "accounts"],
              ["Períodos Contábeis (M1)", "periods"],
              ["Eventos de Negócio (M2)", "events"],
              ["Lançamentos no Diário (M2)", "journals"],
            ].map(([label, key]) => (
              <div key={key} className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{format(summary[key])}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center gap-2">
                <Layers3 size={16} className="text-[#e3574f]" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Fontes de fatos aceitas
                </p>
              </div>
              <p className="mt-1 text-base font-semibold text-slate-900">
                Online · POS · Bilheteria · Financeiro
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Consulte os fatos integrados e revise a distribuição entre ativos, obrigações e receitas antes de contabilizar.
              </p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Retenções e Transferências
                </p>
              </div>
              <p className="mt-1 text-base font-semibold text-slate-900">
                Conta 2.1.04 & Centro EVT:ID
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Retenções obrigatórias (ECAD, Aluguel, Equipe) ficam segregadas em 2.1.04. Transferências entre eventos do mesmo produtor movimentam 2.1.01 entre centros sem criar receita nova.
              </p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center gap-2">
                <Calculator size={16} className="text-sky-700" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Tributação Parametrizável (M7)
                </p>
              </div>
              <p className="mt-1 text-base font-semibold text-slate-900">
                ISS · PIS · COFINS Configuráveis
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Parâmetros {summary.taxConfigured?"cadastrados":"de referência, ainda não configurados"} (bps): {format(summary.taxRatesBps)}. A provisão tributária depende de regras e partidas revisadas; não é calculada automaticamente nesta tela.
              </p>
            </div>
          </div>
        </div>
      )}

      {summary && view === "balancete" && (
        <div className="rounded-xl border bg-white p-4 text-sm font-medium">
          Total Débitos: {fmtBRLCents(summary.totalDebitsCents)} · Total Créditos:{" "}
          {fmtBRLCents(summary.totalCreditsCents)} ·{" "}
          <span className={summary.balanced&&summary.closingBalanced ? "text-emerald-700" : "text-red-700"}>
            {summary.balanced&&summary.closingBalanced ? "Saldos e movimentos conferidos (D = C)" : "Revisar diferenças"}
          </span>
        </div>
      )}

      {data && view !== "resumo" && view !== "contas" && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[740px] text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                {(columns[view] || []).map((c) => (
                  <th key={c} className="px-3 py-3">
                    {c}
                  </th>
                ))}
                {view==="razao"&&<th className="px-3 py-3">Origem e partidas</th>}
                {view==="periodos"&&<th className="px-3 py-3">Fechamento</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={String(row.id || row.linha || row.code || i)} className="border-t">
                  {(columns[view] || []).map((c) => (
                    <td key={c} className="max-w-72 truncate px-3 py-3" title={format(row[c], c)}>
                      {format(row[c], c)}
                    </td>
                  ))}
                  {view==="razao"&&<td className="px-3 py-3"><Button variant="outline" size="sm" onClick={()=>setTrailId(String(row.id))}>Consultar</Button></td>}
                  {view==="periodos"&&<td className="px-3 py-3">{summary?.canManage&&row.status==="OPEN"?<Button variant="outline" size="sm" onClick={()=>{setCloseTarget(row);setCloseReviewed(false);}}>Conferir fechamento</Button>:"—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {data.length === 0 && <p className="p-5 text-slate-500">Sem registros para esta visão no período selecionado.</p>}
        </div>
      )}

      {view==="razao"&&<div className="flex items-center gap-3"><Button variant="outline" disabled={loading||journalPage===1} onClick={()=>void load("razao",journalPage-1)}>Anterior</Button><span>Página {journalPage}</span><Button variant="outline" disabled={loading||journalPage*100>=Number(summary?.total??0)} onClick={()=>void load("razao",journalPage+1)}>Próxima</Button></div>}
      {view==="eventos"&&<AccountingWorkflow onPosted={()=>void load("razao")}/>}
      {view==="regras"&&<AccountingRulesEditor onChanged={()=>void load("regras")}/>}
      {trailId&&<AccountingTrail key={trailId} id={trailId} onClose={()=>setTrailId(null)}/>}
      <Dialog open={closeTarget!==null} onOpenChange={open=>{if(!open)setCloseTarget(null);}}><DialogContent><DialogTitle>Fechar competência {String(closeTarget?.name??"")}</DialogTitle><DialogDescription>O servidor confere pendências e integridade dos lançamentos. Fatos novos desta competência serão bloqueados após o fechamento. A reabertura não está disponível.</DialogDescription><label className="my-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={closeReviewed} onChange={e=>setCloseReviewed(e.target.checked)}/>Conferi os fatos, partidas e demonstrativos desta competência.</label><Button disabled={loading||!closeReviewed} onClick={()=>void closePeriod()}>Confirmar fechamento contábil</Button></DialogContent></Dialog>

      {/* Modal: Nova Conta Contábil */}
      <Dialog open={accountModalOpen} onOpenChange={setAccountModalOpen}>
        <DialogContent>
          <DialogTitle className="text-xl font-bold">Nova Conta no Plano de Contas</DialogTitle>
          <DialogDescription>
            Cadastre uma conta sintética (agrupadora) ou analítica (que recebe lançamentos D/C).
          </DialogDescription>
          <form onSubmit={handleCreateAccount} className="mt-4 space-y-4">
            <Field label="Código Hierárquico (ex.: 1.1.09 ou 4.2.05)">
              <Input
                required
                value={accCode}
                onChange={(e) => setAccCode(e.target.value)}
                placeholder="Ex.: 1.1.09"
              />
            </Field>
            <Field label="Nome da Conta Contábil">
              <Input
                required
                minLength={3}
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                placeholder="Ex.: Caixa Bilheteria Setor VIP"
              />
            </Field>
            <label className="block text-sm font-medium text-slate-700">
              Grupo / Tipo Contábil
              <select
                value={accType}
                onChange={(e) => setAccType(e.target.value as typeof accType)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
              >
                <option value="ASSET">1 · Ativo (Caixa, Bancos, Adquirentes)</option>
                <option value="LIABILITY">2 · Passivo (Obrigações Produtores, Retenções, Tributos)</option>
                <option value="EQUITY">2.9 · Patrimônio Líquido</option>
                <option value="REVENUE">3 · Receita Operacional</option>
                <option value="DEDUCTION">3.2 · Deduções da receita</option>
                <option value="EXPENSE">4 · Custo / Despesa Operacional</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={accPostable}
                onChange={(e) => setAccPostable(e.target.checked)}
              />
              Conta Analítica (permite lançamentos diretos de Débito/Crédito)
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAccountModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar Conta"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Abrir Período Contábil */}
      <Dialog open={periodModalOpen} onOpenChange={setPeriodModalOpen}>
        <DialogContent>
          <DialogTitle className="text-xl font-bold">Abrir Período Contábil</DialogTitle>
          <DialogDescription>
            Habilite a competência mensal (YYYY-MM) para recebimento de partidas dobradas.
          </DialogDescription>
          <form onSubmit={handleCreatePeriod} className="mt-4 space-y-4">
            <Field label="Competência (YYYY-MM)">
              <Input
                required
                type="month"
                value={newPeriodName}
                onChange={(e) => setNewPeriodName(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPeriodModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                Abrir Período
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Registrar Evento de Negócio Contábil */}
      <Dialog open={eventModalOpen} onOpenChange={setEventModalOpen}>
        <DialogContent>
          <DialogTitle className="text-xl font-bold">Registrar Evento de Negócio Contábil</DialogTitle>
          <DialogDescription>
            Registra um fato gerador auditado para contabilização por partidas dobradas.
          </DialogDescription>
          <form onSubmit={handleCreateEvent} className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Tipo do Fato Contábil
              <select
                value={evtType}
                onChange={(e) => setEvtType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
              >
                <option value="TICKET_SALE">TICKET_SALE (Venda de Ingresso)</option>
                <option value="ACQUIRER_SETTLEMENT">ACQUIRER_SETTLEMENT (Liquidação Adquirente)</option>
                <option value="REVENUE_RECOGNITION">REVENUE_RECOGNITION (Reconhecimento Receita Evento)</option>
                <option value="PRODUCER_PAYOUT">PRODUCER_PAYOUT (Repasse ao Produtor)</option>
                <option value="TICKET_REFUND">TICKET_REFUND (Cancelamento / Estorno)</option>
                <option value="CHARGEBACK_LOSS">CHARGEBACK_LOSS (Perda de Chargeback)</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Canal de Origem
              <select
                value={evtSource}
                onChange={(e) => setEvtSource(e.target.value as typeof evtSource)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
              >
                <option value="ONLINE">ONLINE (E-commerce)</option>
                <option value="POS">POS (Maquininha PagSeguro)</option>
                <option value="BOX_OFFICE">BOX_OFFICE (Bilheteria Física)</option>
                <option value="FINANCE">FINANCE (Tesouraria Interna)</option>
              </select>
            </label>
            <Field label="Identificador / NSU / Pedido">
              <Input
                required
                value={evtSourceId}
                onChange={(e) => setEvtSourceId(e.target.value)}
                placeholder="Ex.: PED-2026-001"
              />
            </Field>
            <Field label="Valor do Fato Contábil (R$)">
              <Input
                required
                value={evtAmount}
                onChange={(e) => setEvtAmount(e.target.value)}
                placeholder="100,00"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEventModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                Registrar Evento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Configurar Tributação ISS / PIS / COFINS */}
      <Dialog open={taxModalOpen} onOpenChange={setTaxModalOpen}>
        <DialogContent>
          <DialogTitle className="text-xl font-bold">Parametrizar Alíquotas (ISS, PIS, COFINS)</DialogTitle>
          <DialogDescription>
            Valores em basis points (100 bps = 1,00%). Aplicados automaticamente na provisão tributária sobre as receitas próprias da SOUL.
          </DialogDescription>
          <form onSubmit={handleSaveTaxConfig} className="mt-4 space-y-4">
            <Field label="ISS (bps · ex.: 500 = 5,00%)">
              <Input
                required
                type="number"
                min="0"
                max="2000"
                value={issBps}
                onChange={(e) => setIssBps(e.target.value)}
              />
            </Field>
            <Field label="PIS (bps · ex.: 65 = 0,65%)">
              <Input
                required
                type="number"
                min="0"
                max="1000"
                value={pisBps}
                onChange={(e) => setPisBps(e.target.value)}
              />
            </Field>
            <Field label="COFINS (bps · ex.: 300 = 3,00%)">
              <Input
                required
                type="number"
                min="0"
                max="2000"
                value={cofinsBps}
                onChange={(e) => setCofinsBps(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTaxModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                Salvar Alíquotas
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
