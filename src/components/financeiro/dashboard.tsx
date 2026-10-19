"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  CalendarDays,
  CircleAlert,
  ArrowRight,
  Building2,
  HandCoins,
  TrendingUp,
  GitCompareArrows,
  ShieldAlert,
  BarChart3,
  Layers3,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  ErrorNotice,
  Loading,
  PageHeading,
  StatusBadge,
  displayDate,
  useApi,
  type Title,
} from "@/components/financeiro/shared";
import { fmtBRL } from "@/lib/money";

type Data = {
  metrics: {
    saldoBancarioCents: string | null;
    contasBancarias: number | null;
    receberPendenteCents: string;
    pagarPendenteCents: string;
    recebimentosLiquidadosCents: string;
    pagamentosLiquidadosCents: string;
    eventos: number;
    titulosEmAberto: number;
    direitosProdutorCents?: string;
    recebidoProdutorCents?: string;
    comprometidoProdutorCents?: string;
    repasseDisponivelCents?: string;
  };
  latest: Title[];
  informationalOnly: boolean;
};

export function DashboardView() {
  const { data, loading, error, reload } = useApi<Data>("/api/dashboard");
  const producer = data?.informationalOnly;
  const m = data?.metrics;

  const cards = m
    ? [
        ...(!producer
          ? [
              {
                label: "Recebíveis em aberto",
                value: fmtBRL(m.receberPendenteCents),
                hint: "Títulos aguardando liquidação bancária",
                Icon: ArrowDownToLine,
                accent: "bg-[#0F1113] text-white",
              },
              {
                label: "Pagamentos em aberto",
                value: fmtBRL(m.pagarPendenteCents),
                hint: "Obrigações e despesas pendentes",
                Icon: ArrowUpFromLine,
                accent: "bg-[#E03629]/10 text-[#E03629]",
              },
              {
                label: "Recebimentos liquidados",
                value: fmtBRL(m.recebimentosLiquidadosCents),
                hint: "Créditos efetivados no razão",
                Icon: Building2,
                accent: "bg-emerald-50 text-emerald-700",
              },
              {
                label: "Eventos ativos no escopo",
                value: String(m.eventos),
                hint: `${m.titulosEmAberto} título(s) em aberto`,
                Icon: CalendarDays,
                accent: "bg-[#EBEBED] text-[#0F1113]",
              },
            ]
          : [
              {
                label: "Direitos de receita apurados",
                value: fmtBRL(m.direitosProdutorCents || "0"),
                hint: "Parcela do produtor nas vendas registradas",
                Icon: HandCoins,
                accent: "bg-[#0F1113] text-white",
              },
              {
                label: "Elegível para repasse",
                value: fmtBRL(m.repasseDisponivelCents || "0"),
                hint: "Após liquidação e reservas ativas",
                Icon: Wallet,
                accent: "bg-emerald-50 text-emerald-700",
              },
              {
                label: "Reservado ou já baixado",
                value: fmtBRL(m.comprometidoProdutorCents || "0"),
                hint: "Solicitações de repasse e antecipação",
                Icon: ArrowUpFromLine,
                accent: "bg-[#E03629]/10 text-[#E03629]",
              },
              {
                label: "Seus eventos vinculados",
                value: String(m.eventos),
                hint: "Escopo isolado do produtor",
                Icon: CalendarDays,
                accent: "bg-[#EBEBED] text-[#0F1113]",
              },
            ]),
      ]
    : [];

  // Série Recharts — calculada estritamente a partir dos centavos inteiros do banco (sem dados fictícios)
  const chartData = m
    ? !producer
      ? [
          {
            name: "Caixa Bancário",
            reais: Number(BigInt(m.saldoBancarioCents || "0")) / 100,
            formatted: fmtBRL(m.saldoBancarioCents || "0"),
            fill: "#0F1113",
          },
          {
            name: "Rec. Liquidados",
            reais: Number(BigInt(m.recebimentosLiquidadosCents || "0")) / 100,
            formatted: fmtBRL(m.recebimentosLiquidadosCents || "0"),
            fill: "#47505A",
          },
          {
            name: "Rec. em Aberto",
            reais: Number(BigInt(m.receberPendenteCents || "0")) / 100,
            formatted: fmtBRL(m.receberPendenteCents || "0"),
            fill: "#E03629",
          },
          {
            name: "Pag. em Aberto",
            reais: Number(BigInt(m.pagarPendenteCents || "0")) / 100,
            formatted: fmtBRL(m.pagarPendenteCents || "0"),
            fill: "#BBBFC5",
          },
          {
            name: "Pag. Liquidados",
            reais: Number(BigInt(m.pagamentosLiquidadosCents || "0")) / 100,
            formatted: fmtBRL(m.pagamentosLiquidadosCents || "0"),
            fill: "#0F1113",
          },
        ]
      : [
          {
            name: "Direitos Brutos",
            reais: Number(BigInt(m.direitosProdutorCents || "0")) / 100,
            formatted: fmtBRL(m.direitosProdutorCents || "0"),
            fill: "#0F1113",
          },
          {
            name: "Liquidados",
            reais: Number(BigInt(m.recebidoProdutorCents || "0")) / 100,
            formatted: fmtBRL(m.recebidoProdutorCents || "0"),
            fill: "#47505A",
          },
          {
            name: "Elegível Repasse",
            reais: Number(BigInt(m.repasseDisponivelCents || "0")) / 100,
            formatted: fmtBRL(m.repasseDisponivelCents || "0"),
            fill: "#E03629",
          },
          {
            name: "Reservado/Baixado",
            reais: Number(BigInt(m.comprometidoProdutorCents || "0")) / 100,
            formatted: fmtBRL(m.comprometidoProdutorCents || "0"),
            fill: "#BBBFC5",
          },
        ]
    : [];

  return (
    <>
      <PageHeading
        eyebrow="BankOS · Centro de Comando Financeiro"
        title="Dashboard Executivo & Posição de Liquidez"
        subtitle={
          producer
            ? "Consulte obrigações calculadas para os seus eventos e acompanhe solicitações de repasse e antecipação."
            : "Visão consolidada do razão financeiro único, contas bancárias, recebíveis, repasses, conciliação e governança."
        }
        action={
          <div className="flex items-center gap-2">
            <Badge tone="blue">BankOS Fintech Premium</Badge>
            <Badge tone="red">Pacotes 01–04 Ativos</Badge>
          </div>
        }
      />

      {producer && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#0F1113]/15 bg-white px-5 py-3.5 text-sm text-[#0F1113] shadow-xs">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E03629]/10 text-[#E03629]">
            <CircleAlert size={18} />
          </span>
          <span>
            Valores calculados a partir das vendas registradas e recebíveis liquidados; transferências
            dependem das aprovações em alçada e da disponibilidade bancária.
          </span>
        </div>
      )}

      {error && <ErrorNotice message={error} retry={reload} />}
      {loading && <Loading />}

      {data && m && (
        <>
          {/* HERO CARD BANKOS (#0F1113 GRAFITE + DESTAQUE #E03629) */}
          <div className="mb-6 grid gap-5 xl:grid-cols-[1.15fr_1.85fr]">
            <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#0F1113] p-6 text-white shadow-[0_16px_40px_rgba(15,17,19,0.16)]">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#E03629]/20 blur-2xl" />
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-[#BBBFC5]">
                  <span className="h-2 w-2 rounded-full bg-[#E03629]" />
                  {producer ? "Posição Líquida do Produtor" : "Posição Consolidada de Caixa"}
                </span>
                <Wallet size={20} className="text-[#E03629]" />
              </div>

              <p className="mt-5 font-mono text-3xl font-bold tracking-tight text-white md:text-4xl">
                {producer
                  ? fmtBRL(m.repasseDisponivelCents || "0")
                  : fmtBRL(m.saldoBancarioCents || "0")}
              </p>
              <p className="mt-1.5 text-xs text-[#BBBFC5]">
                {producer
                  ? "Saldo líquido elegível para solicitação imediata de repasse"
                  : `${m.contasBancarias ?? 0} conta(s) bancária(s) ativa(s) reconciliada(s) no razão`}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                <div>
                  <span className="text-[11px] text-[#BBBFC5]">
                    {producer ? "Direitos Liquidados" : "Recebimentos Liquidados"}
                  </span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-emerald-400">
                    {producer
                      ? fmtBRL(m.recebidoProdutorCents || "0")
                      : fmtBRL(m.recebimentosLiquidadosCents)}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-[#BBBFC5]">
                    {producer ? "Reservado / Repassado" : "Pagamentos Liquidados"}
                  </span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-white">
                    {producer
                      ? fmtBRL(m.comprometidoProdutorCents || "0")
                      : fmtBRL(m.pagamentosLiquidadosCents)}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={producer ? "/repasses" : "/contas"}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#E03629] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                >
                  {producer ? "Solicitar Repasse / Antecipação" : "Tesouraria & Contas"}
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href="/saldos"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/15"
                >
                  Conferir Razão
                </Link>
              </div>
            </div>

            {/* 4 KPI CARDS GRANDES BANKOS */}
            <div className="grid gap-4 sm:grid-cols-2">
              {cards.map(({ label, value, hint, Icon, accent }) => (
                <Card key={label} className="flex flex-col justify-between p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#47505A]">
                      {label}
                    </span>
                    <span className={`rounded-xl p-2.5 ${accent}`}>
                      <Icon size={18} />
                    </span>
                  </div>
                  <div className="mt-4">
                    <p className="font-mono text-[26px] font-bold tracking-tight text-[#0F1113]">
                      {value}
                    </p>
                    <p className="mt-1 text-xs text-[#47505A]">{hint}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* GRÁFICO RECHARTS DE COMPOSIÇÃO E TENDÊNCIAS + PENDÊNCIAS DE CONCILIAÇÃO E RISCO */}
          <div className="mb-6 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <Card>
              <CardHeader className="flex-row items-center justify-between border-b border-[#EBEBED] pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 size={18} className="text-[#E03629]" />
                    Visualização Analítica Recharts (Razão Real)
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-[#47505A]">
                    Comparativo das posições registradas no banco em tempo real (sem simulações)
                  </p>
                </div>
                <Link
                  href="/relatorios"
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#0F1113] hover:text-[#E03629]"
                >
                  Relatórios Executivos <ArrowRight size={13} />
                </Link>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
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
                        formatter={(_val, _name, item) => [
                          item?.payload?.formatted ?? "R$ 0,00",
                          "Valor no Razão",
                        ]}
                        contentStyle={{
                          backgroundColor: "#0F1113",
                          borderColor: "#47505A",
                          borderRadius: "12px",
                          color: "#FFFFFF",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="reais" radius={[8, 8, 0, 0]} maxBarSize={54}>
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* PAINEL DE CONTROLE, CONCILIAÇÃO E GOVERNANÇA */}
            <Card className="flex flex-col justify-between">
              <CardHeader className="border-b border-[#EBEBED] pb-4">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-[#E03629]" />
                  Resumo de Pendências & Controle
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div className="flex items-center justify-between rounded-2xl bg-[#EBEBED]/60 p-3.5">
                  <div>
                    <span className="text-xs font-semibold text-[#47505A]">Títulos em aberto</span>
                    <p className="text-[11px] text-[#47505A]">Aguardando baixa/liquidação</p>
                  </div>
                  <strong className="font-mono text-2xl font-bold text-[#0F1113]">
                    {m.titulosEmAberto}
                  </strong>
                </div>

                {!producer && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <Link
                      href="/conciliacao"
                      className="flex flex-col justify-between rounded-2xl border border-[#BBBFC5]/60 p-3 transition-colors hover:border-[#0F1113]"
                    >
                      <GitCompareArrows size={16} className="text-[#0F1113]" />
                      <span className="mt-2 text-xs font-bold text-[#0F1113]">Conciliação</span>
                      <span className="text-[10px] text-[#47505A]">Extratos × Razão</span>
                    </Link>
                    <Link
                      href="/ocorrencias"
                      className="flex flex-col justify-between rounded-2xl border border-[#E03629]/30 bg-[#E03629]/[0.04] p-3 transition-colors hover:border-[#E03629]"
                    >
                      <ShieldAlert size={16} className="text-[#E03629]" />
                      <span className="mt-2 text-xs font-bold text-[#0F1113]">Estornos & Risco</span>
                      <span className="text-[10px] text-[#47505A]">Bloqueios cautelares</span>
                    </Link>
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-2xl bg-[#0F1113] p-3.5 text-xs leading-relaxed text-[#BBBFC5]">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#E03629]" />
                  <span>
                    Valores provenientes do banco de dados relacional. Sem indicadores pré-preenchidos
                    ou simulação.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* TABELA DE ÚLTIMAS MOVIMENTAÇÕES */}
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between border-b border-[#EBEBED]">
              <div>
                <CardTitle>Últimas movimentações registradas</CardTitle>
                <p className="mt-0.5 text-xs text-[#47505A]">
                  Títulos financeiros mais recentes no escopo autorizado
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/recebimentos"
                  className="flex items-center gap-1 text-xs font-bold text-[#0F1113] hover:text-[#E03629]"
                >
                  Ver recebimentos <ArrowRight size={14} />
                </Link>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              {data.latest.length === 0 ? (
                <Empty text="Nenhum título registrado. Cadastre um recebível, venda ou pagamento para iniciar." />
              ) : (
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Tipo</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Cadastro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.latest.map((t) => (
                      <tr key={t.id}>
                        <td className="font-semibold text-[#0F1113]">{t.description}</td>
                        <td>
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#47505A]">
                            <Layers3 size={13} className="text-[#E03629]" />
                            {t.kind === "RECEIVABLE" ? "Recebimento" : "Pagamento"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap font-mono font-bold text-[#0F1113]">
                          {fmtBRL(t.amountCents)}
                        </td>
                        <td>
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="text-[#47505A]">{displayDate(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
