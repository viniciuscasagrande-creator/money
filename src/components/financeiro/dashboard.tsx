"use client";
import Link from "next/link";
import {
  ArrowDownLeft, ArrowDownToLine, ArrowRight, ArrowUpRight, ArrowUpFromLine,
  CalendarDays, CheckCircle2, ChevronRight, CircleAlert, Clock3, CreditCard,
  HandCoins, Layers3, ListChecks, LockKeyhole, RefreshCw, TrendingUp,
  Wallet, type LucideIcon
} from "lucide-react";
import { ErrorNotice, Loading, StatusBadge, displayDate, useApi, type Title } from "@/components/financeiro/shared";
import { fmtBRL } from "@/lib/money";

type Metrics = {
  saldoBancarioCents: string | null; contasBancarias: number | null;
  receberPendenteCents: string; pagarPendenteCents: string;
  recebimentosLiquidadosCents: string; pagamentosLiquidadosCents: string;
  eventos: number; titulosEmAberto: number;
  direitosProdutorCents?: string; recebidoProdutorCents?: string;
  comprometidoProdutorCents?: string; repasseDisponivelCents?: string;
};
type TrendMonth = { label: string; receivedCents: string; paidCents: string };
type Data = { metrics: Metrics; latest: Title[]; trend: TrendMonth[]; informationalOnly: boolean };
type MetricCard = { label: string; value: string; supporting: string; Icon: LucideIcon; tone: "coral" | "blue" | "green" | "violet"; href: string };

/** Calcula altura sem converter valores financeiros BigInt para Number. */
function heightPct(cents: string, max: bigint): number {
  if (max <= 0n) return 0;
  const number = BigInt(cents);
  if (number <= 0n) return 0;
  return Number((number * 100n) / max);
}

function FinancialTrend({ months }: { months: TrendMonth[] }) {
  const maximum = months.reduce((value, item) => {
    const current = [BigInt(item.receivedCents), BigInt(item.paidCents)];
    return current.reduce((max, cents) => cents > max ? cents : max, value);
  }, 0n);
  const hasData = maximum > 0n;
  const totalReceived = months.reduce((sum, month) => sum + BigInt(month.receivedCents), 0n);
  const totalPaid = months.reduce((sum, month) => sum + BigInt(month.paidCents), 0n);
  return <section className="fintech-panel min-w-0 overflow-hidden p-5 sm:p-7" aria-labelledby="trend-title">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div><p className="fintech-eyebrow">MOVIMENTAÇÃO FINANCEIRA</p><h2 id="trend-title" className="mt-1 text-[19px] font-bold tracking-[-.035em] text-[#222126]">Entradas e saídas</h2><p className="mt-1 text-xs text-[#979196]">Liquidações efetivamente registradas nos últimos seis meses</p></div>
      <span className="rounded-full border border-[#eae5e3] bg-[#faf9f8] px-3 py-1.5 text-[11px] font-semibold text-[#615d62]">Últimos 6 meses</span>
    </div>
    <div className="mb-5 flex flex-wrap gap-4 text-[11px] font-medium text-[#7c777b]">
      <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#f16f64]"/>Entradas <strong className="font-bold text-[#343137]">{fmtBRL(totalReceived)}</strong></span>
      <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#36323a]"/>Saídas <strong className="font-bold text-[#343137]">{fmtBRL(totalPaid)}</strong></span>
    </div>
    <div className="relative h-[235px] px-1" role="img" aria-label={hasData ? "Comparativo mensal das entradas e saídas liquidadas. Valores apresentados também na legenda dos meses." : "Sem liquidações no período."}>
      <div className="pointer-events-none absolute inset-x-1 inset-y-4 flex flex-col justify-between" aria-hidden="true">{[1, 2, 3, 4].map(line => <div key={line} className="border-t border-dashed border-[#eeecec]"/>)}</div>
      <div className="relative grid h-full grid-cols-6 items-end gap-1.5 sm:gap-3">
        {months.map((month, index) => <div key={`${index}-${month.label}`} className="group flex h-full min-w-0 flex-col items-center justify-end gap-2">
          <div className="flex h-[192px] w-full max-w-16 items-end justify-center gap-1.5 sm:gap-2" title={`${month.label}: entradas ${fmtBRL(month.receivedCents)}, saídas ${fmtBRL(month.paidCents)}`}>
            <div className="fintech-chart-bar fintech-chart-in" style={{ height: `${heightPct(month.receivedCents, maximum)}%` }}/>
            <div className="fintech-chart-bar fintech-chart-out" style={{ height: `${heightPct(month.paidCents, maximum)}%` }}/>
          </div>
          <span className="text-[11px] font-semibold capitalize text-[#827e81]">{month.label}</span>
        </div>)}
      </div>
      {!hasData && <div className="pointer-events-none absolute left-0 right-0 top-16 flex flex-col items-center gap-2 text-center text-[#a29ca0]"><TrendingUp size={27} strokeWidth={1.3}/><p className="max-w-60 text-xs leading-5">Os gráficos aparecerão quando houver liquidações registradas.</p></div>}
    </div>
  </section>;
}

