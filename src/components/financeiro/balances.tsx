"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateBankAccountDialog } from "@/components/financeiro/create-bank-account-dialog";
import { Plus, CheckCircle2, AlertTriangle, Layers3, GitCompareArrows, ArrowDownToLine, BookOpenCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, ErrorNotice, Loading, PageHeading, useApi } from "@/components/financeiro/shared";
import { fmtBRL } from "@/lib/money";

type EventPositionItem = {
  id: string;
  name: string;
  producerId?: string;
  producerName?: string;
  totalCents: string;
  settledCents: string;
  committedCents: string;
  reserveCents?: string;
  retainedCents?: string;
  transferReservedCents?: string;
  transferOutCents?: string;
  transferInCents?: string;
  internalPositionCents?: string;
  repasseCents: string;
  antecipacaoCents: string;
};

type Internal = {
  mode: "INTERNAL";
  items: {
    id: string;
    name: string;
    institution: string;
    active: boolean;
    balanceCents: string;
    ledgerBalanceCents: string;
    reconciled: boolean;
  }[];
  events?: EventPositionItem[];
};
type Producer = {
  mode: "PRODUCER_INFORMATIONAL";
  items: EventPositionItem[];
};

export function BalancesPage() {
  const { data, error, loading, reload } = useApi<Internal | Producer>("/api/saldos");
  const [open, setOpen] = useState(false);

  const internalItems = data?.mode === "INTERNAL" ? data.items : [];
  const internalEvents = data?.mode === "INTERNAL" ? data.events ?? [] : [];
  const totalBankCents = internalItems.reduce((acc, a) => acc + BigInt(a.balanceCents || "0"), 0n);
  const totalLedgerCents = internalItems.reduce((acc, a) => acc + BigInt(a.ledgerBalanceCents || "0"), 0n);
  const diffCents = totalBankCents - totalLedgerCents;

  return (
    <>
      <PageHeading
        eyebrow="Controle de posições"
        title="Saldos e Posições"
        subtitle={
          data?.mode === "PRODUCER_INFORMATIONAL"
            ? "Posição das obrigações de cada evento, com reserva para solicitações, retenções contratuais e baixas já registradas."
            : "Compare saldos bancários registrados com o razão financeiro, identifique divergências e acompanhe a posição segregada por evento e produtor."
        }
        action={
          data?.mode === "INTERNAL" ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/contas"
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Origem dos Saldos (Tesouraria)
              </Link>
              <Button onClick={() => setOpen(true)}>
                <Plus size={17} />
                Nova conta bancária
              </Button>
            </div>
          ) : undefined
        }
      />
      {error && <ErrorNotice message={error} retry={reload} />} {loading && <Loading />}
      {data?.mode === "INTERNAL" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Contas bancárias cadastradas</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{internalItems.length}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Saldo bancário registrado</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{fmtBRL(totalBankCents.toString())}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Saldo interno (razão)</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{fmtBRL(totalLedgerCents.toString())}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Divergência atual</p>
              <p className={`mt-2 text-2xl font-bold ${diffCents === 0n ? "text-emerald-700" : "text-red-700"}`}>
                {fmtBRL(diffCents.toString())}
              </p>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Plus size={15} />
              Nova conta bancária
            </Button>
            <Link
              href="/conciliacao"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <GitCompareArrows size={15} />
              Importar extrato & Abrir conciliação
            </Link>
            <Link
              href="/recebimentos"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowDownToLine size={15} />
              Registrar recebimentos
            </Link>
            <Link
              href="/retencoes"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retenções por Evento
            </Link>
            <Link
              href="/transferencias"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Transferências entre Eventos
            </Link>
            <Link
              href="/contabilidade/livros"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <BookOpenCheck size={15} />
              Ver lançamentos contábeis
            </Link>
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-5">
              <span className="font-semibold">Conciliação interna de saldos bancários</span>
              <Link href="/contas" className="text-xs font-semibold text-[#e3574f] hover:underline">
                Ver decomposição de saldo inicial + entradas/saídas →
              </Link>
            </div>
            {data.items.length ? (
              <div className="overflow-x-auto">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Conta</th>
                      <th>Instituição</th>
                      <th>Saldo registrado</th>
                      <th>Saldo pelo razão</th>
                      <th>Verificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((a) => (
                      <tr key={a.id}>
                        <td className="font-semibold">{a.name}</td>
                        <td>{a.institution}</td>
                        <td className="whitespace-nowrap font-semibold">{fmtBRL(a.balanceCents)}</td>
                        <td className="whitespace-nowrap">{fmtBRL(a.ledgerBalanceCents)}</td>
                        <td>
                          {a.reconciled ? (
                            <Badge tone="green">
                              <CheckCircle2 size={12} className="mr-1" />
                              Conferido
                            </Badge>
                          ) : (
                            <Badge tone="red">
                              <AlertTriangle size={12} className="mr-1" />
                              Divergente
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 px-5 py-8">
                <Empty text="Nenhuma conta bancária cadastrada. Adicione uma conta para começar a acompanhar os saldos e a conciliação." />
                <div className="max-w-lg rounded-xl border border-slate-100 bg-slate-50 p-4 text-left text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">Fluxo guiado de primeiro uso:</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-4">
                    <li>Cadastre a conta bancária operacional informando instituição e saldo inicial.</li>
                    <li>Cadastre produtores, eventos e taxas comerciais em Cadastros e Divisão de Receitas.</li>
                    <li>Registre recebimentos/vendas e realize a conciliação de extratos para liberar repasses.</li>
                  </ol>
                </div>
                <Button onClick={() => setOpen(true)}>
                  <Plus size={17} />
                  Cadastrar conta bancária
                </Button>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-5">
              <div>
                <h2 className="font-semibold">Posições segregadas por evento e produtor</h2>
                <p className="text-xs text-slate-500">
                  Direitos líquidos das vendas, valores efetivamente liquidados, retenções obrigatórias (ECAD/locação), transferências e saldo elegível para repasse.
                </p>
              </div>
              <Link href="/repasses" className="text-xs font-semibold text-[#e3574f] hover:underline">
                Gerenciar repasses & 20 travas →
              </Link>
            </div>
            {internalEvents.length ? (
              <div className="overflow-x-auto">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Evento</th>
                      <th>Produtor</th>
                      <th>Direitos totais</th>
                      <th>Liquidado (Disk)</th>
                      <th>Retenções ativas</th>
                      <th>Comprometido / Transf.</th>
                      <th>Posição interna</th>
                      <th>Elegível p/ repasse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {internalEvents.map((ev) => (
                      <tr key={ev.id}>
                        <td className="font-semibold">{ev.name}</td>
                        <td>{ev.producerName || "—"}</td>
                        <td className="whitespace-nowrap">{fmtBRL(ev.totalCents)}</td>
                        <td className="whitespace-nowrap">{fmtBRL(ev.settledCents)}</td>
                        <td className="whitespace-nowrap text-amber-700 font-medium">{fmtBRL(ev.reserveCents || ev.retainedCents || "0")}</td>
                        <td className="whitespace-nowrap">{fmtBRL(ev.committedCents)}</td>
                        <td className="whitespace-nowrap">{fmtBRL(ev.internalPositionCents || ev.settledCents)}</td>
                        <td className="whitespace-nowrap font-bold text-emerald-700">{fmtBRL(ev.repasseCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="Nenhum evento cadastrado até o momento." />
            )}
          </Card>
        </div>
      )}
      {data?.mode === "PRODUCER_INFORMATIONAL" && (
        <>
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle size={17} className="mr-2 inline" />
            Os valores exibidos são direitos calculados do produtor. Não representam o saldo de contas bancárias internas nem garantem transferência imediata.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((e) => (
              <Card key={e.id}>
                <div className="p-6">
                  <div className="mb-5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers3 size={18} className="text-slate-500" />
                      <h3 className="font-semibold">{e.name}</h3>
                    </div>
                    <div className="flex gap-2">
                      <Link href="/repasses" className="text-xs font-semibold text-emerald-700 hover:underline">
                        Solicitar repasse
                      </Link>
                      <span className="text-xs text-slate-300">·</span>
                      <Link href="/transferencias" className="text-xs font-semibold text-indigo-700 hover:underline">
                        Transferir
                      </Link>
                    </div>
                  </div>
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-slate-500">Direitos do produtor registrados</span>
                    <strong>{fmtBRL(e.totalCents)}</strong>
                  </div>
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-slate-500">Recebidos pela Disk (liquidados)</span>
                    <strong>{fmtBRL(e.settledCents)}</strong>
                  </div>
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-slate-500">Retenções contratuais / obrigatórias ativas</span>
                    <strong className="text-amber-700">{fmtBRL(e.reserveCents || e.retainedCents || "0")}</strong>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
                    <span className="text-slate-500">Elegível para solicitação de repasse</span>
                    <p className="mt-2 font-semibold text-emerald-800">{fmtBRL(e.repasseCents)}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Reservado, transferido ou já baixado: {fmtBRL(e.committedCents)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
            {data.items.length === 0 && (
              <Card>
                <Empty text="Ainda não há eventos vinculados ao seu perfil." />
              </Card>
            )}
          </div>
        </>
      )}
      {data?.mode === "INTERNAL" && <CreateBankAccountDialog open={open} onOpenChange={setOpen} onCreated={reload} />}
    </>
  );
}
