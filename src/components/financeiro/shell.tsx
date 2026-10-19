"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FINANCIAL_MENUS, TOTAL_SUBMENUS, type UserRole } from "@/config/navigation";
import SpecificationSheetModal from "@/components/SpecificationSheetModal";

type User = { name: string; email: string; role: "ADMIN" | "FINANCE_DISK" | "PRODUCER" };

const coreMenus: {
  label: string;
  url: string;
  icon: LucideIcon;
  internal?: boolean;
  admin?: boolean;
}[] = [
  { label: "Dashboard Financeiro", url: "/dashboard", icon: LayoutDashboard },
  { label: "Recebimentos", url: "/recebimentos", icon: ArrowDownToLine },
  { label: "Contas a Pagar", url: "/pagamentos", icon: ArrowUpFromLine },
  { label: "Tesouraria e Bancos", url: "/contas", icon: Landmark, internal: true },
  { label: "Saldos e Posições", url: "/saldos", icon: Layers3 },
  { label: "Gateways e Bandeiras", url: "/gateways", icon: CreditCard, internal: true },
  { label: "Divisão de Receitas", url: "/taxas", icon: Percent, internal: true },
  { label: "Vendas por Evento", url: "/vendas", icon: Receipt, internal: true },
  { label: "Repasses e Antecipações", url: "/repasses", icon: ArrowLeftRight },
  { label: "Conciliação Bancária", url: "/conciliacao", icon: GitCompareArrows, internal: true },
  { label: "Estornos e Chargebacks", url: "/ocorrencias", icon: ShieldAlert, internal: true },
  { label: "Planejamento Financeiro", url: "/planejamento", icon: CalendarRange, internal: true },
  { label: "Gestão de Contratos", url: "/contratos", icon: FileSignature, internal: true },
  { label: "Contabilidade / Exportação", url: "/contabilidade", icon: BookOpenCheck, internal: true },
  { label: "API de Ingressos", url: "/integracao", icon: KeyRound, internal: true },
  { label: "Cadastros e Acessos", url: "/cadastros", icon: Users, admin: true },
  { label: "Auditoria Inicial", url: "/auditoria", icon: ClipboardList, admin: true },
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

export function WorkspaceShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname(),
    router = useRouter();
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [signingOut, setSigningOut] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    "01": true,
    "09": true,
    "10": true,
  });

  const menus = coreMenus.filter(
    (m) => (!m.internal || user.role !== "PRODUCER") && (!m.admin || user.role === "ADMIN")
  );

  const specProfile = roleToSpecProfile[user.role];

  const filteredSpecMenus = useMemo(() => {
    const q = search.trim().toLowerCase();
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
  }, [search, specProfile]);

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
    <div className="min-h-screen lg:flex">
      {mobile && (
        <button
          onClick={() => setMobile(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          aria-label="Fechar menu"
        />
      )}

      <aside
        className={cn(
          "fixed z-40 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200 lg:sticky lg:top-0",
          collapsed ? "lg:w-[78px]" : "lg:w-[310px]",
          mobile ? "left-0 w-[310px]" : "-left-[320px] lg:left-0"
        )}
      >
        <div className="flex h-20 items-center justify-between gap-2 border-b border-slate-100 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <CircleDollarSign size={23} />
            </div>
            {(!collapsed || mobile) && (
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-tight">Financeiro ERP</p>
                <p className="text-[10px] font-semibold tracking-widest text-slate-400">
                  PACOTE 03 · {TOTAL_SUBMENUS} SUBMENUS
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => (mobile ? setMobile(false) : setCollapsed(!collapsed))}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
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
            <p className="px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">
              Operações & Controle · Pacote 03
            </p>
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
                    "flex h-10 items-center gap-3 rounded-xl px-3 text-[12.5px] font-medium transition-colors",
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                    collapsed && !mobile && "justify-center px-2"
                  )}
                >
                  <Icon size={18} strokeWidth={1.9} />
                  {(!collapsed || mobile) && <span>{m.label}</span>}
                </Link>
              );
            })}
          </nav>

          {(!collapsed || mobile) && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                  Arquitetura · 17 Áreas ({TOTAL_SUBMENUS})
                </span>
                <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-700">
                  <button onClick={expandAll} className="hover:underline">
                    Expandir todos
                  </button>
                  <span className="text-slate-300">·</span>
                  <button onClick={collapseAll} className="text-slate-500 hover:underline">
                    Recolher
                  </button>
                </div>
              </div>

              <div className="relative mb-2.5 px-1">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar 17 menus / 172 submenus..."
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                {filteredSpecMenus.map((menu) => {
                  const isOpen = Boolean(expandedMenus[menu.number] || search.trim());
                  return (
                    <div
                      key={menu.number}
                      className="rounded-xl border border-slate-100 bg-slate-50/50"
                    >
                      <button
                        type="button"
                        onClick={() => toggleMenu(menu.number)}
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100/80"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex h-5 w-6 shrink-0 items-center justify-center rounded bg-slate-200/80 font-mono text-[10px] font-bold text-slate-700">
                            {menu.number}
                          </span>
                          <span className="truncate">{menu.title}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="rounded-full bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                            {menu.submenus.length}
                          </span>
                          {isOpen ? (
                            <ChevronDown size={13} className="text-slate-400" />
                          ) : (
                            <ChevronRight size={13} className="text-slate-400" />
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="space-y-0.5 border-t border-slate-100 px-2 py-1.5">
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
                                    ? "bg-slate-900 font-semibold text-white"
                                    : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
                                )}
                              >
                                <span className="truncate">
                                  <span className="mr-1.5 font-mono text-[10px] opacity-60">
                                    {sub.code}
                                  </span>
                                  {sub.title}
                                </span>
                                {sub.origin === "Acréscimo" && (
                                  <span
                                    className={cn(
                                      "shrink-0 rounded px-1 py-0.2 text-[9px] font-bold",
                                      subActive
                                        ? "bg-emerald-500/30 text-emerald-200"
                                        : "bg-emerald-100 text-emerald-800"
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

        <div className="border-t border-slate-100 p-3">
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl bg-slate-50 p-3",
              collapsed && !mobile && "justify-center p-2"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-700">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            {(!collapsed || mobile) && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="text-[11px] text-slate-500">{roleNames[user.role]}</p>
              </div>
            )}
          </div>
          <button
            disabled={signingOut}
            onClick={logout}
            title="Sair"
            className={cn(
              "mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700",
              collapsed && !mobile && "justify-center"
            )}
          >
            <LogOut size={16} />
            {(!collapsed || mobile) && "Sair do sistema"}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur md:px-9">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setMobile(true)}
              variant="ghost"
              size="icon"
              className="lg:hidden"
            >
              <Menu size={20} />
            </Button>
            <div>
              <p className="text-xs text-slate-400">Painel de Gestão · Razão Financeiro Único</p>
              <p className="text-sm font-bold text-slate-900">{roleNames[user.role]}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSpecOpen(true)}
              className="hidden sm:inline-flex"
            >
              <FileSpreadsheet size={15} className="mr-1.5 text-emerald-700" />
              Planilha (17 Menus · {TOTAL_SUBMENUS} Submenus)
            </Button>

            {user.role !== "PRODUCER" && (
              <Link href="/integracao" className="hidden md:inline-flex">
                <span className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100">
                  <KeyRound size={13} /> API Ingressos Ativa
                </span>
              </Link>
            )}

            <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              <Activity size={14} /> Módulo financeiro · Controle (Pacote 03)
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1550px] px-4 py-7 md:px-9 md:py-9">{children}</main>
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