function QuickAction({ href, Icon, title, subtitle }: { href: string; Icon: LucideIcon; title: string; subtitle: string }) {
  return <Link href={href} className="fintech-quick-action group"><span className="fintech-quick-icon"><Icon size={19} strokeWidth={1.8}/></span><span className="min-w-0 flex-1"><span className="block text-[12px] font-bold text-[#37333a]">{title}</span><span className="mt-0.5 block text-[11px] text-[#a09a9d]">{subtitle}</span></span><ChevronRight size={16} className="text-[#b1acaf] transition group-hover:translate-x-0.5 group-hover:text-[#e35c50]"/></Link>;
}

export function DashboardView() {
  const { data, error, loading, reload } = useApi<Data>("/api/dashboard");
  const m = data?.metrics;
  const producer = data?.informationalOnly ?? false;
  const title = producer ? "Seu financeiro, em um só lugar." : "Seu financeiro, sob controle.";
  const cards: MetricCard[] = !m ? [] : producer ? [
    { label: "Direitos do produtor", value: fmtBRL(m.direitosProdutorCents ?? "0"), supporting: "Apurados conforme regras de cada evento", Icon: HandCoins, tone: "blue", href: "/saldos" },
    { label: "Disponível para solicitar", value: fmtBRL(m.repasseDisponivelCents ?? "0"), supporting: "Sujeito a aprovação e disponibilidade", Icon: Wallet, tone: "green", href: "/repasses" },
    { label: "Reservado ou baixado", value: fmtBRL(m.comprometidoProdutorCents ?? "0"), supporting: "Repasses e antecipações registrados", Icon: LockKeyhole, tone: "coral", href: "/repasses" },
    { label: "Meus eventos", value: String(m.eventos), supporting: "Eventos vinculados ao seu perfil", Icon: CalendarDays, tone: "violet", href: "/saldos" }
  ] : [
    { label: "Recebíveis em aberto", value: fmtBRL(m.receberPendenteCents), supporting: "Aguardando liquidação", Icon: ArrowDownToLine, tone: "blue", href: "/recebimentos" },
    { label: "Contas a pagar", value: fmtBRL(m.pagarPendenteCents), supporting: "Compromissos pendentes", Icon: ArrowUpFromLine, tone: "coral", href: "/pagamentos" },
    { label: "Entradas liquidadas", value: fmtBRL(m.recebimentosLiquidadosCents), supporting: "Recebimentos confirmados", Icon: ArrowDownLeft, tone: "green", href: "/recebimentos" },
    { label: "Eventos monitorados", value: String(m.eventos), supporting: "Eventos no escopo autorizado", Icon: CalendarDays, tone: "violet", href: "/relatorios" }
  ];
  const heroValue = m ? (producer ? fmtBRL(m.repasseDisponivelCents ?? "0") : fmtBRL(m.saldoBancarioCents ?? "0")) : "R$ 0,00";

  return <div className="fintech-dashboard">
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em] text-[#e4655b]"><span className="h-1.5 w-1.5 rounded-full bg-[#e4655b]"/>PAINEL FINANCEIRO</div><h1 className="text-[30px] font-bold tracking-[-.065em] text-[#252227] sm:text-[35px]">Visão geral</h1><p className="mt-1.5 text-[13px] text-[#8f898e]">{title} Indicadores atualizados a partir dos registros existentes.</p></div>
      <button type="button" onClick={reload} disabled={loading} className="fintech-outline-button"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Atualizar dados</button>
    </div>

    {error && <ErrorNotice message={error} retry={reload}/>}
    {loading && !data && <div className="fintech-panel mb-6"><Loading label="Carregando informações financeiras..."/></div>}
    {data && m && <>
      <div className="mb-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <section className="fintech-hero relative min-h-[253px] overflow-hidden rounded-[24px] p-6 text-white sm:p-8">
          <div className="fintech-hero-orbit fintech-hero-orbit-one"/><div className="fintech-hero-orbit fintech-hero-orbit-two"/><div className="fintech-hero-glow"/>
          <div className="relative z-10 flex h-full flex-col justify-between gap-8">
            <div className="flex items-start justify-between gap-2"><div><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[.07] px-3 py-1.5 text-[10px] font-semibold tracking-wide text-white/75"><span className="h-1.5 w-1.5 rounded-full bg-[#ff867c]"/>{producer ? "VISÃO DO PRODUTOR" : "CONSOLIDADO INTERNO"}</div><p className="text-[13px] font-medium text-white/65">{producer ? "Elegível para solicitar repasse" : "Saldo bancário consolidado"}</p><p className="mt-2 text-[39px] font-bold leading-tight tracking-[-.06em] sm:text-[46px]" data-testid="hero-balance">{heroValue}</p></div><div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10"><Wallet size={21}/></div></div>
            <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-2 text-xs text-white/65"><CheckCircle2 size={15} className="text-[#ff877a]"/>{producer ? "Valores sujeitos às aprovações financeiras" : `${m.contasBancarias ?? 0} conta(s) bancária(s) ativa(s)`}</div><Link href={producer ? "/repasses" : "/saldos"} className="flex items-center gap-1.5 text-xs font-bold text-white hover:text-[#ffaba4]">{producer ? "Minhas solicitações" : "Ver posições financeiras"}<ArrowUpRight size={15}/></Link></div>
          </div>
        </section>
        <section className="fintech-spotlight fintech-panel flex min-h-[253px] flex-col justify-between p-6 sm:p-7">
          <div className="flex items-center justify-between"><span className="fintech-eyebrow">RESUMO OPERACIONAL</span><span className="fintech-spotlight-icon"><ListChecks size={21}/></span></div>
          <div><p className="text-[44px] font-bold leading-none tracking-[-.06em] text-[#28252a]">{m.titulosEmAberto}</p><p className="mt-2 text-[14px] font-semibold text-[#4e474b]">Título(s) em aberto</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#a29b9e]">Pendências registradas no seu escopo de acesso.</p></div>
          <Link href={producer ? "/repasses" : "/recebimentos"} className="flex w-fit items-center gap-2 text-xs font-bold text-[#e15f56]">Acompanhar operações<ArrowRight size={15}/></Link>
        </section>
      </div>

      {producer && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#fae4d8] bg-[#fff8f3] p-4 text-xs leading-5 text-[#8f6053]"><CircleAlert size={17} className="mt-0.5 shrink-0"/>Os valores representam posições e obrigações calculadas. Não correspondem automaticamente a dinheiro liberado em conta; repasses dependem das regras e aprovações.</div>}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">{cards.map(({ label, value, supporting, Icon, tone, href }) => <Link href={href} key={label} className="fintech-metric-card group"><div className="flex items-start justify-between gap-2"><span className="text-[12px] font-semibold text-[#8d8589]">{label}</span><span className={`fintech-metric-icon fintech-metric-${tone}`}><Icon size={19} strokeWidth={1.8}/></span></div><div><p className="break-words text-[25px] font-bold tracking-[-.055em] text-[#262329] sm:text-[27px]">{value}</p><p className="mt-2 text-[11px] text-[#a19a9d]">{supporting}</p></div><ArrowUpRight size={14} className="absolute bottom-5 right-5 text-[#c4bbbe] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#e0645a]"/></Link>)}</div>

      <div className="mb-5 grid items-stretch gap-5 xl:grid-cols-[1.75fr_1fr]">
        <FinancialTrend months={data.trend ?? []}/>
        <section className="fintech-panel min-w-0 p-5 sm:p-7"><div className="mb-6"><p className="fintech-eyebrow">ATALHOS</p><h2 className="mt-1 text-[19px] font-bold tracking-[-.035em] text-[#222126]">Acesso rápido</h2><p className="mt-1 text-xs text-[#979196]">Suas operações mais importantes</p></div><div className="space-y-2">
          {producer ? <><QuickAction href="/repasses" Icon={HandCoins} title="Solicitar repasse" subtitle="Acompanhar solicitações"/><QuickAction href="/saldos" Icon={Layers3} title="Saldos por evento" subtitle="Consultar disponibilidade"/><QuickAction href="/recebimentos" Icon={ArrowDownToLine} title="Meus recebíveis" subtitle="Consultar histórico"/></> : <><QuickAction href="/recebimentos" Icon={ArrowDownToLine} title="Recebimentos" subtitle="Consultar e registrar títulos"/><QuickAction href="/pagamentos" Icon={ArrowUpFromLine} title="Pagamentos" subtitle="Acompanhar vencimentos"/><QuickAction href="/repasses" Icon={HandCoins} title="Repasses" subtitle="Solicitações e aprovações"/><QuickAction href="/conciliacao" Icon={CreditCard} title="Conciliação" subtitle="Conferir divergências"/></>}
        </div></section>
      </div>

      <section className="fintech-panel overflow-hidden" aria-labelledby="mov-title"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0eceb] p-5 sm:px-7 sm:py-6"><div><p className="fintech-eyebrow">ATIVIDADE RECENTE</p><h2 id="mov-title" className="mt-1 text-[19px] font-bold tracking-[-.035em] text-[#222126]">Últimas movimentações</h2></div><Link href="/recebimentos" className="flex items-center gap-1.5 text-xs font-bold text-[#e06359]">Consultar títulos<ArrowRight size={15}/></Link></div>
        {data.latest.length === 0 ? <div className="flex flex-col items-center justify-center gap-3 px-5 py-12 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f7f3f2] text-[#d8bbb8]"><Clock3 size={23}/></div><p className="text-sm font-semibold text-[#484347]">Nenhuma movimentação registrada</p><p className="max-w-sm text-xs leading-5 text-[#999296]">As operações aparecerão aqui assim que forem cadastradas no sistema.</p></div> : <div className="divide-y divide-[#f4f0ef]">{data.latest.map(item => <div key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-[#fdfbf9] sm:px-7"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${item.kind === "RECEIVABLE" ? "bg-[#eaf7f3] text-[#279d79]" : "bg-[#fff0ed] text-[#e86c5f]"}`}>{item.kind === "RECEIVABLE" ? <ArrowDownLeft size={19}/> : <ArrowUpRight size={19}/>}</div><div className="min-w-[140px] flex-1"><p className="truncate text-[13px] font-bold text-[#39343a]">{item.description}</p><p className="mt-0.5 text-[11px] text-[#9b9597]">{item.kind === "RECEIVABLE" ? "Recebimento" : "Pagamento"} · {displayDate(item.createdAt)}</p></div><div className="text-right"><p className="whitespace-nowrap text-[13px] font-bold tabular-nums text-[#302c31]">{item.kind === "PAYABLE" ? "− " : "+ "}{fmtBRL(item.amountCents)}</p><div className="mt-1"><StatusBadge status={item.status}/></div></div></div>)}</div>}
      </section>
      <p className="mt-5 flex items-center gap-2 text-[11px] text-[#a19b9e]"><LockKeyhole size={12}/>Visibilidade limitada ao seu perfil. Sem valores demonstrativos.</p>
    </>}
  </div>;
}
