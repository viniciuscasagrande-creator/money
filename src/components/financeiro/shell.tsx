"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, BarChart3, Bell,
  BookOpenCheck, CalendarRange, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, CreditCard, FileSignature, FileSpreadsheet, GitCompareArrows,
  Grid2X2, Landmark, Layers3, LayoutDashboard, LogOut, Menu, Percent, PlugZap, Receipt, Search,
  Settings2, ShieldAlert, ShieldCheck, Users, X,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_OPERATIONAL_SUBMENU_ROUTES, resolveSubmenuOperationalRoute } from "@/config/submenu-routes";
import SpecificationSheetModal from "@/components/financeiro/specification-sheet-modal";

type User = { name: string; email: string; role: "ADMIN" | "FINANCE_DISK" | "PRODUCER" };
type MenuItem = { label: string; url: string; icon: LucideIcon; internal?: boolean; admin?: boolean; capability?: string };
type MenuGroup = { title: string; items: MenuItem[] };

const groups: MenuGroup[] = [
  { title: "VISÃO GERAL", items: [
    { label: "Dashboard executivo", url: "/dashboard", icon: LayoutDashboard },
    { label: "Central de módulos", url: "/modulos", icon: Grid2X2 },
    { label: "Relatórios e BI", url: "/relatorios", icon: BarChart3, capability: "REPORT_VIEW" },
    { label: "Alertas e pendências", url: "/alertas", icon: Bell, internal: true, capability: "ALERT_VIEW" }
  ]},
  { title: "MOVIMENTAÇÕES", items: [
    { label: "Recebimentos", url: "/recebimentos", icon: ArrowDownToLine },
    { label: "Contas a pagar", url: "/pagamentos", icon: ArrowUpFromLine },
    { label: "Saldos e posições", url: "/saldos", icon: Layers3 },
    { label: "Repasses, travas e ECAD", url: "/repasses", icon: ArrowLeftRight },
    { label: "Retenções obrigatórias", url: "/retencoes", icon: ShieldCheck, internal: true },
    { label: "Transferências entre eventos", url: "/transferencias", icon: GitCompareArrows },
    { label: "Tesouraria e bancos", url: "/contas", icon: Landmark, internal: true }
  ]},
  { title: "OPERAÇÕES E CONTROLE", items: [
    { label: "Gateways, bandeiras e MDR", url: "/gateways", icon: CreditCard, internal: true },
    { label: "Taxas 1x–12x, spread e POS", url: "/taxas", icon: Percent, internal: true },
    { label: "Vendas por evento", url: "/vendas", icon: Receipt, internal: true },
    { label: "Conciliação bancária", url: "/conciliacao", icon: GitCompareArrows, internal: true },
    { label: "Cancelamentos e chargebacks", url: "/ocorrencias", icon: ShieldAlert, internal: true },
    { label: "API de ingressos", url: "/integracao", icon: PlugZap, internal: true }
  ]},
  { title: "PLANEJAMENTO E CONTÁBIL", items: [
    { label: "Plano de contas e livros", url: "/contabilidade/livros", icon: BookOpenCheck, internal: true },
    { label: "Exportação contábil CSV", url: "/contabilidade", icon: FileSpreadsheet, internal: true },
    { label: "Orçamento por evento", url: "/planejamento", icon: CalendarRange, internal: true },
    { label: "Contratos financeiros", url: "/contratos", icon: FileSignature, internal: true }
  ]},
  { title: "GOVERNANÇA", items: [
    { label: "Cadastros (eventos/produtores)", url: "/cadastros", icon: Users, admin: true },
    { label: "Permissões e alçadas", url: "/governanca", icon: ShieldCheck, admin: true },
    { label: "Log de atividades e auditoria", url: "/auditoria", icon: ClipboardList, admin: true },
    { label: "Configurações", url: "/configuracoes", icon: Settings2, admin: true }
  ]}
];

