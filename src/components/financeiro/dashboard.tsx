"use client";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Wallet, CalendarDays, CircleAlert, ArrowRight, Building2, HandCoins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, ErrorNotice, Loading, PageHeading, StatusBadge, displayDate, useApi, type Title } from "@/components/financeiro/shared";
import { fmtBRL } from "@/lib/money";
type Data = { metrics: { saldoBancarioCents: string | null; contasBancarias: number | null; receberPendenteCents: string; pagarPendenteCents: string; recebimentosLiquidadosCents: string; pagamentosLiquidadosCents: string; eventos: number; titulosEmAberto: number; direitosProdutorCents?: string; recebidoProdutorCents?: string; comprometidoProdutorCents?: string; repasseDisponivelCents?: string }; latest: Title[]; informationalOnly: boolean };
export function DashboardView() {
  const { data, loading, error, reload } = useApi<Data>("/api/dashboard");
  const producer = data?.informationalOnly;
  const m = data?.metrics;
  const cards = m ? [
    ...(!producer ? [{ label: "Saldo bancário consolidado", value: fmtBRL(m.saldoBancarioCents || "0"), hint: `${m.contasBancarias} contas cadastradas`, Icon: Wallet, tone: "text-blue-800 bg-blue-50" }] : []),
    ...(producer ? [
      { label: "Direitos de receita por evento", value: fmtBRL(m.direitosProdutorCents || "0"), hint: "Parcela do produtor nas vendas registradas", Icon: HandCoins, tone: "text-sky-700 bg-sky-50" },
      { label: "Elegível para repasse", value: fmtBRL(m.repasseDisponivelCents || "0"), hint: "Após recebimento e reservas de solicitações", Icon: Wallet, tone: "text-emerald-700 bg-emerald-50" },
      { label: "Reservado ou já baixado", value: fmtBRL(m.comprometidoProdutorCents || "0"), hint: "Repasses e antecipações", Icon: ArrowUpFromLine, tone: "text-amber-700 bg-amber-50" }
    ] : []),
    ...(!producer ? [{ label: "Recebíveis em aberto", value: fmtBRL(m.receberPendenteCents), hint: "Aguardando recebimento", Icon: ArrowDownToLine, tone: "text-sky-700 bg-sky-50" },
    { label: "Pagamentos em aberto", value: fmtBRL(m.pagarPendenteCents), hint: "Aguardando pagamento", Icon: ArrowUpFromLine, tone: "text-amber-700 bg-amber-50" },
    { label: "Recebimentos liquidados", value: fmtBRL(m.recebimentosLiquidadosCents), hint: "Valor total registrado", Icon: Building2, tone: "text-emerald-700 bg-emerald-50" },
    { label: "Eventos cadastrados", value: String(m.eventos), hint: "Eventos do escopo autorizado", Icon: CalendarDays, tone: "text-violet-700 bg-violet-50" }
    ] : [{ label: "Eventos cadastrados", value: String(m.eventos), hint: "Seus eventos", Icon: CalendarDays, tone: "text-violet-700 bg-violet-50" }])
  ] : [];
  return <><PageHeading eyebrow="Centro financeiro" title="Dashboard Financeiro" subtitle={producer ? "Consulte obrigações calculadas para os seus eventos e acompanhe solicitações." : "Acompanhe caixa, títulos e movimentações das operações financeiras."} action={<Badge tone="blue">Pacote 02 · Operações</Badge>} />
    {producer && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"><CircleAlert size={17} className="mr-2 inline"/>Valores calculados a partir das vendas registradas e recebíveis liquidados; transferências dependem das aprovações e da disponibilidade bancária.</div>}
    {error && <ErrorNotice message={error} retry={reload}/>}{loading && <Loading/>}
    {data && <><div className="mb-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map(({ label, value, hint, Icon, tone }) => <Card key={label}><CardContent className="p-5"><div className="mb-5 flex items-start justify-between gap-3"><span className="text-sm font-medium text-slate-500">{label}</span><span className={`rounded-xl p-2.5 ${tone}`}><Icon size={20}/></span></div><p className="text-[28px] font-bold tracking-tight text-slate-900">{value}</p><p className="mt-2 text-xs text-slate-400">{hint}</p></CardContent></Card>)}</div>
      <div className="grid gap-5 xl:grid-cols-[1fr_290px]"><Card className="overflow-hidden"><CardHeader className="flex-row items-center justify-between"><CardTitle>Últimas movimentações</CardTitle><Link href="/recebimentos" className="flex items-center gap-1 text-xs font-semibold text-blue-800">Ver recebimentos <ArrowRight size={14}/></Link></CardHeader><div className="overflow-x-auto">{data.latest.length === 0 ? <Empty text="Nenhum título registrado. Cadastre um recebível ou um pagamento para iniciar."/> : <table className="dashboard-table"><thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Cadastro</th></tr></thead><tbody>{data.latest.map(t => <tr key={t.id}><td className="font-semibold">{t.description}</td><td>{t.kind === "RECEIVABLE" ? "Recebimento" : "Pagamento"}</td><td className="whitespace-nowrap font-semibold">{fmtBRL(t.amountCents)}</td><td><StatusBadge status={t.status}/></td><td>{displayDate(t.createdAt)}</td></tr>)}</tbody></table>}</div></Card>
      <Card><CardHeader><CardTitle>Resumo de pendências</CardTitle></CardHeader><CardContent className="space-y-5"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">Títulos em aberto</span><strong className="text-2xl">{m?.titulosEmAberto}</strong></div><div className="border-t border-slate-100 pt-4"><span className="text-xs text-slate-500">Pagamentos liquidados</span><p className="mt-2 text-xl font-bold">{fmtBRL(m?.pagamentosLiquidadosCents || "0")}</p></div><p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Valores provenientes do banco de dados. Sem indicadores pré-preenchidos ou simulação.</p></CardContent></Card></div>
    </>}
  </>;
}
