"use client";

import React, { useState } from "react";
import { X, FileSpreadsheet, CheckCircle2, ArrowUpRight, ShieldCheck, Search } from "lucide-react";
import {
  FINANCIAL_MENUS,
  PACKAGE_INFO,
  ROLE_PROFILES,
  ARCHITECTURAL_RULES,
  TOTAL_BASE_DOC_SUBMENUS,
  TOTAL_ADDED_SUBMENUS,
  TOTAL_REMOVED_SUBMENUS,
  TOTAL_SUBMENUS,
  ImplementationPackage,
  SubmenuOrigin,
} from "@/config/navigation";

interface SpecificationSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSubmenu: (id: string) => void;
}

export default function SpecificationSheetModal({
  isOpen,
  onClose,
  onSelectSubmenu,
}: SpecificationSheetModalProps) {
  const [activeTab, setActiveTab] = useState<
    "RESUMO" | "SUBMENUS" | "PACOTES" | "PERFIS" | "REGRAS"
  >("RESUMO");
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<SubmenuOrigin | "ALL">("ALL");

  if (!isOpen) return null;

  const allSubmenus = FINANCIAL_MENUS.flatMap((m) =>
    m.submenus.map((s) => ({
      ...s,
      menuNumber: m.number,
      menuTitle: m.title,
      pkgLabel: `${PACKAGE_INFO[s.pkg].number} - ${PACKAGE_INFO[s.pkg].name}`,
    }))
  ).filter((item) => {
    if (originFilter !== "ALL" && item.origin !== originFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.code.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q) ||
      item.menuTitle.toLowerCase().includes(q) ||
      (item.note || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Planilha de Especificação Sincronizada — modulo_financeiro_especificacao (1).xlsx
              </h2>
              <p className="text-xs text-slate-400">
                17 Menus · {TOTAL_BASE_DOC_SUBMENUS} Submenus Originais + {TOTAL_ADDED_SUBMENUS} Acréscimos -{" "}
                {TOTAL_REMOVED_SUBMENUS} Retirado ={" "}
                <strong className="text-emerald-400">{TOTAL_SUBMENUS} Submenus Ativos</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 5 Excel Sheet Tabs */}
        <div className="px-6 pt-3 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center gap-2">
          {[
            { id: "RESUMO", label: "1. Aba Resumo (17 Menus)" },
            { id: "SUBMENUS", label: `2. Aba Submenus (${TOTAL_SUBMENUS} Itens)` },
            { id: "PACOTES", label: "3. Aba Pacotes (4 Fases)" },
            { id: "PERFIS", label: "4. Aba Perfis (6 Acessos)" },
            { id: "REGRAS", label: "5. Aba Regras de Arquitetura (8 Regras)" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`px-4 py-2 rounded-t-xl text-xs font-bold border-t border-x transition cursor-pointer ${
                activeTab === t.id
                  ? "bg-slate-900 text-emerald-400 border-slate-700"
                  : "bg-slate-950/50 text-slate-400 border-transparent hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === "RESUMO" && (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="py-2.5 px-3">Nº</th>
                    <th className="py-2.5 px-3">Menu Principal</th>
                    <th className="py-2.5 px-3">Pacote</th>
                    <th className="py-2.5 px-3 text-center">Contagem Doc</th>
                    <th className="py-2.5 px-3 text-center">Acréscimos</th>
                    <th className="py-2.5 px-3 text-center">Retirados</th>
                    <th className="py-2.5 px-3 text-center">Total Atual</th>
                    <th className="py-2.5 px-3 text-center">Conferência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {FINANCIAL_MENUS.map((m) => {
                    const pkg = PACKAGE_INFO[m.pkg];
                    return (
                      <tr key={m.id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-mono font-bold text-emerald-400">{m.number}</td>
                        <td className="py-2 px-3 font-semibold text-white">{m.title}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${pkg.color}`}>
                            {pkg.number} - {pkg.name}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-300">{m.docCount}</td>
                        <td className="py-2 px-3 text-center font-mono text-emerald-400 font-bold">
                          {m.addedCount > 0 ? `+${m.addedCount}` : "0"}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-rose-400">
                          {m.removedCount > 0 ? `-${m.removedCount}` : "0"}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-white">
                          {m.submenus.length}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" /> OK
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-950 font-bold text-white border-t border-slate-700">
                    <td className="py-2.5 px-3" colSpan={3}>
                      TOTAL GERAL CONFERIDO (17 MENUS)
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">{TOTAL_BASE_DOC_SUBMENUS}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-emerald-400">
                      +{TOTAL_ADDED_SUBMENUS}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-rose-400">
                      -{TOTAL_REMOVED_SUBMENUS}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-emerald-400 text-sm">
                      {TOTAL_SUBMENUS}
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-mono">FECHADO</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {activeTab === "SUBMENUS" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[260px]">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por código (ex: 06.11), nome do submenu ou observação..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {(["ALL", "Documento", "Proposta", "Acréscimo"] as const).map((orig) => (
                    <button
                      key={orig}
                      onClick={() => setOriginFilter(orig)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        originFilter === orig
                          ? "bg-emerald-600 text-white border-emerald-500"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                      }`}
                    >
                      {orig === "ALL" ? `Todos (${TOTAL_SUBMENUS})` : orig}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Menu</th>
                      <th className="py-2.5 px-3">Submenu</th>
                      <th className="py-2.5 px-3">Pacote</th>
                      <th className="py-2.5 px-3 text-center">Origem</th>
                      <th className="py-2.5 px-3">Observação / Escopo</th>
                      <th className="py-2.5 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {allSubmenus.map((s) => (
                      <tr
                        key={s.id}
                        className={
                          s.origin === "Acréscimo"
                            ? "bg-emerald-950/20 hover:bg-emerald-950/35"
                            : "hover:bg-slate-800/30"
                        }
                      >
                        <td className="py-2 px-3 font-mono font-bold text-emerald-400">{s.code}</td>
                        <td className="py-2 px-3 text-slate-300">
                          {s.menuNumber}. {s.menuTitle}
                        </td>
                        <td className="py-2 px-3 font-semibold text-white">{s.title}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-300">{s.pkgLabel}</td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              s.origin === "Acréscimo"
                                ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/40"
                                : s.origin === "Documento"
                                ? "bg-indigo-500/20 text-indigo-300"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {s.origin}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-[11px]">
                          {s.note ? (
                            <span className="text-amber-300 font-medium">{s.note} — </span>
                          ) : null}
                          {s.description}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => {
                              onSelectSubmenu(s.id);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-[11px] font-semibold transition cursor-pointer"
                          >
                            <span>Abrir</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "PACOTES" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.values(PACKAGE_INFO).map((p) => (
                <div
                  key={p.code}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-1 rounded text-xs font-bold border ${p.color}`}>
                      Pacote {p.number} — {p.name}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Menus incluídos: {p.menusIncluded}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-1">{p.summary}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === "PERFIS" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.values(ROLE_PROFILES).map((prof) => (
                <div
                  key={prof.role}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${prof.badgeColor}`}>
                      {prof.label}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Portal: {prof.portalType}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{prof.description}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === "REGRAS" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ARCHITECTURAL_RULES.map((rule, idx) => (
                <div
                  key={rule.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>
                        {idx + 1}. {rule.title}
                      </span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono text-[10px] font-bold">
                      {rule.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{rule.description}</p>
                  <div className="text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-900">
                    Menus relacionados: {rule.relatedMenus.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