const roleNames = { ADMIN: "Administrador", FINANCE_DISK: "Financeiro Interno", PRODUCER: "Produtor" } as const;
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "U";

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex min-w-0 items-center gap-3">
    <div className="fintech-brand-mark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3.5 16.5 9 7.5l4.4 6L20.5 4.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M15.5 4.5h5v5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
    {!compact && <div className="min-w-0"><p className="flex items-center gap-1.5 text-[17px] font-bold tracking-[-.045em] text-white"><span>SOUL<span className="text-[#ff746b]">.</span></span><span className="rounded bg-[#ff746b]/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[#ff938b]">v5.1</span></p><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#929398]">ERP OPERACIONAL</p></div>}
  </div>;
}

export function WorkspaceShell({ user, children, capabilities }: { user: User; children: React.ReactNode; capabilities: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState<string[]>([
    "VISÃO GERAL",
    "MOVIMENTAÇÕES",
    "OPERAÇÕES E CONTROLE",
    "PLANEJAMENTO E CONTÁBIL",
    "GOVERNANÇA"
  ]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const visibleGroups = groups.map(group => ({ ...group, items: group.items.filter(item =>
    (!item.internal || user.role !== "PRODUCER") && (!item.admin || user.role === "ADMIN") && (!item.capability || capabilities.includes(item.capability))
  )})).filter(group => group.items.length > 0);
  const allVisible = visibleGroups.flatMap(group => group.items);
  const selected = allVisible.find(item => pathname === item.url || (item.url !== "/contabilidade" && pathname.startsWith(`${item.url}/`)));
  const qNorm = query.trim().toLocaleLowerCase("pt-BR");
  const results = allVisible.filter(item => item.label.toLocaleLowerCase("pt-BR").includes(qNorm)).slice(0, 7);
  const submenuResults = user.role === "PRODUCER" || !qNorm
    ? []
    : ALL_OPERATIONAL_SUBMENU_ROUTES.filter(r =>
        r.submenuTitle.toLocaleLowerCase("pt-BR").includes(qNorm) ||
        r.submenuCode.toLocaleLowerCase("pt-BR").includes(qNorm) ||
        r.moduleName.toLocaleLowerCase("pt-BR").includes(qNorm)
      ).slice(0, 6);
  const hasAlerts = allVisible.some(item => item.url === "/alertas");

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "Escape") { setSearchOpen(false); setProfileOpen(false); setMobile(false); }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  function navigate() { setMobile(false); setSearchOpen(false); setQuery(""); }
  async function logout() {
    setSigningOut(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
    finally { setSigningOut(false); }
  }
  function toggleGroup(name: string) { setSectionsOpen(previous => previous.includes(name) ? previous.filter(value => value !== name) : [...previous, name]); }

  function menuLink(item: MenuItem, miniature = false) {
    const Icon = item.icon;
    const active = pathname === item.url || (item.url !== "/contabilidade" && pathname.startsWith(`${item.url}/`));
    return <Link href={item.url} key={item.url} onClick={navigate} title={item.label} aria-current={active ? "page" : undefined}
      className={cn("fintech-nav-link", active && "fintech-nav-link-active", miniature && "fintech-nav-link-compact")}>
      <Icon size={19} strokeWidth={1.75} className="shrink-0"/>
      {!miniature && <span className="min-w-0 truncate">{item.label}</span>}
      {!miniature && active && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff746b]"/>}
    </Link>;
  }

  return <div className="premium-workspace min-h-screen lg:flex">
    {mobile && <button className="fixed inset-0 z-40 bg-[#111116]/60 backdrop-blur-[2px] lg:hidden" onClick={() => setMobile(false)} aria-label="Fechar menu"/>}
    <aside className={cn("fintech-sidebar fixed z-50 flex h-[100dvh] flex-col transition-[width,left] duration-200 lg:sticky lg:top-0", collapsed ? "lg:w-[82px]" : "lg:w-[260px]", mobile ? "left-0 w-[280px]" : "-left-[290px] lg:left-0")}>
      <div className="flex h-[90px] shrink-0 items-center justify-between gap-2 px-5">
        <Brand compact={collapsed && !mobile}/>
        <button type="button" onClick={() => mobile ? setMobile(false) : setCollapsed(!collapsed)} className="fintech-icon-button-dark" aria-label={mobile ? "Fechar menu" : collapsed ? "Expandir menu" : "Recolher menu"}>
          {mobile ? <X size={18}/> : collapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}
        </button>
      </div>
      <div className="fintech-sidebar-divider"/>
      <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3.5 py-6" aria-label="Navegação financeira">
        {visibleGroups.map(group => {
          const open = sectionsOpen.includes(group.title);
          return <div key={group.title}>
            {(!collapsed || mobile) ? <button type="button" onClick={() => toggleGroup(group.title)} aria-expanded={open} className="mb-2 flex w-full items-center justify-between px-3 text-left text-[10px] font-bold tracking-[.14em] text-[#85868c]">
              {group.title}<ChevronDown size={13} className={cn("transition-transform", !open && "-rotate-90")}/>
            </button> : <div className="mx-auto mb-3 h-px w-8 bg-white/10"/>}
            {(open || (collapsed && !mobile)) && <div className="space-y-0.5">{group.items.map(item => menuLink(item, collapsed && !mobile))}</div>}
          </div>;
        })}
      </nav>
      <div className="fintech-sidebar-divider"/>
      <div className="p-3.5">
        <div className={cn("flex items-center gap-2.5 rounded-[16px] bg-white/[.065] px-3 py-3", collapsed && !mobile && "justify-center px-1")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4ddda] text-xs font-bold text-[#343237]">{initials(user.name)}</div>
          {(!collapsed || mobile) && <div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{user.name}</p><p className="truncate text-[10px] text-[#a7a5a7]">{roleNames[user.role]}</p></div>}
        </div>
        <button disabled={signingOut} onClick={logout} className={cn("mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs text-[#b0afb5] hover:bg-white/10 hover:text-white", collapsed && !mobile && "justify-center")}><LogOut size={17}/>{(!collapsed || mobile) && (signingOut ? "Encerrando sessão..." : "Sair do sistema")}</button>
      </div>
    </aside>

    <div className="min-w-0 flex-1">
      <header className="fintech-topbar sticky top-0 z-30 flex h-[82px] items-center gap-3 px-4 sm:px-7 xl:px-10">
        <button type="button" onClick={() => setMobile(true)} className="fintech-icon-button lg:hidden" aria-label="Abrir menu"><Menu size={21}/></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-medium text-[#969399]"><span className="hidden sm:inline">Workspace financeiro</span><ChevronRight size={12} className="hidden sm:block"/><span className="truncate text-[#48474c]">{selected?.label ?? "Financeiro Operacional"}</span></div>
          <div className="mt-0.5 hidden text-[12px] font-medium text-[#807f85] sm:block">{user.role === "PRODUCER" ? "Área exclusiva do produtor" : "SOUL v5.1 · Operação interna homologada"}</div>
        </div>
        {user.role !== "PRODUCER" && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="hidden items-center gap-2 rounded-xl border border-[#e7e2e0] bg-white px-3.5 py-2 text-xs font-semibold text-[#3f3c42] hover:bg-[#f6f3f2] md:inline-flex"
            title="Catálogo de 17 menus e 172 submenus vinculados às rotas operacionais"
          >
            <FileSpreadsheet size={15} className="text-[#e3574f]" />
            <span>Mapa Operacional (172)</span>
          </button>
        )}
        <button type="button" className="fintech-search-trigger hidden items-center gap-2 sm:flex" onClick={() => setSearchOpen(true)}><Search size={16}/><span>Buscar telas ou operações...</span><kbd>Ctrl K</kbd></button>
        <button type="button" className="fintech-icon-button sm:hidden" aria-label="Pesquisar funcionalidades" onClick={() => setSearchOpen(true)}><Search size={19}/></button>
        {hasAlerts && <Link href="/alertas" className="fintech-icon-button relative" aria-label="Consultar central de alertas" title="Consultar alertas"><Bell size={19}/><span className="absolute right-[10px] top-[10px] h-1.5 w-1.5 rounded-full bg-[#f0645b]"/></Link>}
        <div className="relative">
          <button type="button" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen} className="flex items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-[#f5f2f1]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2d2b2f] text-[11px] font-bold text-white">{initials(user.name)}</span>
            <span className="hidden max-w-32 truncate text-left text-xs font-semibold text-[#27262a] xl:block">{user.name}</span><ChevronDown size={14} className="hidden text-[#77757c] lg:block"/>
          </button>
          {profileOpen && <div className="absolute right-0 top-12 z-40 w-60 rounded-2xl border border-[#eae7e6] bg-white p-2 shadow-xl"><p className="truncate px-3 pt-2 text-sm font-semibold text-[#27262a]">{user.name}</p><p className="truncate px-3 pb-3 text-xs text-[#8b8585]">{user.email}</p><div className="my-1 h-px bg-[#f0eded]"/><button onClick={logout} disabled={signingOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-[#ad443d] hover:bg-[#fff1ef]"><LogOut size={15}/>Sair do sistema</button></div>}
        </div>
      </header>
      <main className="fintech-main mx-auto max-w-[1660px] px-4 pb-14 pt-7 sm:px-7 sm:pt-9 xl:px-10">{children}</main>
      <footer className="mx-auto flex max-w-[1660px] flex-wrap items-center justify-between gap-2 px-4 pb-6 text-[11px] text-[#a5a1a1] sm:px-7 xl:px-10"><span>SOUL Financeiro v5.1 · Recuperação Operacional & Motor Contábil</span><span>Dados reais persistidos no PostgreSQL conforme suas permissões</span></footer>
    </div>

    {searchOpen && <div role="presentation" className="fixed inset-0 z-[100] flex justify-center bg-[#1e1b22]/65 px-3 pt-[14vh] backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-label="Pesquisar módulos financeiros" className="h-fit w-full max-w-xl overflow-hidden rounded-[24px] bg-white shadow-[0_30px_90px_rgba(0,0,0,.26)]">
        <div className="flex items-center gap-3 border-b border-[#ece9e7] px-5 py-4"><Search size={19} className="text-[#827b7e]"/><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: Plano de contas, ECAD, Conciliação, Orçamento, MDR..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a7a0a1]"/><button aria-label="Fechar pesquisa" onClick={() => setSearchOpen(false)}><X size={18}/></button></div>
        <div className="max-h-96 overflow-auto p-2">
          {results.map(item => { const Icon = item.icon; return <Link key={item.url} href={item.url} onClick={navigate} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-[#464349] hover:bg-[#f7f4f3]"><Icon size={18} className="text-[#e45e56]"/><span className="flex-1 font-medium">{item.label}</span><span className="font-mono text-[11px] text-slate-400">{item.url}</span><ChevronRight size={14} className="text-[#bab4b2]"/></Link>; })}
          {submenuResults.length > 0 && (
            <div className="mt-2 border-t border-[#f0eceb] pt-2">
              <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Operações diretas por função</p>
              {submenuResults.map(sub => (
                <Link key={sub.submenuId} href={sub.operationalHref} onClick={navigate} className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-xs text-[#464349] hover:bg-[#f7f4f3]">
                  <div>
                    <span className="font-mono text-[10px] font-bold text-[#e3574f] mr-1.5">{sub.submenuCode}</span>
                    <span className="font-semibold text-slate-800">{sub.submenuTitle}</span>
                    <span className="ml-2 text-[11px] text-slate-400">→ {sub.moduleName}</span>
                  </div>
                  <ChevronRight size={14} className="text-[#bab4b2]" />
                </Link>
              ))}
            </div>
          )}
          {results.length === 0 && submenuResults.length === 0 && <p className="px-5 py-10 text-center text-sm text-[#9d9899]">Nenhum módulo autorizado encontrado.</p>}
        </div>
        <div className="border-t border-[#ece9e7] px-5 py-3 text-[11px] text-[#a39c9c]">Todas as buscas abrem diretamente a tela operacional correspondente.</div>
      </div>
    </div>}

    <SpecificationSheetModal
      isOpen={sheetOpen}
      onClose={() => setSheetOpen(false)}
      onSelectSubmenu={(id) => {
        setSheetOpen(false);
        const route = resolveSubmenuOperationalRoute(id);
        router.push(route.operationalHref);
      }}
    />
  </div>;
}
