"use client";

import { use } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  FINANCIAL_MENUS,
  ARCHITECTURAL_RULES,
  findSubmenuById,
  type ImplementationPackage,
} from "@/config/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeading, useApi } from "@/components/financeiro/shared";
import { fmtBRL } from "@/lib/money";

const PACKAGE_LABELS: Record<ImplementationPackage, string> = {
  P1: "Pacote 01 · Fundação e Operação Básica",
  P2: "Pacote 02 · Operação de Ingressos e Repasses",
  P3: "Pacote 03 · Conciliação, Risco e Governança",
  P4: "Pacote 04 · Contábil, Fiscal, BI e Contratos",
};

type DashboardSummary = {
  metrics: {
    saldoBancarioCents: string | null;
    contasBancarias: number | null;
    receberPendenteCents: string;
    pagarPendenteCents: string;
    recebimentosLiquidadosCents: string;
    pagamentosLiquidadosCents: string;
    eventos: number;
    titulosEmAberto: number;
  };
  informationalOnly: boolean;
};

function getOperationalRouteForMenu(menuNumber: string, submenuCode: string): {
  href: string;
  ctaLabel: string;
  moduleName: string;
} {
  if (submenuCode === "02.04" || submenuCode === "02.09") {
    return {
      href: "/vendas",
      ctaLabel: "Abrir Vendas por Evento (Split e Recebíveis)",
      moduleName: "Vendas por Evento (Pacote 02)",
    };
  }
  if (submenuCode === "07.09" || submenuCode === "17.09") {
    return {
      href: "/integracao",
      ctaLabel: "Abrir Conector API de Ingressos",
      moduleName: "Integração de Ingressos & Webhooks",
    };
  }
  switch (menuNumber) {
    case "01":
      return {
        href: "/dashboard",
        ctaLabel: "Abrir Painel Executivo & Fluxo de Caixa",
        moduleName: "Dashboard Financeiro (Pacotes 01–03)",
      };
    case "02":
      return {
        href: "/recebimentos",
        ctaLabel: "Gerenciar Títulos e Liquidações de Recebíveis",
        moduleName: "Gestão de Recebimentos (Pacotes 01–03)",
      };
    case "03":
      return {
        href: "/pagamentos",
        ctaLabel: "Gerenciar Contas a Pagar e Liquidações",
        moduleName: "Contas a Pagar (Pacote 01)",
      };
    case "04":
      return {
        href: "/contas",
        ctaLabel: "Gerenciar Contas Bancárias e Tesouraria",
        moduleName: "Tesouraria e Bancos (Pacote 01)",
      };
    case "05":
      return {
        href: "/saldos",
        ctaLabel: "Conferir Posições por Produtor/Evento e Razão",
        moduleName: "Saldos e Posições Financeiras (Pacote 02–03)",
      };
    case "06":
    case "15":
      return {
        href: "/repasses",
        ctaLabel: "Gerenciar Solicitações, Alçadas, Aceite e Baixa",
        moduleName: "Repasses e Antecipações (Pacote 02)",
      };
    case "07":
      return {
        href: "/gateways",
        ctaLabel: "Gerenciar Gateways, Bandeiras e Regras MDR",
        moduleName: "Gateways e Bandeiras (Pacote 02)",
      };
    case "08":
      return {
        href: "/taxas",
        ctaLabel: "Configurar Taxas da Disk por Evento e Absorção MDR",
        moduleName: "Divisão de Receitas e Taxas (Pacote 02)",
      };
    case "09":
      return {
        href: "/conciliacao",
        ctaLabel: "Abrir Conciliação Bancária (Extratos × Razão)",
        moduleName: "Conciliação Bancária (Pacote 03)",
      };
    case "10":
      return {
        href: "/ocorrencias",
        ctaLabel: "Gerenciar Estornos, Chargebacks e Bloqueio Cautelar",
        moduleName: "Estornos, Chargebacks e Riscos (Pacote 03)",
      };
    case "11":
      return {
        href: "/planejamento",
        ctaLabel: "Gerenciar Orçamento de Receitas e Despesas por Evento",
        moduleName: "Planejamento Financeiro (Pacote 03)",
      };
    case "12":
      return {
        href: "/contratos",
        ctaLabel: "Gerenciar Contratos, Contrapartes e Vigências",
        moduleName: "Gestão de Contratos (Pacote 03)",
      };
    case "13":
    case "14":
      return {
        href: "/contabilidade",
        ctaLabel: "Abrir Pré-Classificação e Exportação Contábil CSV",
        moduleName: "Contabilidade e Exportação Assistida (Pacote 03)",
      };
    case "16":
      return {
        href: "/auditoria",
        ctaLabel: "Consultar Trilha de Auditoria Imutável",
        moduleName: "Auditoria e Governança (Pacotes 01–03)",
      };
    case "17":
      return {
        href: "/cadastros",
        ctaLabel: "Gerenciar Produtores, Eventos e Usuários",
        moduleName: "Configurações e Cadastros Financeiros",
      };
    default:
      return {
        href: "/dashboard",
        ctaLabel: "Ver Posição Consolidada no Núcleo Financeiro",
        moduleName: "Núcleo Financeiro Centralizado",
      };
  }
}

