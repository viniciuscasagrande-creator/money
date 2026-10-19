"use client";

import { useState } from "react";
import { BarChart3, Download, RefreshCw, ShieldAlert, BellRing } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageHeading,
  Empty,
  ErrorNotice,
  Loading,
  useApi,
  api,
  displayDateTime,
} from "@/components/financeiro/shared";

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

  function apply() {
    const p = new URLSearchParams({ inicio: start, fim: end, agrupar: group });
    if (producerId) p.set("produtorId", producerId);
    if (eventId) p.set("eventoId", eventId);
    setParams(p.toString());
  }

  const chartRows = (data?.rows ?? []).slice(0, 20).map((r) => ({
    name: r.label.length > 18 ? `${r.label.slice(0, 18)}…` : r.label,
    brutoReais: Number(BigInt(r.grossCents || "0")) / 100,
    produtorReais: Number(BigInt(r.producerCents || "0")) / 100,
    grossFormatted: currency(r.grossCents),
    producerFormatted: currency(r.producerCents),
  }));

  return (
    <>
      <PageHeading
        eyebrow="Pacote 04 · Inteligência Financeira BankOS"
        title="Relatórios Executivos & BI"
        subtitle="Indicadores por produtor, evento e período, calculados a partir das movimentações registradas no razão. Valores sem simulações."
      />
      <Card className="mb-6 grid gap-3 p-5 md:grid-cols-6">
        <label className="text-xs font-bold uppercase tracking-wider text-[#47505A]">
          Início
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-[#47505A]">
          Fim
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-[#47505A]">
          Produtor
          <select
            className="mt-1 h-10 w-full rounded-xl border border-[#BBBFC5]/80 bg-white px-2.5 text-sm text-[#0F1113]"
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
        <label className="text-xs font-bold uppercase tracking-wider text-[#47505A]">
          Evento
          <select
            className="mt-1 h-10 w-full rounded-xl border border-[#BBBFC5]/80 bg-white px-2.5 text-sm text-[#0F1113]"
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
        <label className="text-xs font-bold uppercase tracking-wider text-[#47505A]">
          Agrupar
          <select
            className="mt-1 h-10 w-full rounded-xl border border-[#BBBFC5]/80 bg-white px-2.5 text-sm text-[#0F1113]"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="EVENT">Por evento</option>
            <option value="PRODUCER">Por produtor</option>
            <option value="MONTH">Por mês</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button onClick={apply}>Aplicar</Button>
          <a
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#BBBFC5]/80 bg-white px-3.5 text-xs font-bold text-[#0F1113] transition-colors hover:border-[#0F1113]"
            href={`/api/inteligencia/relatorios?${params}&formato=csv`}
          >
            <Download size={15} className="text-[#E03629]" />
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
            <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              {(
                [
                  ["Vendas brutas", data.total.grossCents, true],
                  ["Direitos do produtor", data.total.producerCents, false],
                  ["Direitos liquidados", data.total.settledCents, false],
                  ["Repasses realizados", data.total.paidCents, false],
                  ...(data.informationalOnly
                    ? []
                    : [
                        ["Receita própria da Disk", data.total.diskCents, false],
                        ["Custos MDR", data.total.mdrCents, false],
                      ]),
                ] as [string, string | undefined, boolean][]
              ).map(([label, value, highlight]) => (
                <Card
                  key={label}
                  className={
                    highlight
                      ? "border-[#0F1113] bg-[#0F1113] p-5 text-white"
                      : "p-5"
                  }
                >
                  <p
                    className={`mb-2 text-xs font-bold uppercase tracking-wider ${
                      highlight ? "text-[#BBBFC5]" : "text-[#47505A]"
                    }`}
                  >
                    {label}
                  </p>
                  <p
                    className={`font-mono text-2xl font-bold ${
                      highlight ? "text-white" : "text-[#0F1113]"
                    }`}
                  >
                    {currency(value)}
                  </p>
                </Card>
              ))}
            </div>

            <Card className="mb-6 p-6">
              <div className="mb-4 flex items-center gap-2 font-bold text-[#0F1113]">
                <BarChart3 size={18} className="text-[#E03629]" />
                Comparativo Recharts: Vendas Brutas × Direitos do Produtor
              </div>
              {chartRows.length ? (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EBEBED" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "#47505A", fontSize: 11, fontWeight: 600 }}
                        axisLine={{ stroke: "#BBBFC5" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#47505A", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `R$ ${v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0F1113",
                          borderColor: "#47505A",
                          borderRadius: "12px",
                          color: "#FFFFFF",
                          fontSize: "12px",
                        }}
                      />
                      <Bar
                        dataKey="brutoReais"
                        name="Bruto (R$)"
                        fill="#0F1113"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={42}
                      />
                      <Bar
                        dataKey="produtorReais"
                        name="Direito Produtor (R$)"
                        fill="#E03629"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={42}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty text="Sem vendas no período informado." />
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
                        <th>Disk</th>
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
                      <td className="font-mono font-semibold">{currency(row.grossCents)}</td>
                      <td className="font-mono">{currency(row.producerCents)}</td>
                      <td className="font-mono">{currency(row.settledCents)}</td>
                      <td className="font-mono">{currency(row.paidCents)}</td>
                      <td className="font-mono">{currency(row.committedCents)}</td>
                      {!data.informationalOnly && (
                        <>
                          <td className="font-mono">{currency(row.diskCents)}</td>
                          <td className="font-mono">{currency(row.mdrCents)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.rows.length && <Empty />}
            </Card>
            <p className="mt-4 text-xs text-[#47505A]">{data.note}</p>
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

  async function ack(item: Alert) {
    setSaving(item.key);
    try {
      await api("/api/inteligencia/alertas", {
        method: "POST",
        body: JSON.stringify({ key: item.key, acknowledged: !item.acknowledged }),
      });
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving("");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Pacote 04 · Monitoramento Operacional BankOS"
        title="Central de Alertas & Pendências"
        subtitle="Identifica automaticamente pendências quando a tela é consultada. Confirmar leitura não resolve nem encerra uma ocorrência."
        action={
          <Button variant="outline" onClick={reload}>
            <RefreshCw size={15} className="text-[#E03629]" />
            Atualizar
          </Button>
        }
      />
      {error && <ErrorNotice message={error} retry={reload} />}
      {loading ? (
        <Loading />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#EBEBED] bg-[#0F1113] px-6 py-4 text-white">
            <div className="flex items-center gap-2.5 font-bold">
              <BellRing size={18} className="text-[#E03629]" />
              Alertas operacionais identificados ({data?.items.length ?? 0})
            </div>
            <span className="rounded-full bg-[#E03629] px-2.5 py-0.5 text-xs font-bold text-white">
              Tempo Real
            </span>
          </div>
          {data?.items.length ? (
            data.items.map((i) => (
              <div
                key={i.key}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EBEBED] p-5 transition-colors hover:bg-[#EBEBED]/40"
              >
                <div className="flex items-start gap-3.5">
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      i.severity === "ALTA"
                        ? "bg-[#E03629]/15 text-[#E03629]"
                        : "bg-[#EBEBED] text-[#0F1113]"
                    }`}
                  >
                    <ShieldAlert size={18} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-[#0F1113]">{i.kind}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          i.severity === "ALTA"
                            ? "bg-[#E03629] text-white"
                            : "bg-[#EBEBED] text-[#47505A]"
                        }`}
                      >
                        {i.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#47505A]">{i.message}</p>
                    <p className="mt-1 text-xs text-[#47505A]/80">
                      {i.date && displayDateTime(i.date)}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={i.acknowledged ? "outline" : "default"}
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
      <p className="mt-3 text-xs text-[#47505A]">
        Limite de 100 ocorrências por categoria. Nenhum disparo externo de e-mail ou WhatsApp é
        executado.
      </p>
    </>
  );
}
