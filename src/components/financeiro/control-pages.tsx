"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { ListSearch, searchRows } from "@/components/financeiro/list-search";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RecordDetailModal, DetailsButton } from "@/components/financeiro/record-detail-modal";
import { Plus, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, Empty, ErrorNotice, Field, Loading, PageHeading, useApi, displayDate } from "@/components/financeiro/shared";
import { FormCard, SelectField, inputClass } from "@/components/financeiro/operations-shared";
import { fmtBRL, parseBRLToCents } from "@/lib/money";

type Catalog = {
  accounts: { id: string; name: string; institution: string }[];
  events: { id: string; name: string; producerId: string }[];
  producers: { id: string; name: string }[];
  sales: { id: string; eventId: string; externalReference: string; producerNetCents: string }[];
};
function useCatalog() {
  return useApi<Catalog>("/api/controle/catalogo");
}
function PanelMessage({ text }: { text: string }) {
  return text ? <ErrorNotice message={text} /> : null;
}
function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return <Button disabled={busy}>{busy ? "Salvando..." : children}</Button>;
}
function Table({ heads, children }: { heads: string[]; children: React.ReactNode }) {
  return (
    <Card className="overflow-x-auto">
      <table className="dashboard-table">
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}

type Statement = {
  id: string;
  bankAccountId: string;
  accountName: string;
  externalId: string;
  postedAt: string;
  description: string;
  amountCents: string;
  direction: "CREDIT" | "DEBIT";
  status: "PENDING" | "MATCHED";
  ledgerEntryId: string | null;
};
type Ledger = {
  id: string;
  bankAccountId: string;
  description: string;
  amountCents: string;
  direction: "CREDIT" | "DEBIT";
  createdAt: string;
};

export function ReconciliationPage() {
  const [createOpen, setCreateOpen] = useState(false),
    [detailId, setDetailId] = useState<string | null>(null);
  const [tab, setTab] = useState<"ALL" | "PENDING" | "MATCHED" | "UNMATCHED_LEDGER">("ALL");
  const { data: c, error: ce, loading: cl } = useCatalog();
  const { data, error, loading, reload } = useApi<{ statements: Statement[]; ledger: Ledger[] }>(
    "/api/controle/extratos"
  );
  const [account, setAccount] = useState(""),
    [reference, setReference] = useState(""),
    [date, setDate] = useState(""),
    [description, setDescription] = useState(""),
    [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT"),
    [amount, setAmount] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  const statements = data?.statements ?? [];
  const ledger = data?.ledger ?? [];
  const matchedStatements = statements.filter((s) => s.status === "MATCHED");
  const pendingStatements = statements.filter((s) => s.status === "PENDING");
  const pendingAmountCents = pendingStatements.reduce((sum, s) => sum + BigInt(s.amountCents || "0"), 0n);

  const filteredByTab =
    tab === "PENDING"
      ? pendingStatements
      : tab === "MATCHED"
      ? matchedStatements
      : statements;

  const shown = searchRows(filteredByTab, query, (s) => [
    s.externalId,
    s.description,
    s.accountName,
    s.status,
  ]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/api/controle/extratos", {
        method: "POST",
        body: JSON.stringify({
          bankAccountId: account,
          externalId: reference,
          date,
          description,
          direction,
          amountCents: parseBRLToCents(amount),
        }),
      });
      setReference("");
      setDescription("");
      setAmount("");
      setCreateOpen(false);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível cadastrar a linha.");
    } finally {
      setBusy(false);
    }
  }

  async function match(statementId: string) {
    const ledgerEntryId = matches[statementId];
    if (!ledgerEntryId) return;
    setBusy(true);
    setMessage("");
    try {
      await api("/api/controle/conciliar", {
        method: "POST",
        body: JSON.stringify({ statementId, ledgerEntryId }),
      });
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível conciliar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Tesouraria · Conciliação"
        title="Conciliação Bancária e Tratamento de Divergências"
        subtitle="Importe lançamentos de extrato bancário, confira contra o livro razão interno e trate divergências sem alterar saldos diretamente."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/contabilidade/livros?aba=motor">
              <Button variant="outline">Conciliação Cartão / NSU PagSeguro</Button>
            </Link>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Registrar linha de extrato
            </Button>
          </div>
        }
      />

      <PanelMessage text={message} />
      {ce && <ErrorNotice message={ce} />}
      {error && <ErrorNotice message={error} retry={reload} />}

      {cl || loading ? (
        <Loading />
      ) : (
        <>
          {/* Indicadores próprios de Conciliação */}
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Extratos importados</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{statements.length}</p>
              <p className="mt-1 text-[11px] text-slate-400">Linhas registradas para conferência</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Conciliados com o razão</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{matchedStatements.length}</p>
              <p className="mt-1 text-[11px] text-slate-400">Pareamento 1:1 confirmado</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Pendentes / Divergentes</p>
              <p className="mt-2 text-2xl font-bold text-amber-800">{pendingStatements.length}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Volume pendente: {fmtBRL(pendingAmountCents)}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Razão disponível sem extrato</p>
              <p className="mt-2 text-2xl font-bold text-sky-800">{ledger.length}</p>
              <p className="mt-1 text-[11px] text-slate-400">Lançamentos internos aguardando vínculo</p>
            </Card>
          </div>

          <div className="mb-5">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogContent>
                <DialogTitle className="text-xl font-bold">Registrar linha de extrato</DialogTitle>
                <DialogDescription>
                  Registre a movimentação bancária comprovada para conferência. Não altera o saldo da conta.
                </DialogDescription>
                <form className="space-y-3" onSubmit={create}>
                  <SelectField label="Conta bancária" value={account} onChange={setAccount}>
                    <option value="">Selecione</option>
                    {c?.accounts.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} · {x.institution}
                      </option>
                    ))}
                  </SelectField>
                  <Field label="Referência única do extrato (NSU / Documento)">
                    <Input
                      required
                      value={reference}
                      minLength={4}
                      maxLength={100}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Ex.: EXT-2026-001"
                    />
                  </Field>
                  <Field label="Data do lançamento">
                    <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                  <Field label="Descrição no extrato">
                    <Input
                      required
                      minLength={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Ex.: TED Recebida Adquirente / PIX"
                    />
                  </Field>
                  <SelectField
                    label="Sentido"
                    value={direction}
                    onChange={(v) => setDirection(v as typeof direction)}
                  >
                    <option value="CREDIT">Entrada (Crédito)</option>
                    <option value="DEBIT">Saída (Débito)</option>
                  </SelectField>
                  <Field label="Valor (R$)">
                    <Input
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0,00"
                    />
                  </Field>
                  <Submit busy={busy}>Registrar para conferência</Submit>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ["ALL", `Todos os extratos (${statements.length})`],
                ["PENDING", `Pendentes / Divergentes (${pendingStatements.length})`],
                ["MATCHED", `Conciliados (${matchedStatements.length})`],
                ["UNMATCHED_LEDGER", `Razão sem extrato (${ledger.length})`],
              ] as const
            ).map(([k, label]) => (
              <Button
                key={k}
                size="sm"
                variant={tab === k ? "default" : "outline"}
                onClick={() => setTab(k)}
              >
                {label}
              </Button>
            ))}
          </div>

          {tab === "UNMATCHED_LEDGER" ? (
            ledger.length ? (
              <Table heads={["ID no Razão", "Descrição", "Sentido", "Valor", "Data"]}>
                {ledger.map((l) => {
                  const accName = c?.accounts.find((a) => a.id === l.bankAccountId)?.name ?? l.bankAccountId;
                  return (
                    <tr key={l.id}>
                      <td className="font-mono text-xs">{l.id.slice(-8)}</td>
                      <td>
                        <strong>{accName}</strong>
                        <p className="text-xs text-slate-500">{l.description}</p>
                      </td>
                      <td>
                        <Badge tone={l.direction === "CREDIT" ? "green" : "amber"}>
                          {l.direction === "CREDIT" ? "Entrada (Crédito)" : "Saída (Débito)"}
                        </Badge>
                      </td>
                      <td className="font-semibold">{fmtBRL(l.amountCents)}</td>
                      <td>{displayDate(l.createdAt)}</td>
                    </tr>
                  );
                })}
              </Table>
            ) : (
              <Empty text="Todos os lançamentos do razão já estão conciliados." />
            )
          ) : (
            <>
              <ListSearch
                value={query}
                onChange={setQuery}
                count={shown.length}
                label="Buscar extrato, conta ou referência"
              />
              {shown.length ? (
                <Table heads={["Extrato / Conta", "Valor", "Status", "Detalhes", "Vincular ao razão"]}>
                  {shown.map((s) => {
                    const options = ledger.filter(
                      (x) =>
                        x.bankAccountId === s.bankAccountId &&
                        x.direction === s.direction &&
                        x.amountCents === s.amountCents
                    );
                    return (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.accountName}</strong>
                          <p className="text-xs text-slate-500">
                            {s.externalId} · {displayDate(s.postedAt)} · {s.description}
                          </p>
                        </td>
                        <td className="font-semibold">
                          {s.direction === "CREDIT" ? "Entrada" : "Saída"} · {fmtBRL(s.amountCents)}
                        </td>
                        <td>
                          <Badge tone={s.status === "MATCHED" ? "green" : "amber"}>
                            {s.status === "MATCHED" ? "Conciliado" : "Pendente"}
                          </Badge>
                        </td>
                        <td>
                          <DetailsButton onClick={() => setDetailId(s.id)} />
                        </td>
                        <td>
                          {s.status === "MATCHED" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 size={14} /> Vínculo registrado
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                className={inputClass}
                                aria-label="Lançamento contábil"
                                value={matches[s.id] ?? ""}
                                onChange={(e) => setMatches((v) => ({ ...v, [s.id]: e.target.value }))}
                              >
                                <option value="">
                                  {options.length
                                    ? "Escolha o lançamento compatível"
                                    : "Sem lançamento idêntico no razão"}
                                </option>
                                {options.map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.description.slice(0, 60)} · {x.id.slice(-6)}
                                  </option>
                                ))}
                              </select>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!matches[s.id] || busy}
                                onClick={() => match(s.id)}
                              >
                                Conciliar
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              ) : (
                <Card className="p-10 text-center">
                  <Empty text="Não existem linhas de extrato importadas para este filtro." />
                  <div className="mt-4 flex justify-center">
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus size={16} />
                      Registrar primeira linha de extrato
                    </Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
      <RecordDetailModal record={detailId ? { type: "extrato", id: detailId } : null} onClose={() => setDetailId(null)} />
    </>
  );
}

type Risk = {
  id: string;
  externalId: string;
  saleReference: string;
  eventName: string;
  type: "REFUND" | "CHARGEBACK";
  status: "OPEN" | "CONFIRMED" | "REJECTED";
  reason: string;
  exposureCents: string;
  createdAt: string;
};

export function RiskPage() {
  const [createOpen, setCreateOpen] = useState(false),
    [detailId, setDetailId] = useState<string | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<{
    id: string;
    decision: "CONFIRMED" | "REJECTED";
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "CONFIRMED" | "REJECTED">("ALL");
  const [query, setQuery] = useState("");
  const { data: c, error: ce } = useCatalog();
  const { data, error, loading, reload } = useApi<{ items: Risk[] }>("/api/controle/riscos");
  const [sale, setSale] = useState(""),
    [reference, setReference] = useState(""),
    [type, setType] = useState<"REFUND" | "CHARGEBACK">("REFUND"),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");

  const items = data?.items ?? [];
  const openRisks = items.filter((r) => r.status === "OPEN");
  const confirmedRisks = items.filter((r) => r.status === "CONFIRMED");
  const rejectedRisks = items.filter((r) => r.status === "REJECTED");
  const openExposureCents = openRisks.reduce((s, r) => s + BigInt(r.exposureCents || "0"), 0n);
  const confirmedLossCents = confirmedRisks.reduce((s, r) => s + BigInt(r.exposureCents || "0"), 0n);

  const filteredByStatus =
    statusFilter === "ALL" ? items : items.filter((r) => r.status === statusFilter);
  const shown = searchRows(filteredByStatus, query, (r) => [
    r.externalId,
    r.saleReference,
    r.eventName,
    r.type,
    r.status,
    r.reason,
  ]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/api/controle/riscos", {
        method: "POST",
        body: JSON.stringify({
          saleId: sale,
          externalId: reference,
          type,
          exposureCents: parseBRLToCents(amount),
          reason,
        }),
      });
      setReference("");
      setReason("");
      setAmount("");
      setCreateOpen(false);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha no registro.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, decision: "CONFIRMED" | "REJECTED") {
    setBusy(true);
    setMessage("");
    try {
      await api("/api/controle/risco-decisao", {
        method: "POST",
        body: JSON.stringify({ id, decision }),
      });
      setDecisionTarget(null);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha na decisão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Controle · Cancelamentos, Estornos e Disputas"
        title="Cancelamentos de Pedidos, Estornos e Chargebacks"
        subtitle="Registre solicitações de cancelamento/reembolso e disputas de cartão (chargebacks), bloqueie cautelarmente o saldo de repasse do produtor e formalize a decisão auditada."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Registrar cancelamento / ocorrência
          </Button>
        }
      />

      <PanelMessage text={message} />
      {ce && <ErrorNotice message={ce} />}
      {error && <ErrorNotice message={error} retry={reload} />}

      {/* Indicadores próprios de Cancelamentos, Estornos e Chargebacks */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Em análise (Reserva cautelar)</p>
          <p className="mt-2 text-2xl font-bold text-amber-800">{fmtBRL(openExposureCents)}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {openRisks.length} caso(s) retendo limite de repasse
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Cancelamentos / Perdas confirmadas</p>
          <p className="mt-2 text-2xl font-bold text-rose-700">{fmtBRL(confirmedLossCents)}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {confirmedRisks.length} abatimento(s) definitivo(s)
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Disputas ganhas / Rejeitadas</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{rejectedRisks.length}</p>
          <p className="mt-1 text-[11px] text-slate-400">Reservas liberadas de volta ao produtor</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Vendas disponíveis para vínculo</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{c?.sales.length ?? 0}</p>
          <p className="mt-1 text-[11px] text-slate-400">Transações registradas por evento</p>
        </Card>
      </div>

      <div className="mb-5">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogTitle className="text-xl font-bold">
              Registrar cancelamento, estorno ou chargeback
            </DialogTitle>
            <DialogDescription>
              A exposição informada será reservada imediatamente sobre o saldo de repasse do evento.
            </DialogDescription>
            <form className="space-y-3" onSubmit={create}>
              <SelectField label="Venda de origem (Pedido)" value={sale} onChange={setSale}>
                <option value="">Selecione a venda</option>
                {c?.sales.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.externalReference} · Líquido produtor {fmtBRL(x.producerNetCents)}
                  </option>
                ))}
              </SelectField>
              <Field label="Protocolo único (Cancelamento / Disputa)">
                <Input
                  required
                  minLength={4}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Ex.: CANC-2026-001 ou CBK-9901"
                />
              </Field>
              <SelectField
                label="Classificação"
                value={type}
                onChange={(v) => setType(v as typeof type)}
              >
                <option value="REFUND">Cancelamento de Pedido / Estorno (Refund)</option>
                <option value="CHARGEBACK">Contestação de Cartão (Chargeback)</option>
              </SelectField>
              <Field label="Exposição do direito do produtor (R$)">
                <Input
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                />
              </Field>
              <Field label="Motivo / Justificativa da análise">
                <Input
                  required
                  minLength={8}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: Solicitação CDC 7 dias / Contestação portador"
                />
              </Field>
              <Submit busy={busy}>Registrar e bloquear reserva</Submit>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["ALL", `Todas (${items.length})`],
            ["OPEN", `Em análise (${openRisks.length})`],
            ["CONFIRMED", `Confirmadas / Canceladas (${confirmedRisks.length})`],
            ["REJECTED", `Liberadas (${rejectedRisks.length})`],
          ] as const
        ).map(([k, txt]) => (
          <Button
            key={k}
            size="sm"
            variant={statusFilter === k ? "default" : "outline"}
            onClick={() => setStatusFilter(k)}
          >
            {txt}
          </Button>
        ))}
      </div>

      <ListSearch
        value={query}
        onChange={setQuery}
        count={shown.length}
        label="Buscar protocolo, pedido, evento ou status"
      />
      {loading ? (
        <Loading />
      ) : shown.length ? (
        <Table heads={["Protocolo / Tipo", "Evento / Pedido", "Impacto (Reserva)", "Situação", "Detalhes", "Decisão"]}>
          {shown.map((x) => (
            <tr key={x.id}>
              <td>
                <strong>{x.externalId}</strong>
                <p className="text-xs text-slate-500">
                  {x.type === "REFUND" ? "Cancelamento / Estorno" : "Chargeback"} · {x.reason}
                </p>
              </td>
              <td>
                {x.eventName}
                <p className="text-xs text-slate-500">Pedido: {x.saleReference}</p>
              </td>
              <td className="font-semibold">{fmtBRL(x.exposureCents)}</td>
              <td>
                <Badge
                  tone={
                    x.status === "OPEN" ? "amber" : x.status === "CONFIRMED" ? "red" : "green"
                  }
                >
                  {x.status === "OPEN"
                    ? "Em análise (Reserva ativa)"
                    : x.status === "CONFIRMED"
                    ? "Cancelamento / Perda confirmada"
                    : "Rejeitado (Saldo liberado)"}
                </Badge>
              </td>
              <td>
                <DetailsButton onClick={() => setDetailId(x.id)} />
              </td>
              <td>
                {x.status === "OPEN" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => setDecisionTarget({ id: x.id, decision: "CONFIRMED" })}
                    >
                      Confirmar baixa
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      variant="outline"
                      onClick={() => setDecisionTarget({ id: x.id, decision: "REJECTED" })}
                    >
                      Liberar saldo
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Card className="p-10 text-center">
          <Empty text="Nenhum cancelamento, estorno ou chargeback registrado para este filtro." />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(c?.sales.length ?? 0) === 0 ? (
              <Link href="/vendas">
                <Button variant="outline">
                  Registrar venda em Vendas por Evento primeiro <ArrowRight size={14} className="ml-1" />
                </Button>
              </Link>
            ) : (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Registrar cancelamento / ocorrência
              </Button>
            )}
          </div>
        </Card>
      )}
      <RecordDetailModal
        record={detailId ? { type: "ocorrencia", id: detailId } : null}
        onClose={() => setDetailId(null)}
      />
      <Dialog
        open={!!decisionTarget}
        onOpenChange={(open) => {
          if (!open) setDecisionTarget(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl font-bold">Confirmar decisão financeira</DialogTitle>
          <DialogDescription>
            A decisão será gravada no banco de dados com trilha de auditoria e atualizará imediatamente o saldo elegível do produtor.
          </DialogDescription>
          <p className="my-5 text-sm text-slate-700">
            {decisionTarget?.decision === "CONFIRMED"
              ? "Confirmar o cancelamento/perda definitiva no direito do produtor?"
              : "Rejeitar a ocorrência e devolver o valor reservado ao saldo disponível do produtor?"}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDecisionTarget(null)}>
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={() => decisionTarget && decide(decisionTarget.id, decisionTarget.decision)}
            >
              {busy ? "Processando..." : "Confirmar decisão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Budget = {
  id: string;
  eventId: string;
  eventName: string;
  kind: "REVENUE" | "EXPENSE";
  category: string;
  description: string;
  amountCents: string;
};

const BUDGET_CATEGORIES = [
  "Ingressos e Bilheteria",
  "Patrocínio e Cotas Comerciais",
  "Alimentos, Bebidas e Bar",
  "Artístico e Cachê",
  "Estrutura, Som e Iluminação",
  "ECAD e Direitos Autorais",
  "Locação de Espaço / Aluguel",
  "Marketing, Mídia e Tráfego",
  "Segurança, Brigada e Limpeza",
  "Taxas Operacionais e Impostos",
];

export function BudgetPage() {
  const [createOpen, setCreateOpen] = useState(false),
    [detailId, setDetailId] = useState<string | null>(null),
    [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"ALL" | "REVENUE" | "EXPENSE">("ALL");
  const { data: c, error: ce } = useCatalog();
  const { data, error, loading, reload } = useApi<{
    items: Budget[];
    truncated: boolean;
    summaries: { eventId: string; eventName: string; revenue: string; expense: string; result: string }[];
  }>("/api/controle/orcamentos");
  const [event, setEvent] = useState(""),
    [kind, setKind] = useState<"REVENUE" | "EXPENSE">("EXPENSE"),
    [category, setCategory] = useState(BUDGET_CATEGORIES[3]),
    [description, setDescription] = useState(""),
    [amount, setAmount] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);

  const items = data?.items ?? [];
  const summaries = data?.summaries ?? [];
  const totalRevenue = items
    .filter((i) => i.kind === "REVENUE")
    .reduce((s, i) => s + BigInt(i.amountCents || "0"), 0n);
  const totalExpense = items
    .filter((i) => i.kind === "EXPENSE")
    .reduce((s, i) => s + BigInt(i.amountCents || "0"), 0n);
  const plannedResult = totalRevenue - totalExpense;

  const filteredItems = kindFilter === "ALL" ? items : items.filter((b) => b.kind === kindFilter);
  const shown = searchRows(filteredItems, query, (b) => [
    b.eventName,
    b.category,
    b.description,
    b.kind,
  ]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/api/controle/orcamentos", {
        method: "POST",
        body: JSON.stringify({
          eventId: event,
          kind,
          category,
          description,
          amountCents: parseBRLToCents(amount),
        }),
      });
      setDescription("");
      setAmount("");
      setCreateOpen(false);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Planejamento financeiro"
        title="Orçamento Operacional por Evento"
        subtitle="Projete receitas e itens de despesas por centro de custo do evento (Artístico, Estrutura, ECAD, Locação, Marketing) e acompanhe a margem planejada."
        action={
          <Button
            onClick={() => {
              if (!event && c?.events[0]) setEvent(c.events[0].id);
              setCreateOpen(true);
            }}
          >
            <Plus size={16} />
            Novo item de orçamento
          </Button>
        }
      />

      <PanelMessage text={message} />
      {ce && <ErrorNotice message={ce} />}
      {error && <ErrorNotice message={error} retry={reload} />}

      {/* Indicadores próprios de Orçamento por Evento */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Receitas previstas (Orçadas)</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{fmtBRL(totalRevenue)}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {items.filter((i) => i.kind === "REVENUE").length} linha(s) de receita
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Despesas previstas (Orçadas)</p>
          <p className="mt-2 text-2xl font-bold text-rose-700">{fmtBRL(totalExpense)}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {items.filter((i) => i.kind === "EXPENSE").length} item(ns) de custo/despesa
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Resultado planejado (Margem)</p>
          <p
            className={`mt-2 text-2xl font-bold ${
              plannedResult >= 0n ? "text-slate-900" : "text-rose-700"
            }`}
          >
            {fmtBRL(plannedResult)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Receitas previstas menos despesas previstas</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Eventos com orçamento</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {summaries.length} / {c?.events.length ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Consolidação por centro de resultado</p>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[780px]">
          <DialogTitle className="text-xl font-bold">Novo item de orçamento do evento</DialogTitle>
          <DialogDescription>
            Cadastre receitas ou despesas planejadas por categoria operacional do evento.
          </DialogDescription>
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
            <SelectField label="Evento" value={event} onChange={setEvent}>
              <option value="">Selecione o evento</option>
              {c?.events.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Natureza orçamentária"
              value={kind}
              onChange={(v) => setKind(v as typeof kind)}
            >
              <option value="EXPENSE">Despesa / Custo previsto</option>
              <option value="REVENUE">Receita prevista</option>
            </SelectField>
            <Field label="Categoria / Centro de custo">
              <Input
                required
                list="budget-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex.: Artístico, Estrutura, ECAD..."
              />
              <datalist id="budget-categories">
                {BUDGET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </Field>
            <Field label="Valor previsto (R$)">
              <Input
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Descrição detalhada do item">
                <Input
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: Locação do espaço principal / Taxa ECAD estimada / Cachê atração"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Submit busy={busy}>Salvar item no orçamento</Submit>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {summaries.length > 0 && (
        <div className="my-5 grid gap-3 md:grid-cols-3">
          {summaries.map((x) => (
            <Card className="p-4" key={x.eventId}>
              <p className="font-semibold text-slate-900">{x.eventName}</p>
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                <p className="flex justify-between">
                  <span>Receitas previstas:</span>
                  <strong className="text-emerald-700">{fmtBRL(x.revenue)}</strong>
                </p>
                <p className="flex justify-between">
                  <span>Despesas previstas:</span>
                  <strong className="text-rose-700">{fmtBRL(x.expense)}</strong>
                </p>
                <p className="flex justify-between border-t border-slate-100 pt-1 text-sm font-bold text-slate-900">
                  <span>Saldo planejado:</span>
                  <span>{fmtBRL(x.result)}</span>
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["ALL", `Todos os itens (${items.length})`],
            ["EXPENSE", `Despesas previstas (${items.filter((i) => i.kind === "EXPENSE").length})`],
            ["REVENUE", `Receitas previstas (${items.filter((i) => i.kind === "REVENUE").length})`],
          ] as const
        ).map(([k, txt]) => (
          <Button
            key={k}
            size="sm"
            variant={kindFilter === k ? "default" : "outline"}
            onClick={() => setKindFilter(k)}
          >
            {txt}
          </Button>
        ))}
      </div>

      {data?.truncated && (
        <p className="mb-3 text-sm text-amber-700">
          Exibindo 200 lançamentos; utilize a busca para refinar por evento ou categoria.
        </p>
      )}
      <ListSearch
        value={query}
        onChange={setQuery}
        count={shown.length}
        label="Buscar item orçamentário, categoria ou evento"
      />
      {loading ? (
        <Loading />
      ) : shown.length ? (
        <Table heads={["Evento", "Categoria", "Descrição do item", "Natureza", "Valor previsto", "Detalhes"]}>
          {shown.map((x) => (
            <tr key={x.id}>
              <td className="font-semibold">{x.eventName}</td>
              <td>
                <Badge tone="neutral">{x.category}</Badge>
              </td>
              <td>{x.description}</td>
              <td>
                <Badge tone={x.kind === "REVENUE" ? "green" : "amber"}>
                  {x.kind === "REVENUE" ? "Receita prevista" : "Despesa prevista"}
                </Badge>
              </td>
              <td className="font-semibold">{fmtBRL(x.amountCents)}</td>
              <td>
                <DetailsButton onClick={() => setDetailId(x.id)} />
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Card className="p-10 text-center">
          <Empty text="Nenhum item de orçamento cadastrado para este filtro." />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(c?.events.length ?? 0) === 0 ? (
              <Link href="/cadastros">
                <Button variant="outline">
                  Cadastrar evento em Cadastros primeiro <ArrowRight size={14} className="ml-1" />
                </Button>
              </Link>
            ) : (
              <Button
                onClick={() => {
                  if (!event && c?.events[0]) setEvent(c.events[0].id);
                  setCreateOpen(true);
                }}
              >
                <Plus size={16} />
                Cadastrar primeiro item de orçamento
              </Button>
            )}
          </div>
        </Card>
      )}
      <RecordDetailModal
        record={detailId ? { type: "orcamento", id: detailId } : null}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}

type Contract = {
  id: string;
  title: string;
  counterparty: string;
  eventName: string;
  status: "DRAFT" | "ACTIVE" | "EXPIRED";
  startDate: string;
  endDate: string | null;
  terms: string;
};

export function ContractsPage() {
  const [createOpen, setCreateOpen] = useState(false),
    [detailId, setDetailId] = useState<string | null>(null),
    [query, setQuery] = useState("");
  const { data: c, error: ce } = useCatalog();
  const { data, error, loading, reload } = useApi<{ items: Contract[] }>("/api/controle/contratos");
  const [title, setTitle] = useState(""),
    [counterparty, setCounterparty] = useState(""),
    [event, setEvent] = useState(""),
    [status, setStatus] = useState<Contract["status"]>("ACTIVE"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [terms, setTerms] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");

  const items = data?.items ?? [];
  const shown = searchRows(items, query, (c) => [
    c.title,
    c.counterparty,
    c.eventName,
    c.status,
    c.terms,
  ]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/api/controle/contratos", {
        method: "POST",
        body: JSON.stringify({
          title,
          counterparty,
          eventId: event || null,
          status,
          startDate: start,
          endDate: end || null,
          terms,
        }),
      });
      setTitle("");
      setCounterparty("");
      setTerms("");
      setCreateOpen(false);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha no contrato.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Gestão documental"
        title="Contratos Financeiros e Comerciais"
        subtitle="Cadastre contratos de eventos, fornecedores, espaços e produtores, controlando vigência e cláusulas financeiras."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Novo contrato
          </Button>
        }
      />

      <PanelMessage text={message} />
      {ce && <ErrorNotice message={ce} />}
      {error && <ErrorNotice message={error} retry={reload} />}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Contratos ativos</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">
            {items.filter((i) => i.status === "ACTIVE").length}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Em minuta / rascunho</p>
          <p className="mt-2 text-2xl font-bold text-amber-800">
            {items.filter((i) => i.status === "DRAFT").length}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Total de contratos registrados</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{items.length}</p>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[800px]">
          <DialogTitle className="text-xl font-bold">Cadastrar contrato</DialogTitle>
          <DialogDescription>
            Registro contratual com trilha de auditoria e vínculo opcional ao evento.
          </DialogDescription>
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <Field label="Título">
              <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Contraparte">
              <Input required value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
            </Field>
            <SelectField label="Evento (opcional)" required={false} value={event} onChange={setEvent}>
              <option value="">Sem vínculo</option>
              {c?.events.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as typeof status)}
            >
              <option value="ACTIVE">Ativo</option>
              <option value="DRAFT">Rascunho</option>
              <option value="EXPIRED">Encerrado</option>
            </SelectField>
            <Field label="Início">
              <Input required type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Fim (opcional)">
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <div className="md:col-span-3">
              <Field label="Condições e observações">
                <textarea
                  required
                  minLength={6}
                  maxLength={3000}
                  className={inputClass + " min-h-20"}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </Field>
            </div>
            <div>
              <Submit busy={busy}>Cadastrar contrato</Submit>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="mt-5">
        <ListSearch
          value={query}
          onChange={setQuery}
          count={shown.length}
          label="Buscar contrato, contraparte ou evento"
        />
        {loading ? (
          <Loading />
        ) : shown.length ? (
          <Table heads={["Contrato", "Contraparte", "Evento", "Vigência", "Situação", "Detalhes"]}>
            {shown.map((x) => (
              <tr key={x.id}>
                <td>
                  <strong>{x.title}</strong>
                  <p className="text-xs text-slate-500">{x.terms.slice(0, 100)}</p>
                </td>
                <td>{x.counterparty}</td>
                <td>{x.eventName}</td>
                <td>
                  {displayDate(x.startDate)} — {displayDate(x.endDate)}
                </td>
                <td>
                  <Badge
                    tone={
                      x.status === "ACTIVE" ? "green" : x.status === "DRAFT" ? "amber" : "neutral"
                    }
                  >
                    {x.status === "DRAFT" ? "Rascunho" : x.status === "ACTIVE" ? "Ativo" : "Encerrado"}
                  </Badge>
                </td>
                <td>
                  <DetailsButton onClick={() => setDetailId(x.id)} />
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Card className="p-10 text-center">
            <Empty text="Nenhum contrato cadastrado." />
            <div className="mt-4 flex justify-center">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Cadastrar primeiro contrato
              </Button>
            </div>
          </Card>
        )}
      </div>
      <RecordDetailModal
        record={detailId ? { type: "contrato", id: detailId } : null}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}

type Journal = {
  id: string;
  date: string;
  bank: string;
  origin: string;
  description: string;
  amountCents: string;
  debit: string;
  credit: string;
};

export function AccountingPage() {
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [rows, setRows] = useState<Journal[]>([]),
    [count, setCount] = useState<number | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await api<{ rows: Journal[]; count: number }>(
        `/api/controle/contabilidade?inicio=${start}&fim=${end}`
      );
      setRows(response.rows);
      setCount(response.count);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível consultar.");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    window.location.href = `/api/controle/contabilidade?inicio=${start}&fim=${end}&formato=csv`;
  }

  return (
    <>
      <PageHeading
        eyebrow="Contabilidade · Escrituração"
        title="Pré-exportação Contábil do Razão Bancário (CSV)"
        subtitle="Consulta de partidas sugeridas a partir do razão bancário com exportação CSV segura. Para Plano de Contas Hierárquico, Livro Razão, Balancete e DRE, acesse o Motor Contábil."
        action={
          <Link href="/contabilidade/livros">
            <Button>Abrir Plano de Contas, Razão, Balancete e DRE</Button>
          </Link>
        }
      />
      <PanelMessage text={message} />
      <FormCard title="Período da consulta (máximo 93 dias)">
        <form onSubmit={run} className="flex flex-wrap items-end gap-3">
          <Field label="De">
            <Input type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Até">
            <Input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Submit busy={busy}>Consultar razão</Submit>
          {count !== null && (
            <Button type="button" variant="outline" onClick={exportCsv}>
              Exportar CSV
            </Button>
          )}
        </form>
      </FormCard>
      {count !== null && (
        <div className="mt-5">
          <p className="mb-3 text-sm text-slate-500">
            {count} movimentações · lançamentos sugeridos (débito = crédito em cada movimento)
          </p>
          {rows.length ? (
            <Table
              heads={[
                "Data",
                "Conta bancária",
                "Histórico",
                "Conta débito sugerida",
                "Conta crédito sugerida",
                "Valor",
              ]}
            >
              {rows.map((x) => (
                <tr key={x.id}>
                  <td>{displayDate(x.date)}</td>
                  <td>{x.bank}</td>
                  <td>{x.description}</td>
                  <td>{x.debit}</td>
                  <td>{x.credit}</td>
                  <td>{fmtBRL(x.amountCents)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty text="Nenhum lançamento encontrado neste período." />
          )}
        </div>
      )}
    </>
  );
}