export default function SubmenuSpecificationWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data } = useApi<DashboardSummary>("/api/dashboard");

  const match = findSubmenuById(id);
  const foundMenu = match?.menu ?? FINANCIAL_MENUS[0];
  const foundSubmenu = match?.submenu ?? FINANCIAL_MENUS[0].submenus[0];

  const opLink = getOperationalRouteForMenu(foundMenu.number, foundSubmenu.code);
  const m = data?.metrics;

  return (
    <>
      <PageHeading
        eyebrow={`Menu ${foundMenu.number} · ${foundMenu.title} (${foundMenu.submenus.length} submenus)`}
        title={`${foundSubmenu.code} — ${foundSubmenu.title}`}
        subtitle={foundSubmenu.description}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                foundSubmenu.origin === "Acréscimo"
                  ? "green"
                  : foundSubmenu.origin === "Proposta"
                  ? "blue"
                  : "neutral"
              }
            >
              Origem: {foundSubmenu.origin}
            </Badge>
            <Badge tone="amber">{PACKAGE_LABELS[foundSubmenu.pkg]}</Badge>
          </div>
        }
      />

      {/* Navegação rápida entre os submenus irmãos do mesmo Menu Principal */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Submenus de {foundMenu.number}. {foundMenu.title} ({foundMenu.submenus.length})
          </span>
          <span className="text-[11px] text-slate-400">
            Doc: {foundMenu.docCount} · Acréscimos Ingressos: +{foundMenu.addedCount}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {foundMenu.submenus.map((sub) => {
            const active = sub.id === foundSubmenu.id;
            return (
              <Link
                key={sub.id}
                href={`/submenus/${sub.id}`}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="font-mono text-[10px] opacity-75">{sub.code}</span>
                <span>{sub.title}</span>
                {sub.origin === "Acréscimo" && (
                  <span
                    className={`rounded px-1 text-[9px] font-bold ${
                      active ? "bg-emerald-500/30 text-emerald-200" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    +ING
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Cards de Indicadores Reais do Razão Financeiro */}
      {m && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!data?.informationalOnly && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-500">Saldo Bancário Consolidado</p>
                <p className="mt-1.5 text-2xl font-bold text-slate-900">
                  {fmtBRL(m.saldoBancarioCents || "0")}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {m.contasBancarias ?? 0} conta(s) no razão financeiro
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500">Recebíveis em Aberto</p>
              <p className="mt-1.5 text-2xl font-bold text-sky-800">
                {fmtBRL(m.receberPendenteCents)}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Títulos aguardando liquidação</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500">Contas a Pagar em Aberto</p>
              <p className="mt-1.5 text-2xl font-bold text-amber-800">
                {fmtBRL(m.pagarPendenteCents)}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Despesas e obrigações pendentes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500">Eventos & Títulos em Aberto</p>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">
                {m.eventos} evento(s) · {m.titulosEmAberto} título(s)
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Dados reais do banco Prisma</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database size={18} className="text-blue-700" />
              Especificação Funcional e Operação no Núcleo Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400">
                    Código na Planilha
                  </span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                    {foundSubmenu.code} ({foundSubmenu.title})
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400">
                    Classificação / Origem
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">{foundSubmenu.origin}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400">
                    Pacote de Entrega
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    {PACKAGE_LABELS[foundSubmenu.pkg]}
                  </p>
                </div>
              </div>
              <div className="mt-3 border-t border-slate-200/80 pt-3">
                <span className="text-[11px] font-semibold uppercase text-slate-400">
                  Escopo Técnico da Planilha (modulo_financeiro_especificacao.xlsx)
                </span>
                <p className="mt-1 text-sm font-medium text-slate-800">{foundSubmenu.description}</p>
                {foundSubmenu.note && (
                  <p className="mt-1 text-xs font-semibold text-emerald-700">
                    Observação da planilha: {foundSubmenu.note}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-900">
                    <Sparkles size={14} /> Núcleo Operacional Vinculado: {opLink.moduleName}
                  </span>
                  <p className="mt-1 text-xs text-blue-800">
                    Todas as operações deste submenu compartilham o razão financeiro único em centavos
                    inteiros (BigInt) e geram trilha de auditoria imutável.
                  </p>
                </div>
                <Link href={opLink.href}>
                  <Button className="shrink-0">
                    {opLink.ctaLabel} <ArrowRight size={15} className="ml-1.5" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Link
                href="/conciliacao"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span>Conciliação Bancária</span>
                <ArrowRight size={14} className="text-slate-400" />
              </Link>
              <Link
                href="/ocorrencias"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span>Estornos & Riscos</span>
                <ArrowRight size={14} className="text-slate-400" />
              </Link>
              <Link
                href="/planejamento"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span>Planejamento</span>
                <ArrowRight size={14} className="text-slate-400" />
              </Link>
              <Link
                href="/contabilidade"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span>Contabilidade CSV</span>
                <ArrowRight size={14} className="text-slate-400" />
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-700" />
              Regras de Arquitetura Aplicadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {ARCHITECTURAL_RULES.slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs"
              >
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span>{r.title}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{r.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
