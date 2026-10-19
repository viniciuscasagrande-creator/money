"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  Layers3,
  Users,
  ClipboardList,
  LogOut,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Activity,
  CircleDollarSign,
  FileSpreadsheet,
  KeyRound,
  Search,
  CreditCard,
  Percent,
  Receipt,
  ArrowLeftRight,
  GitCompareArrows,
  ShieldAlert,
  CalendarRange,
  FileSignature,
  BookOpenCheck,
  BarChart3,
  BellRing,
  ShieldCheck,
  SlidersHorizontal,
  Filter,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FINANCIAL_MENUS, TOTAL_SUBMENUS, type UserRole } from "@/config/navigation";
import SpecificationSheetModal from "@/components/SpecificationSheetModal";

type User = { name: string; email: string; role: "ADMIN" | "FINANCE_DISK" | "PRODUCER" };

type CatalogSummary = {
  producers: { id: string; name: string }[];
  events: { id: string; name: string; producerId: string }[];
};

const coreMenus: {
  label: string;
  url: string;
  icon: LucideIcon;
  pkg: string;
  internal?: boolean;
  admin?: boolean;
  capability?: string;
}[] = [
  { label: "Dashboard Financeiro", url: "/dashboard", icon: LayoutDashboard, pkg: "P1" },
  { label: "Recebimentos", url: "/recebimentos", icon: ArrowDownToLine, pkg: "P1" },
  { label: "Contas a Pagar", url: "/pagamentos", icon: ArrowUpFromLine, pkg: "P1" },
  { label: "Tesouraria e Bancos", url: "/contas", icon: Landmark, pkg: "P1", internal: true },
  { label: "Saldos e Posições", url: "/saldos", icon: Layers3, pkg: "P1" },
  { label: "Gateways e Bandeiras", url: "/gateways", icon: CreditCard, pkg: "P2", internal: true },
  { label: "Divisão de Receitas", url: "/taxas", icon: Percent, pkg: "P2", internal: true },
  { label: "Vendas por Evento", url: "/vendas", icon: Receipt, pkg: "P2", internal: true },
  { label: "Repasses e Antecipações", url: "/repasses", icon: ArrowLeftRight, pkg: "P2" },
  { label: "Conciliação Bancária", url: "/conciliacao", icon: GitCompareArrows, pkg: "P3", internal: true },
  { label: "Estornos e Chargebacks", url: "/ocorrencias", icon: ShieldAlert, pkg: "P3", internal: true },
  { label: "Planejamento Financeiro", url: "/planejamento", icon: CalendarRange, pkg: "P3", internal: true },
  { label: "Gestão de Contratos", url: "/contratos", icon: FileSignature, pkg: "P3", internal: true },
  { label: "Contabilidade / Exportação", url: "/contabilidade", icon: BookOpenCheck, pkg: "P3", internal: true },
  { label: "Relatórios Executivos", url: "/relatorios", icon: BarChart3, pkg: "P4", capability: "REPORT_VIEW" },
  { label: "Central de Alertas", url: "/alertas", icon: BellRing, pkg: "P4", internal: true, capability: "ALERT_VIEW" },
  { label: "Permissões e Alçadas", url: "/governanca", icon: ShieldCheck, pkg: "P4", admin: true },
  { label: "Configurações Financeiras", url: "/configuracoes", icon: SlidersHorizontal, pkg: "P4", admin: true },
  { label: "API de Ingressos", url: "/integracao", icon: KeyRound, pkg: "API", internal: true },
  { label: "Cadastros e Acessos", url: "/cadastros", icon: Users, pkg: "P1", admin: true },
  { label: "Auditoria Completa", url: "/auditoria", icon: ClipboardList, pkg: "P4", admin: true },
];

const roleNames = {
  ADMIN: "Administrador",
  FINANCE_DISK: "Financeiro Interno",
  PRODUCER: "Produtor",
};

const roleToSpecProfile: Record<User["role"], UserRole> = {
  ADMIN: "ADMIN",
  FINANCE_DISK: "FINANCEIRO_INTERNO",
  PRODUCER: "PRODUTOR",
};

