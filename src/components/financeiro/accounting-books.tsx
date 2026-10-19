"use client";
import { useEffect, useState } from "react";

type Item = Record<string, unknown>;

const views = [
  { id: "resumo", label: "Dashboard Contábil" },
  { id: "contas", label: "M1 · Plano de Contas" },
  { id: "periodos", label: "M1 · Períodos" },
  { id: "regras", label: "M2 · Regras Versionadas" },
  { id: "eventos", label: "M2 · Eventos de Negócio" },
  { id: "razao", label: "M10 · Livro Razão" },
  { id: "balancete", label: "M10 · Balancete (D=C)" },
  { id: "dre", label: "M10 · DRE Contábil" },
  { id: "passivos", label: "M4 · Passivos & Retenções" }
];

function fmtBRLCents(v: unknown): string {
  if (v === null || v === undefined) return "—";
  try {
    const n = Number(BigInt(String(v))) / 100;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return String(v);
  }
}

export function AccountingBooks() {
  const [view, setView] = useState("resumo");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Item[] | null>(null);
  const [summary, setSummary] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(id = view) {
    setView(id);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/contabilidade?visao=${id}&periodo=${period}`, { cache: "no-store" });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Não foi possível consultar.");
      setData(Array.isArray(out.items) ? out.items : []);
      setSummary(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na consulta");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("resumo");
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
        body: JSON.stringify({ kind: "seed_chart" })
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Erro ao inicializar plano de contas.");
      setNotice(`Plano de contas padrão SOUL (M1 a M10) verificado (${out.createdCount ?? 0} novas contas criadas).`);
      await load("contas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao semear plano de contas");
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
    balancete: ["code", "name", "type", "debitCents", "creditCents", "saldoDevedorCents"],
    dre: ["linha", "valorCents"],
    passivos: ["eventId", "accountCode", "accountName", "creditCents", "debitCents", "saldoCredorCents"]
  };

  return (
    <div className="space-y-5">
      <header className="rounded-2xl bg-slate-900 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-300">SOUL v4.4 · Controladoria & Motor Contábil Integrado (M1 a M10)</p>
            <h1 className="mt-1 text-2xl font-semibold">Dashboard Contábil & Livros</h1>
            <p className="mt-2 text-sm text-slate-300">
              Múltiplas partidas dobradas, imutabilidade (estorno inverso), DRE por competência, passivos de produtores e retenções obrigatórias (ECAD/Locação). Isolado do razão bancário operacional.
            </p>
          </div>
          <button
            type="button"
            onClick={seedStandardChart}
            disabled={loading}
            className="rounded-xl bg-[#ff746b] px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-[#e86259] disabled:opacity-50"
          >
            Inicializar Plano de Contas Padrão (24 contas)
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {views.map((v) => (
          <button
            type="button"
            key={v.id}
            onClick={() => load(v.id)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              view === v.id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-700">
          Competência
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="ml-2 rounded-lg border p-2"
          />
        </label>
        <button
          onClick={() => load()}
          disabled={loading}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Consultando..." : "Atualizar"}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
      )}

      {summary && view === "resumo" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Contas no Plano (M1)", "accounts"],
              ["Períodos Contábeis (M1)", "periods"],
              ["Eventos de Negócio (M2)", "events"],
              ["Lançamentos no Diário (M2)", "journals"]
            ].map(([label, key]) => (
              <div key={key} className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{format(summary[key])}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Canais Contabilizados</p>
              <p className="mt-1 text-base font-semibold text-slate-900">Online · POS PagSeguro · Bilheteria</p>
              <p className="mt-1 text-xs text-slate-500">
                Modelo Agente: ingresso líquido em passivo do produtor (2.1.01) e taxa/comissão em receita diferida (2.1.02) até a realização do evento.
              </p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Retenções e Transferências</p>
              <p className="mt-1 text-base font-semibold text-slate-900">Conta 2.1.04 & Centro EVT:ID</p>
              <p className="mt-1 text-xs text-slate-500">
                Retenções obrigatórias (ECAD, Aluguel, Equipe) ficam segregadas em 2.1.04. Transferências entre eventos do mesmo produtor movimentam 2.1.01 entre centros sem criar receita nova.
              </p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tributação Parametrizável (M7)</p>
              <p className="mt-1 text-base font-semibold text-slate-900">ISS · PIS · COFINS Configuráveis</p>
              <p className="mt-1 text-xs text-slate-500">
                Parâmetros ativos (bps): {format(summary.taxRatesBps)}. Provisão em 2.1.03 no reconhecimento de receita e reversão automática em reembolsos pós-evento.
              </p>
            </div>
          </div>
        </div>
      )}

      {summary && view === "balancete" && (
        <div className="rounded-xl border bg-white p-4 text-sm font-medium">
          Total Débitos: {fmtBRLCents(summary.totalDebitsCents)} · Total Créditos: {fmtBRLCents(summary.totalCreditsCents)} ·{" "}
          <span className={summary.balanced ? "text-emerald-700" : "text-red-700"}>
            {summary.balanced ? "Balancete Fechado (D = C)" : "Desbalanceado"}
          </span>
        </div>
      )}

      {data && view !== "resumo" && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[740px] text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                {(columns[view] || []).map((c) => (
                  <th key={c} className="px-3 py-3">
                    {c}
                  </th>
                ))}
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
                </tr>
              ))}
            </tbody>
          </table>
          {data.length === 0 && <p className="p-5 text-slate-500">Sem dados para a consulta.</p>}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Consulta limitada por volume. Cadastros e processamento contábil estão disponíveis por APIs internas autenticadas para homologação. Nenhuma baixa bancária é executada nesta área.
      </p>
    </div>
  );
}
