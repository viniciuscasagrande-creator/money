"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search, Layers3, ArrowRight, CheckCircle2, BookOpenCheck, PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeading, ErrorNotice, Loading, useApi } from "@/components/financeiro/shared";
import { PACKAGE_LABELS, type FinanceModule, type FinancePackage } from "@/lib/financeiro/constants";

type ModuleResponse = {
  items: FinanceModule[];
  profile: string;
  packages: typeof PACKAGE_LABELS;
};

export function ModuleCenter() {
  const { data, error, loading, reload } = useApi<ModuleResponse>("/api/sistema/modulos");
  const [search, setSearch] = useState(""),
    [chosen, setChosen] = useState<FinancePackage | 0>(0);

  const extraModules: FinanceModule[] = data
    ? [
        ...(data.profile !== "PRODUCER"
          ? ([
              {
                key: "politicas-repasses",
                label: "Faixas e Travas Progressivas de Repasses",
                href: "/politicas-repasses",
                package: 2,
                endpoint: "/api/financeiro/politicas-liberacao",
                description:
                  "Capacidade comercial de ingressos, gatilhos de vendas (%) e tetos cumulativos de repasse por evento.",
                internal: true,
              },
              {
                key: "retencoes-evento",
                label: "Retenções Obrigatórias (ECAD / Locação)",
                href: "/retencoes",
                package: 2,
                endpoint: "/api/financeiro/retencoes",
                description:
                  "Reservas contratuais obrigatórias por evento em percentual (%) ou valor fixo (R$).",
                internal: true,
              },
              {
                key: "contabilidade-livros",
                label: "Plano de Contas, Razão, Balancete e DRE",
                href: "/contabilidade/livros",
                package: 3,
                endpoint: "/api/contabilidade",
                description:
                  "Árvore hierárquica de 28 contas, partidas dobradas, eventos de negócio, balancete (D=C) e DRE.",
                internal: true,
              },
              {
                key: "integracao-ingressos",
                label: "Conector API de Ingressos & Webhooks",
                href: "/integracao",
                package: 2,
                endpoint: "/api/integracao/ingressos",
                description:
                  "Recepção idempotente de vendas Online, POS PagSeguro e Bilheteria com split automático.",
                internal: true,
              },
            ] satisfies FinanceModule[])
          : []),
        {
          key: "transferencias-eventos",
          label: "Transferências entre Eventos",
          href: "/transferencias",
          package: 2,
          endpoint: "/api/financeiro/transferencias",
          description:
            "Transferência interna auditada de posições entre eventos do mesmo produtor.",
        },
      ]
    : [];

  const allItems = useMemo(() => [...(data?.items ?? []), ...extraModules], [data, extraModules]);

  const modules = useMemo(
    () =>
      allItems.filter(
        (m) =>
          (!chosen || m.package === chosen) &&
          `${m.label} ${m.description}`
            .toLocaleLowerCase("pt-BR")
            .includes(search.toLocaleLowerCase("pt-BR"))
      ),
    [allItems, search, chosen]
  );

  return (
    <>
      <PageHeading
        eyebrow="Navegação Operacional · SOUL v5.2"
        title="Central de Módulos Operacionais"
        subtitle="Cada card abaixo abre diretamente a tela operacional homologada correspondente (sem telas genéricas de especificação), vinculada ao banco PostgreSQL e auditada."
      />
      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <div className="relative min-w-[200px] flex-1">
          <Search size={17} className="absolute left-3 top-3 text-[#918b90]" />
          <Input
            aria-label="Pesquisar módulos"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar telas e operações (ex.: Plano de contas, Repasses, MDR, Conciliação)..."
            className="pl-10"
          />
        </div>
        <select
          aria-label="Filtrar pacote"
          value={chosen}
          onChange={(e) => setChosen(Number(e.target.value) as FinancePackage | 0)}
          className="h-10 rounded-xl border border-[#e8e4e4] bg-white px-3 text-sm"
        >
          <option value={0}>Todos os pacotes</option>
          {([1, 2, 3, 4] as const).map((n) => (
            <option key={n} value={n}>
              Pacote {n.toString().padStart(2, "0")} — {PACKAGE_LABELS[n]}
            </option>
          ))}
        </select>
      </Card>
      {error && <ErrorNotice message={error} retry={reload} />}
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between text-xs font-medium text-[#938b8f]">
            <span>
              {modules.length} {modules.length === 1 ? "tela operacional autorizada" : "telas operacionais autorizadas"}
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
              <CheckCircle2 size={14} /> 100% vinculadas a rotas reais e APIs Prisma
            </span>
          </div>
          {([1, 2, 3, 4] as const).map((pkg) => {
            const items = modules.filter((m) => m.package === pkg);
            return items.length ? (
              <section key={pkg} className="mb-8">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#26262b] text-xs font-bold text-white">
                    {String(pkg).padStart(2, "0")}
                  </span>
                  <h2 className="text-lg font-semibold text-[#302c31]">{PACKAGE_LABELS[pkg]}</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((m) => (
                    <Link
                      href={m.href}
                      key={m.key}
                      className="group block rounded-[22px] border border-[#eae6e6] bg-white p-5 shadow-[0_3px_14px_rgba(24,17,23,.03)] transition hover:-translate-y-0.5 hover:border-[#efb3ad] hover:shadow-lg"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f7eeec]">
                          {m.key === "contabilidade-livros" ? (
                            <BookOpenCheck size={20} className="text-[#ce655b]" />
                          ) : m.key === "integracao-ingressos" ? (
                            <PlugZap size={20} className="text-[#ce655b]" />
                          ) : (
                            <Layers3 size={20} className="text-[#ce655b]" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone="green">Operacional</Badge>
                          <ArrowUpRight
                            size={18}
                            className="text-[#a9a3a7] group-hover:text-[#c94e46]"
                          />
                        </div>
                      </div>
                      <h3 className="mt-4 font-semibold text-[#353037]">{m.label}</h3>
                      <p className="mt-1.5 min-h-[38px] text-xs leading-5 text-[#91898f]">
                        {m.description}
                      </p>
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                        <span className="font-mono text-[11px] text-slate-400">{m.href}</span>
                        <span className="flex items-center gap-1 font-semibold text-[#bd554d]">
                          Abrir tela <ArrowRight size={14} />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null;
          })}
          {!modules.length && (
            <Card className="py-16 text-center text-sm text-slate-500">
              Nenhuma tela corresponde à busca dentro de suas permissões.
            </Card>
          )}
        </>
      )}
    </>
  );
}
