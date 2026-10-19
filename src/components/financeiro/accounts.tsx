"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Landmark, Plus, Wallet, CheckCircle2, ArrowRight, FileCheck2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateBankAccountDialog } from "@/components/financeiro/create-bank-account-dialog";
import { Empty, ErrorNotice, Loading, PageHeading, displayDateTime, useApi, type Account } from "@/components/financeiro/shared";
import { fmtBRL } from "@/lib/money";

type AccountDetailed = Account & {
  openingCents?: string;
  creditsCents?: string;
  debitsCents?: string;
  ledgerCents?: string;
  diffCents?: string;
  entriesCount?: number;
  recentEntries?: {
    id: string;
    origin: string;
    direction: "CREDIT" | "DEBIT";
    amountCents: string;
    description: string;
    createdAt: string;
  }[];
};

const ORIGIN_LABELS: Record<string, string> = {
  OPENING: "Saldo inicial de abertura",
  RECEIVABLE_SETTLEMENT: "Liquidação de recebível",
  PAYABLE_SETTLEMENT: "Liquidação de conta a pagar",
  PAYOUT_SETTLEMENT: "Baixa de repasse / antecipação",
};

export function AccountsPage() {
  const { data, error, loading, reload } = useApi<{ items: AccountDetailed[] }>("/api/contas");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("nova") === "1") {
      setOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const items = data?.items ?? [];
  const totalBalance = items.reduce((s, a) => s + BigInt(a.balanceCents || "0"), 0n);
  const totalLedger = items.reduce((s, a) => s + BigInt(a.ledgerCents ?? a.balanceCents ?? "0"), 0n);
  const totalOpening = items.reduce((s, a) => s + BigInt(a.openingCents ?? "0"), 0n);
  const totalDiff = totalBalance - totalLedger;

  return (
    <>
      <PageHeading
        eyebrow="Tesouraria e bancos"
        title="Contas Bancárias e Vínculo com o Razão"
        subtitle="Controle os saldos reais informados, a origem de cada valor (saldo inicial vs. liquidações) e o vínculo estrito com o livro razão interno."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/saldos">
              <Button variant="outline">Posições e Conciliação</Button>
            </Link>
            <Button onClick={() => setOpen(true)}>
              <Plus size={17} />
              Nova conta bancária
            </Button>
          </div>
        }
      />

      {error && <ErrorNotice message={error} retry={reload} />}
      {loading && <Loading />}

      {data && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Contas bancárias ativas</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {items.filter((a) => a.active).length} / {items.length}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Habilitadas para liquidação de títulos</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Saldo bancário registrado</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{fmtBRL(totalBalance)}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Inclui {fmtBRL(totalOpening)} de saldo inicial de abertura
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Posição no razão interno</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{fmtBRL(totalLedger)}</p>
              <p className="mt-1 text-[11px] text-slate-400">Soma auditada de créditos menos débitos</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Divergência (Banco − Razão)</p>
              <p className={`mt-2 text-2xl font-bold ${totalDiff === 0n ? "text-emerald-700" : "text-amber-700"}`}>
                {fmtBRL(totalDiff)}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {totalDiff === 0n ? "100% íntegro com o razão" : "Verificar lançamentos pendentes"}
              </p>
            </Card>
          </div>

          {items.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-4 p-10 text-center">
                <Empty text="Nenhuma conta cadastrada. Cadastre uma conta para registrar liquidações." />
                <Button onClick={() => setOpen(true)}>
                  <Plus size={17} />
                  Cadastrar primeira conta
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {items.map((a) => {
                const diff = BigInt(a.diffCents ?? "0");
                return (
                  <Card key={a.id} className="overflow-hidden">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="rounded-xl bg-sky-50 p-3 text-sky-700">
                            <Landmark size={21} />
                          </span>
                          <div>
                            <h3 className="text-base font-bold text-slate-900">{a.name}</h3>
                            <p className="text-xs text-slate-500">
                              Instituição: <strong>{a.institution}</strong>
                              {a.lastFour ? ` · Final ${a.lastFour}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={diff === 0n ? "green" : "amber"}>
                            {diff === 0n ? "Conciliada com Razão" : "Divergente"}
                          </Badge>
                          <Badge tone={a.active ? "green" : "neutral"}>{a.active ? "Ativa" : "Inativa"}</Badge>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2">
                        <div>
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Wallet size={14} /> Saldo bancário atual
                          </p>
                          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                            {fmtBRL(a.balanceCents)}
                          </p>
                        </div>
                        <div>
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <FileCheck2 size={14} /> Posição no razão interno
                          </p>
                          <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-700">
                            {fmtBRL(a.ledgerCents ?? a.balanceCents)}
                          </p>
                        </div>
                      </div>

                      {/* Origem detalhada do saldo */}
                      <div className="mt-4 rounded-xl border border-slate-100 p-4 text-xs">
                        <p className="mb-2 font-bold uppercase tracking-wider text-slate-500">
                          Composição e origem do saldo ({a.entriesCount ?? 0} lançamento(s) no razão)
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <span className="text-slate-500">Saldo inicial (Abertura)</span>
                            <p className="mt-0.5 font-semibold text-slate-900">{fmtBRL(a.openingCents ?? "0")}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">+ Entradas liquidadas</span>
                            <p className="mt-0.5 font-semibold text-emerald-700">{fmtBRL(a.creditsCents ?? "0")}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">− Saídas / Baixas</span>
                            <p className="mt-0.5 font-semibold text-rose-700">{fmtBRL(a.debitsCents ?? "0")}</p>
                          </div>
                        </div>

                        {a.recentEntries && a.recentEntries.length > 0 && (
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <p className="mb-1.5 font-semibold text-slate-700">Últimos lançamentos vinculados no razão:</p>
                            <div className="space-y-1.5">
                              {a.recentEntries.map((entry) => (
                                <div key={entry.id} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="truncate text-slate-600">
                                    <strong>{ORIGIN_LABELS[entry.origin] ?? entry.origin}:</strong> {entry.description} (
                                    {displayDateTime(entry.createdAt)})
                                  </span>
                                  <span
                                    className={`shrink-0 font-mono font-bold ${
                                      entry.direction === "CREDIT" ? "text-emerald-700" : "text-rose-700"
                                    }`}
                                  >
                                    {entry.direction === "CREDIT" ? "+" : "−"} {fmtBRL(entry.amountCents)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                        <Link href="/recebimentos" className="font-semibold text-[#e3574f] hover:underline inline-flex items-center gap-1">
                          Liquidar recebíveis nesta conta <ArrowRight size={13} />
                        </Link>
                        <Link href="/conciliacao" className="font-semibold text-slate-600 hover:underline inline-flex items-center gap-1">
                          Conciliar extratos <ArrowRight size={13} />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
        {totalDiff === 0n ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-amber-600" />}
        Saldos registrados em centavos inteiros (BigInt) e vinculados ao livro razão com auditoria imutável.
      </div>
      <CreateBankAccountDialog open={open} onOpenChange={setOpen} onCreated={reload} />
    </>
  );
}