export function WorkspaceShell({
  user,
  children,
  capabilities = [],
}: {
  user: User;
  children: React.ReactNode;
  capabilities?: string[];
}) {
  const pathname = usePathname(),
    router = useRouter();
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [signingOut, setSigningOut] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [topSearch, setTopSearch] = useState("");
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    "01": true,
    "09": true,
    "14": true,
  });

  // Filtros globais da Barra Superior BankOS (Produtor, Evento e Período — dados reais do banco)
  const [catalog, setCatalog] = useState<CatalogSummary>({ producers: [], events: [] });
  const [selectedProducer, setSelectedProducer] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("30D");
  const [alertCount, setAlertCount] = useState<number>(0);

  useEffect(() => {
    let active = true;
    fetch("/api/inteligencia/catalogo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d && Array.isArray(d.producers)) {
          setCatalog({ producers: d.producers, events: d.events || [] });
        }
      })
      .catch(() => {});

    if (user.role !== "PRODUCER") {
      fetch("/api/inteligencia/alertas", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && d && Array.isArray(d.items)) {
            setAlertCount(d.items.filter((x: { acknowledged?: boolean }) => !x.acknowledged).length);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [user.role, pathname]);

  const menus = coreMenus.filter(
    (m) =>
      (!m.internal || user.role !== "PRODUCER") &&
      (!m.admin || user.role === "ADMIN") &&
      (!m.capability || capabilities.includes(m.capability))
  );

  const specProfile = roleToSpecProfile[user.role];

  const filteredSpecMenus = useMemo(() => {
    const q = (search || topSearch).trim().toLowerCase();
    return FINANCIAL_MENUS.filter((m) => m.allowedRoles.includes(specProfile))
      .map((m) => {
        if (!q) return m;
        const menuMatches =
          m.title.toLowerCase().includes(q) || m.number.toLowerCase().includes(q);
        const matchingSubmenus = m.submenus.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.code.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            (s.note && s.note.toLowerCase().includes(q))
        );
        if (menuMatches) return m;
        return { ...m, submenus: matchingSubmenus };
      })
      .filter((m) => m.submenus.length > 0);
  }, [search, topSearch, specProfile]);

  function expandAll() {
    const all: Record<string, boolean> = {};
    for (const m of FINANCIAL_MENUS) all[m.number] = true;
    setExpandedMenus(all);
  }

  function collapseAll() {
    setExpandedMenus({});
  }

  function toggleMenu(num: string) {
    setExpandedMenus((prev) => ({ ...prev, [num]: !prev[num] }));
  }

  function handleApplyTopFilter() {
    router.push("/relatorios");
  }

  async function logout() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#EBEBED] text-[#0F1113] lg:flex">
      {mobile && (
        <button
          onClick={() => setMobile(false)}
          className="fixed inset-0 z-30 bg-[#0F1113]/60 backdrop-blur-xs lg:hidden"
          aria-label="Fechar menu"
        />
      )}

      {/* MENU LATERAL BANKOS — GRAFITE #0F1113 */}
      <aside
        className={cn(
          "fixed z-40 flex h-screen flex-col border-r border-white/10 bg-[#0F1113] text-white transition-all duration-200 lg:sticky lg:top-0",
          collapsed ? "lg:w-[82px]" : "lg:w-[316px]",
          mobile ? "left-0 w-[316px]" : "-left-[330px] lg:left-0"
        )}
      >
        <div className="flex h-20 items-center justify-between gap-2 border-b border-white/10 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E03629] text-white shadow-[0_6px_20px_rgba(224,54,41,0.38)]">
              <CircleDollarSign size={23} />
            </div>
            {(!collapsed || mobile) && (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-bold tracking-tight text-white">BankOS ERP</p>
                  <span className="rounded-md bg-[#E03629]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#E03629]">
                    P1–P4
                  </span>
                </div>
                <p className="text-[10px] font-semibold tracking-[0.16em] text-[#BBBFC5]">
                  17 MENUS · {TOTAL_SUBMENUS} SUBMENUS
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => (mobile ? setMobile(false) : setCollapsed(!collapsed))}
            className="rounded-lg p-1.5 text-[#BBBFC5] transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Alternar menu"
          >
            <span className="lg:hidden">
              <X size={18} />
            </span>
            <span className="hidden lg:block">
              <ChevronLeft size={17} className={collapsed ? "rotate-180" : ""} />
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {(!collapsed || mobile) && (
            <div className="flex items-center justify-between px-3 pb-2 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#BBBFC5]/75">
                Módulos Operacionais
              </p>
              <span className="text-[10px] font-semibold text-[#E03629]">{menus.length} ativos</span>
            </div>
          )}
          <nav aria-label="Menu financeiro operacional" className="space-y-1">
            {menus.map((m) => {
              const Icon = m.icon;
              const active = pathname === m.url || pathname.startsWith(`${m.url}/`);
              return (
                <Link
                  onClick={() => setMobile(false)}
                  key={m.url}
                  href={m.url}
                  title={m.label}
                  className={cn(
                    "group flex h-10 items-center justify-between gap-2.5 rounded-xl px-3 text-[12.5px] font-medium transition-all",
                    active
                      ? "bg-[#E03629] font-semibold text-white shadow-[0_6px_18px_rgba(224,54,41,0.32)]"
                      : "text-[#BBBFC5] hover:bg-white/[0.06] hover:text-white",
                    collapsed && !mobile && "justify-center px-2"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon
                      size={18}
                      strokeWidth={1.9}
                      className={cn(
                        "shrink-0 transition-colors",
                        active ? "text-white" : "text-[#BBBFC5] group-hover:text-white"
                      )}
                    />
                    {(!collapsed || mobile) && <span className="truncate">{m.label}</span>}
                  </span>
                  {(!collapsed || mobile) && (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold",
                        active
                          ? "bg-black/25 text-white"
                          : "bg-white/[0.06] text-[#BBBFC5]/80 group-hover:text-white"
                      )}
                    >
                      {m.pkg}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* ÁRVORE COMPLETA DOS 17 MENUS E 172 SUBMENUS EM GRAFITE BANKOS */}
          {(!collapsed || mobile) && (
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="mb-2.5 flex items-center justify-between px-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#BBBFC5]/75">
                  17 Áreas · {TOTAL_SUBMENUS} Submenus
                </span>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold">
                  <button
                    onClick={expandAll}
                    className="text-[#E03629] transition-opacity hover:opacity-80"
                  >
                    Expandir todos
                  </button>
                  <span className="text-white/20">·</span>
                  <button
                    onClick={collapseAll}
                    className="text-[#BBBFC5] transition-colors hover:text-white"
                  >
                    Recolher
                  </button>
                </div>
              </div>

              <div className="relative mb-3 px-1">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#BBBFC5]"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar 17 menus / 172 submenus..."
                  className="h-8.5 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-8 pr-2.5 text-xs text-white placeholder:text-[#BBBFC5]/60 focus:border-[#E03629] focus:bg-white/[0.08] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                {filteredSpecMenus.map((menu) => {
                  const isOpen = Boolean(expandedMenus[menu.number] || search.trim() || topSearch.trim());
                  return (
                    <div
                      key={menu.number}
                      className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]"
                    >
                      <button
                        type="button"
                        onClick={() => toggleMenu(menu.number)}
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold text-white transition-colors hover:bg-white/[0.05]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex h-5 w-6 shrink-0 items-center justify-center rounded-md bg-[#47505A]/60 font-mono text-[10px] font-bold text-white">
                            {menu.number}
                          </span>
                          <span className="truncate">{menu.title}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-[#BBBFC5]">
                            {menu.submenus.length}
                          </span>
                          {isOpen ? (
                            <ChevronDown size={13} className="text-[#E03629]" />
                          ) : (
                            <ChevronRight size={13} className="text-[#BBBFC5]" />
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="space-y-0.5 border-t border-white/[0.06] bg-black/25 px-2 py-1.5">
                          {menu.submenus.map((sub) => {
                            const subHref = `/submenus/${sub.id}`;
                            const subActive = pathname === subHref;
                            return (
                              <Link
                                key={sub.id}
                                href={subHref}
                                onClick={() => setMobile(false)}
                                className={cn(
                                  "flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] transition-colors",
                                  subActive
                                    ? "bg-[#E03629] font-semibold text-white"
                                    : "text-[#BBBFC5] hover:bg-white/[0.07] hover:text-white"
                                )}
                              >
                                <span className="truncate">
                                  <span className="mr-1.5 font-mono text-[10px] opacity-65">
                                    {sub.code}
                                  </span>
                                  {sub.title}
                                </span>
                                {sub.origin === "Acréscimo" && (
                                  <span
                                    className={cn(
                                      "shrink-0 rounded px-1 py-0.2 text-[9px] font-bold",
                                      subActive
                                        ? "bg-black/30 text-white"
                                        : "bg-[#E03629]/20 text-[#E03629]"
                                    )}
                                  >
                                    +ING
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RODAPÉ DO MENU LATERAL — PERFIL BANKOS */}
        <div className="border-t border-white/10 bg-black/20 p-3">
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3",
              collapsed && !mobile && "justify-center p-2"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E03629] font-bold text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            {(!collapsed || mobile) && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="text-[11px] font-medium text-[#BBBFC5]">{roleNames[user.role]}</p>
              </div>
            )}
          </div>
          <button
            disabled={signingOut}
            onClick={logout}
            title="Sair"
            className={cn(
              "mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-[#BBBFC5] transition-colors hover:bg-[#E03629]/15 hover:text-[#E03629]",
              collapsed && !mobile && "justify-center"
            )}
          >
            <LogOut size={16} />
            {(!collapsed || mobile) && "Encerrar sessão segura"}
          </button>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL + BARRA SUPERIOR BANKOS */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-[#BBBFC5]/60 bg-white/95 px-4 py-3 backdrop-blur-md md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Esquerda: Botão Mobile + Busca Rápida */}
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setMobile(true)}
                variant="ghost"
                size="icon"
                className="lg:hidden"
              >
                <Menu size={20} />
              </Button>
              <div className="relative hidden sm:block">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#47505A]"
                />
                <input
                  type="search"
                  value={topSearch}
                  onChange={(e) => setTopSearch(e.target.value)}
                  placeholder="Pesquisar módulos, submenus ou operações..."
                  className="h-9.5 w-64 rounded-xl border border-[#BBBFC5]/70 bg-[#EBEBED]/60 pl-9 pr-3 text-xs font-medium text-[#0F1113] placeholder:text-[#47505A] focus:border-[#0F1113] focus:bg-white focus:outline-none xl:w-80"
                />
              </div>
            </div>

            {/* Centro: Filtros Rápidos de Produtor, Evento e Período (BankOS Top Filter Bar) */}
            <div className="hidden items-center gap-2 rounded-2xl border border-[#BBBFC5]/60 bg-[#EBEBED]/50 px-3 py-1.5 2xl:flex">
              <Filter size={13} className="text-[#E03629]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#47505A]">
                Escopo:
              </span>
              {user.role !== "PRODUCER" && (
                <select
                  aria-label="Filtro rápido de produtor"
                  value={selectedProducer}
                  onChange={(e) => {
                    setSelectedProducer(e.target.value);
                    setSelectedEvent("");
                  }}
                  className="h-7 rounded-lg border border-[#BBBFC5]/70 bg-white px-2 text-xs font-medium text-[#0F1113] focus:outline-none"
                >
                  <option value="">Produtor: Todos ({catalog.producers.length})</option>
                  {catalog.producers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Filtro rápido de evento"
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                className="h-7 rounded-lg border border-[#BBBFC5]/70 bg-white px-2 text-xs font-medium text-[#0F1113] focus:outline-none"
              >
                <option value="">Evento: Todos ({catalog.events.length})</option>
                {catalog.events
                  .filter((ev) => !selectedProducer || ev.producerId === selectedProducer)
                  .map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Filtro rápido de período"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="h-7 rounded-lg border border-[#BBBFC5]/70 bg-white px-2 text-xs font-medium text-[#0F1113] focus:outline-none"
              >
                <option value="7D">Últimos 7 dias</option>
                <option value="30D">Últimos 30 dias</option>
                <option value="90D">Últimos 90 dias</option>
                <option value="365D">Últimos 12 meses</option>
              </select>
              <button
                type="button"
                onClick={handleApplyTopFilter}
                className="rounded-lg bg-[#0F1113] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#E03629]"
              >
                Analisar BI
              </button>
            </div>

            {/* Direita: Planilha 172 Submenus, Notificações/Alertas, API e Perfil */}
            <div className="flex items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSpecOpen(true)}
                className="hidden sm:inline-flex"
              >
                <FileSpreadsheet size={15} className="text-[#E03629]" />
                <span>Planilha ({TOTAL_SUBMENUS})</span>
              </Button>

              {user.role !== "PRODUCER" && (
                <Link
                  href="/alertas"
                  title="Central de Alertas e Pendências"
                  className="relative inline-flex h-9.5 items-center gap-1.5 rounded-xl border border-[#BBBFC5]/70 bg-white px-3 text-xs font-semibold text-[#0F1113] transition-colors hover:border-[#0F1113]"
                >
                  <BellRing size={15} className={alertCount > 0 ? "text-[#E03629]" : "text-[#47505A]"} />
                  <span className="hidden md:inline">Alertas</span>
                  {alertCount > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E03629] px-1.5 text-[10px] font-bold text-white">
                      {alertCount}
                    </span>
                  )}
                </Link>
              )}

              {user.role !== "PRODUCER" && (
                <Link href="/integracao" className="hidden xl:inline-flex">
                  <span className="flex items-center gap-1.5 rounded-xl border border-[#0F1113]/15 bg-[#0F1113] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#E03629]">
                    <KeyRound size={13} className="text-[#E03629]" /> API Ingressos
                  </span>
                </Link>
              )}

              <div className="flex items-center gap-2 rounded-xl border border-[#BBBFC5]/60 bg-[#EBEBED]/70 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-[#E03629]" />
                <div className="text-left">
                  <p className="text-[10px] font-bold uppercase leading-none tracking-wider text-[#47505A]">
                    {roleNames[user.role]}
                  </p>
                  <p className="mt-0.5 max-w-[120px] truncate text-xs font-bold leading-none text-[#0F1113]">
                    {user.name}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1560px] px-4 py-7 md:px-8 md:py-8">{children}</main>
      </div>

      <SpecificationSheetModal
        isOpen={specOpen}
        onClose={() => setSpecOpen(false)}
        onSelectSubmenu={(submenuId) => {
          setSpecOpen(false);
          router.push(`/submenus/${submenuId}`);
        }}
      />
    </div>
  );
}
