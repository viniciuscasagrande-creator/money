"use client";
import Link from "next/link";
import { useState } from "react";
import { BarChart3, Download, RefreshCw, ShieldAlert, BellRing, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeading, Empty, ErrorNotice, Loading, useApi, api, displayDateTime } from "@/components/financeiro/shared";

type ReportRow = {
  key: string;
  label: string;
  quantity: number;
  grossCents: string;
  producerCents: string;
  settledCents: string;
  paidCents: string;
  committedCents: string;
  diskCents?: string;
  mdrCents?: string;
};
type Report = {
  rows: ReportRow[];
  total: Omit<ReportRow, "label">;
  note: string;
  informationalOnly: boolean;
};
type Catalog = {
  producers: { id: string; name: string }[];
  events: { id: string; name: string; producerId: string }[];
};

function dateOffset(days: number) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function currency(c: string | number | bigint | undefined) {
  const cents = BigInt(c ?? 0),
    negative = cents < 0n,
    positive = negative ? -cents : cents;
  const whole = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(positive / 100n);
  return `${negative ? "−" : ""}R$ ${whole},${String(positive % 100n).padStart(2, "0")}`;
}

export function ReportsPage() {
  const [start, setStart] = useState(() => dateOffset(30)),
    [end, setEnd] = useState(() => dateOffset(0));
  const [producerId, setProducer] = useState(""),
    [eventId, setEvent] = useState(""),
    [group, setGroup] = useState("EVENT");
  const [params, setParams] = useState(() =>
    new URLSearchParams({ inicio: dateOffset(30), fim: dateOffset(0), agrupar: "EVENT" }).toString()
  );
  const catalog = useApi<Catalog>("/api/inteligencia/catalogo");
  const { data, error, loading, reload } = useApi<Report>(`/api/inteligencia/relatorios?${params}`);

  function apply(nextGroup = group, nextStart = start, nextEnd = end) {
    setGroup(nextGroup);
    setStart(nextStart);
    setEnd(nextEnd);
    const p = new URLSearchParams({ inicio: nextStart, fim: nextEnd, agrupar: nextGroup });
    if (producerId) p.set("produtorId", producerId);
    if (eventId) p.set("eventoId", eventId);
    setParams(p.toString());
  }

  const maxBig = (data?.rows ?? []).reduce((m, r) => {
    const val = BigInt(r.grossCents || "0");
    return val > m ? val : m;
  }, 0n);

  function barWidthPct(cents: string): number {
    if (maxBig <= 0n) return 0;
    const val = BigInt(cents || "0");
    if (val <= 0n) return 0;
    return Math.min(100, Number((val * 100n) / maxBig));
  }

  return (
    <>
      <PageHeading
        eyebrow="Inteligência financeira"
        title="Relatórios Executivos e Exportação CSV"
        subtitle="Indicadores operacionais por evento, produtor e competência mensal, calculados diretamente das vendas, títulos e repasses registrados."
        action={
          <div className="flex flex-wrap gap-2">
            <a
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              href={`/api/inteligencia/relatorios?${params}&formato=csv`}
            >
              <Download size={15} />
              Exportar Relatório CSV
            </a>
          </div>
        }
      />

      {/* Presets rápidos de relatório */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["EVENT", "DRE Operacional por Evento"],
              ["PRODUCER", "Posição Consolidada por Produtor"],
              ["MONTH", "Evolução Mensal (Competência)"],
            ] as const
          ).map(([gKey, gLabel]) => (
            <Button
              key={gKey}
              size="sm"
              variant={group === gKey ? "default" : "outline"}
              onClick={() => apply(gKey, start, end)}
            >
              {gLabel}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => apply(group, dateOffset(30), dateOffset(0))}
          >
            Últimos 30 dias
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => apply(group, dateOffset(90), dateOffset(0))}
          >
            Últimos 90 dias
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => apply(group, `${new Date().getFullYear()}-01-01`, dateOffset(0))}
          >
            Ano atual
          </Button>
        </div>
      </div>

      <Card className="mb-5 grid gap-3 p-5 md:grid-cols-6">
        <label className="text-xs font-semibold text-slate-600">
          Início
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Fim
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Produtor
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
            value={producerId}
            onChange={(e) => {
              setProducer(e.target.value);
              setEvent("");
            }}
          >
            <option value="">Todos autorizados</option>
            {catalog.data?.producers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Evento
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
            value={eventId}
            onChange={(e) => setEvent(e.target.value)}
          >
            <option value="">Todos autorizados</option>
            {catalog.data?.events
              .filter((e) => !producerId || e.producerId === producerId)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Agrupar
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="EVENT">Por evento</option>
            <option value="PRODUCER">Por produtor</option>
            <option value="MONTH">Por mês</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button onClick={() => apply()}>Aplicar</Button>
          <a
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold"
            href={`/api/inteligencia/relatorios?${params}&formato=csv`}
          >
            <Download size={15} />
            CSV
          </a>
        </div>
      </Card>

      {error && <ErrorNotice message={error} retry={reload} />}
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="mb-5 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              {[
                ["Vendas brutas", data.total.grossCents],
                ["Direitos do produtor", data.total.producerCents],
                ["Direitos liquidados", data.total.settledCents],
                ["Repasses realizados", data.total.paidCents],
                ...(data.informationalOnly
                  ? []
                  : ([
                      ["Receita própria SOUL", data.total.diskCents],
                      ["Custos MDR", data.total.mdrCents],
                    ] as [string, string][])),
              ].map(([label, value]) => (
                <Card key={label} className="p-5">
                  <p className="mb-2 text-xs font-semibold text-slate-500">{label}</p>
                  <p className="text-2xl font-bold text-slate-950">{currency(value)}</p>
                </Card>
              ))}
            </div>
            <Card className="mb-5 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold">
                  <BarChart3 size={18} />
                  Comparativo de vendas brutas ({data.rows.length} dimensão(ões))
                </div>
                <Badge tone="neutral">
                  {group === "EVENT"
                    ? "Agrupado por Evento"
                    : group === "PRODUCER"
                    ? "Agrupado por Produtor"
                    : "Agrupado por Competência Mensal"}
                </Badge>
              </div>
              {data.rows.length ? (
                data.rows.slice(0, 25).map((row) => (
                  <div
                    key={row.key}
                    className="mb-3 grid grid-cols-[160px_1fr_120px] items-center gap-3 text-xs"
                  >
                    <span className="truncate font-medium" title={row.label}>
                      {row.label}
                    </span>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-800"
                        style={{
                          width: `${barWidthPct(row.grossCents)}%`,
                        }}
                      />
                    </div>
                    <span className="text-right font-semibold tabular-nums">
                      {currency(row.grossCents)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Empty text="Sem vendas registradas no período informado." />
                  {!data.informationalOnly && (
                    <Link href="/vendas">
                      <Button variant="outline" size="sm">
                        Registrar venda em Vendas por Evento <ArrowRight size={14} className="ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </Card>
            <Card className="overflow-x-auto">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Dimensão</th>
                    <th>Vendas</th>
                    <th>Bruto</th>
                    <th>Produtor</th>
                    <th>Liquidado</th>
                    <th>Repasses</th>
                    <th>Em análise</th>
                    {!data.informationalOnly && (
                      <>
                        <th>Receita SOUL</th>
                        <th>MDR</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.key}>
                      <td className="font-semibold">{row.label}</td>
                      <td>{row.quantity}</td>
                      <td className="font-semibold">{currency(row.grossCents)}</td>
                      <td>{currency(row.producerCents)}</td>
                      <td className="text-emerald-700 font-semibold">{currency(row.settledCents)}</td>
                      <td>{currency(row.paidCents)}</td>
                      <td>{currency(row.committedCents)}</td>
                      {!data.informationalOnly && (
                        <>
                          <td className="text-sky-800 font-semibold">{currency(row.diskCents)}</td>
                          <td className="text-amber-800">{currency(row.mdrCents)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.rows.length && <Empty />}
            </Card>
            <p className="mt-4 text-xs text-slate-500">{data.note}</p>
          </>
        )
      )}
    </>
  );
}

type Alert = {
  key: string;
  kind: string;
  severity: string;
  message: string;
  date?: string;
  acknowledged: boolean;
};

export function AlertsPage() {
  const { data, error, loading, reload } = useApi<{ items: Alert[]; mode: string }>(
    "/api/inteligencia/alertas"
  );
  const [saving, setSaving] = useState("");
  const [actionError, setActionError] = useState("");
  async function ack(item: Alert) {
    setSaving(item.key);
    setActionError("");
    try {
      await api("/api/inteligencia/alertas", {
        method: "POST",
        body: JSON.stringify({ key: item.key, acknowledged: !item.acknowledged }),
      });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving("");
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Inteligência financeira"
        title="Central de Alertas e Pendências Operacionais"
        subtitle="Identifica automaticamente pendências de vencimento, conciliação, repasses e riscos quando a tela é consultada."
        action={
          <Button variant="outline" onClick={reload}>
            <RefreshCw size={15} />
            Atualizar
          </Button>
        }
      />
      {error && <ErrorNotice message={error} retry={reload} />}
      {actionError && <ErrorNotice message={actionError} />}
      {loading ? (
        <Loading />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 p-5 font-semibold">
            <BellRing size={18} />
            Alertas identificados ({data?.items.length ?? 0})
          </div>
          {data?.items.length ? (
            data.items.map((i) => (
              <div
                key={i.key}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-4"
              >
                <div className="flex items-start gap-3">
                  <ShieldAlert
                    className={i.severity === "ALTA" ? "text-red-600" : "text-amber-600"}
                    size={19}
                  />
                  <div>
                    <p className="font-semibold text-slate-900">{i.kind}</p>
                    <p className="text-sm text-slate-600">{i.message}</p>
                    <p className="text-xs text-slate-400">{i.date && displayDateTime(i.date)}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving === i.key}
                  onClick={() => ack(i)}
                >
                  {i.acknowledged ? "Desmarcar leitura" : "Confirmar leitura"}
                </Button>
              </div>
            ))
          ) : (
            <Empty text="Nenhum alerta identificado nos limites configurados." />
          )}
        </Card>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Limite de 100 ocorrências por categoria. Nenhum disparo externo de e-mail ou WhatsApp é executado.
      </p>
    </>
  );
}
