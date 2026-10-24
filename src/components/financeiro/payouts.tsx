"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { useListQuery, ListFilters, ListPagination, type PageMeta } from "./paged-list";
import { Dialog, DialogTitle, DialogDescription, DialogContent } from "@/components/ui/dialog";
import { RecordDetailModal, DetailsButton } from "@/components/financeiro/record-detail-modal";
import { Plus, CalendarPlus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  api,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  PageHeading,
  useApi,
  displayDateTime,
  type Account,
  type Producer,
} from "@/components/financeiro/shared";
import { FormCard, SelectField } from "@/components/financeiro/operations-shared";
import { PayoutLocksPanel } from "@/components/financeiro/payout-locks-panel";
import { fmtBRL, parseBRLToCents } from "@/lib/money";

type Status =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "PRODUCER_ACCEPTED"
  | "READY_TO_SETTLE"
  | "SETTLED";
type Payout = {
  id: string;
  type: "REPASSE" | "ANTECIPACAO";
  status: Status;
  amountCents: string;
  eventId: string;
  producerId: string;
  eventName: string;
  producerName: string;
  createdAt: string;
  approvedAt: string | null;
  producerAcceptedAt: string | null;
  financeSignedAt: string | null;
  settledAt: string | null;
  rejectionReason: string | null;
  settlementReference?: string | null;
};
type Balance = {
  id: string;
  name: string;
  producerId: string;
  totalCents: string;
  settledCents: string;
  committedCents: string;
  retainedCents?: string;
  repasseCents: string;
  antecipacaoCents: string;
};
type Payload = {
  items: Payout[];
  events: Balance[];
  role: "ADMIN" | "FINANCE_DISK" | "PRODUCER";
};

const statuses: Record<Status, string> = {
  REQUESTED: "Aguardando aprovação",
  APPROVED: "Aguardando produtor",
  REJECTED: "Reprovado",
  PRODUCER_ACCEPTED: "Aceite do produtor registrado",
  READY_TO_SETTLE: "Aguardando baixa externa",
  SETTLED: "Baixa registrada",
};
const actions: Record<string, string> = {
  APPROVE: "Aprovar",
  REJECT: "Reprovar",
  PRODUCER_ACCEPT: "Registrar meu aceite",
  FINANCE_SIGN: "Assinar por último (Financeiro)",
  SETTLE: "Registrar baixa comprovada",
};

function availableActions(p: Payout, role: Payload["role"]) {
  const internal = role !== "PRODUCER";
  if (internal) {
    if (p.status === "REQUESTED") return ["APPROVE", "REJECT"];
    if (p.status === "APPROVED") return ["REJECT"];
    if (p.status === "PRODUCER_ACCEPTED") return ["FINANCE_SIGN"];
    if (p.status === "READY_TO_SETTLE") return ["SETTLE"];
    return [];
  }
  return p.status === "APPROVED" ? ["PRODUCER_ACCEPT"] : [];
}

export function PayoutsPage() {
  const [requestOpen, setRequestOpen] = useState(false),
    [detailId, setDetailId] = useState<string | null>(null);
  const [quickEventOpen, setQuickEventOpen] = useState(false);
  const list = useListQuery();
  const positions = useApi<Payload>("/api/repasses");
  const listing = useApi<PageMeta & { items: Payout[]; role: Payload["role"]; summary: { amountCents: string } }>(`/api/repasses?somenteLista=1&${list.params}`);
  const data = positions.data, error = positions.error, loading = positions.loading;
  const reload = () => { positions.reload(); listing.reload(); };
  const internal = data?.role !== "PRODUCER";
  const isAdmin = data?.role === "ADMIN";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [eventId, setEventId] = useState(""),
    [type, setType] = useState<"REPASSE" | "ANTECIPACAO">("REPASSE"),
    [amount, setAmount] = useState("");
  const [selected, setSelected] = useState<{ p: Payout; action: string } | null>(null),
    [reason, setReason] = useState(""),
    [bankId, setBankId] = useState(""),
    [reference, setReference] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");

  // Cadastro rápido de Produtor + Evento quando o banco ainda não tem eventos
  const [newProducerName, setNewProducerName] = useState("");
  const [newProducerDoc, setNewProducerDoc] = useState("");
  const [selectedProducerId, setSelectedProducerId] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [newEventCode, setNewEventCode] = useState("");

  useEffect(() => {
    if (selected?.action === "SETTLE" && data && data.role !== "PRODUCER") {
      api<{ items: Account[] }>("/api/contas?resumo=1")
        .then((x) => setAccounts(x.items.filter((a) => a.active)))
        .catch((e) => setMessage(e.message));
    }
  }, [selected, data]);

  useEffect(() => {
    if (quickEventOpen && data?.role === "ADMIN") {
      api<{ items: Producer[] }>("/api/admin/produtores")
        .then((p) => setProducers(p.items))
        .catch(() => {});
    }
  }, [quickEventOpen, data]);

  const events = data?.events ?? [];
  const items = listing.data?.items ?? [];
  const totalRightsCents = events.reduce((s, e) => s + BigInt(e.totalCents || "0"), 0n);
  const totalSettledCents = events.reduce((s, e) => s + BigInt(e.settledCents || "0"), 0n);
  const totalRetainedCents = events.reduce((s, e) => s + BigInt(e.retainedCents ?? "0"), 0n);
  const totalAvailableRepasse = events.reduce((s, e) => s + BigInt(e.repasseCents || "0"), 0n);

  const current = events.find((e) => e.id === eventId);
  const shown = items;

  async function request(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/api/repasses", {
        method: "POST",
        body: JSON.stringify({ eventId, type, amountCents: parseBRLToCents(amount) }),
      });
      setAmount("");
      setRequestOpen(false);
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível solicitar.");
    } finally {
      setBusy(false);
    }
  }

  async function act(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/repasses/${selected.p.id}/acoes`, {
        method: "POST",
        body: JSON.stringify({
          action: selected.action,
          ...(selected.action === "REJECT" ? { reason } : {}),
          ...(selected.action === "SETTLE"
            ? { bankAccountId: bankId, settlementReference: reference }
            : {}),
        }),
      });
      setSelected(null);
      setReason("");
      setBankId("");
      setReference("");
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível executar a etapa.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickEventCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      let prodId = selectedProducerId;
      if (!prodId) {
        const createdProd = await api<{ id: string }>("/api/admin/produtores", {
          method: "POST",
          body: JSON.stringify({
            name: newProducerName.trim(),
            document: newProducerDoc.trim(),
          }),
        });
        prodId = createdProd.id;
      }
      await api("/api/admin/eventos", {
        method: "POST",
        body: JSON.stringify({
          name: newEventName.trim(),
          code: newEventCode.trim().toUpperCase(),
          producerId: prodId,
        }),
      });
      setNewProducerName("");
      setNewProducerDoc("");
      setNewEventName("");
      setNewEventCode("");
      setQuickEventOpen(false);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao cadastrar evento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Fluxo financeiro de eventos"
        title="Repasses, Antecipações, 20 Travas & Retenções"
        subtitle={
          internal
            ? "Acompanhe solicitações, aprovações, Central de 20 Travas de Repasse, Retenções Obrigatórias (ECAD, locação), faixas progressivas, transferências entre eventos e baixa manual."
            : "Solicite repasses ou antecipações dentro dos limites e retenções contratuais do evento e registre seu aceite após a aprovação interna."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {internal && (
              <Link
                href="/retencoes"
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Retenções por Evento
              </Link>
            )}
            <Link
              href="/transferencias"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Transferências entre Eventos
            </Link>
            {internal && (
              <Link
                href="/politicas-repasses"
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Faixas e Travas de Repasses
              </Link>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => {
                  setMessage("");
                  setQuickEventOpen(true);
                }}
              >
                <CalendarPlus size={16} />
                Cadastrar Produtor / Evento
              </Button>
            )}
            <Button
              onClick={() => {
                setMessage("");
                if (!eventId && events[0]) setEventId(events[0].id);
                setRequestOpen(true);
              }}
            >
              <Plus size={16} />
              Nova solicitação
            </Button>
          </div>
        }
      />

      {message && <ErrorNotice message={message} />}
      {error && <ErrorNotice message={error} retry={reload} />}

      {loading ? (
        <Loading />
      ) : error ? null : (
        <>
          {/* Indicadores específicos de Repasses e Antecipações */}
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Eventos vinculados</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{events.length}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {listing.data?.count ?? "—"} solicitação(ões) nos filtros de repasse/antecipação
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Direito líquido apurado</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{fmtBRL(totalRightsCents)}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Recebido e liquidado: {fmtBRL(totalSettledCents)}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Retenções ativas (ECAD / Locação)</p>
              <p className="mt-2 text-2xl font-bold text-amber-800">{fmtBRL(totalRetainedCents)}</p>
              <p className="mt-1 text-[11px] text-slate-400">Bloqueadas antes da liberação</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Disponível para repasse</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {fmtBRL(totalAvailableRepasse)}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Líquido após travas, retenções e baixas</p>
            </Card>
          </div>

          <div className="grid gap-4">
            <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
              <DialogContent>
                <DialogTitle className="text-xl font-bold">Nova solicitação de repasse / antecipação</DialogTitle>
                <DialogDescription>
                  Solicite exclusivamente valores disponíveis nos eventos autorizados.
                </DialogDescription>
                <form onSubmit={request} className="space-y-4">
                  <SelectField label="Evento" value={eventId} onChange={setEventId}>
                    <option value="">Selecione</option>
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Tipo de operação"
                    value={type}
                    onChange={(v) => setType(v as typeof type)}
                  >
                    <option value="REPASSE">Repasse</option>
                    <option value="ANTECIPACAO">Antecipação</option>
                  </SelectField>
                  <Field label="Valor solicitado (R$)">
                    <Input
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0,00"
                    />
                  </Field>
                  <div className="rounded-xl bg-slate-50 p-4 text-sm">
                    {current ? (
                      <>
                        <p>
                          Elegível para repasse: <strong>{fmtBRL(current.repasseCents)}</strong>
                        </p>
                        <p className="mt-1">
                          Retenções obrigatórias ativas:{" "}
                          <strong>{fmtBRL(current.retainedCents ?? "0")}</strong>
                        </p>
                        <p className="mt-1">
                          Limite para solicitar antecipação:{" "}
                          <strong>{fmtBRL(current.antecipacaoCents)}</strong>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Solicitações abertas, retenções obrigatórias (ECAD/aluguel) e valores já baixados são abatidos dos limites.
                        </p>
                      </>
                    ) : (
                      "Selecione um evento para consultar os limites."
                    )}
                  </div>
                  <Button disabled={busy || !eventId}>
                    {busy ? "Enviando..." : "Solicitar operação"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {/* Modal: Cadastro rápido de Produtor e Evento */}
            <Dialog open={quickEventOpen} onOpenChange={setQuickEventOpen}>
              <DialogContent>
                <DialogTitle className="text-xl font-bold">Cadastrar Produtor e Evento</DialogTitle>
                <DialogDescription>
                  Vincule um evento a um produtor para habilitar vendas, retenções obrigatórias, travas e repasses.
                </DialogDescription>
                <form onSubmit={handleQuickEventCreate} className="space-y-4">
                  <SelectField
                    label="Produtor existente (ou crie abaixo)"
                    required={false}
                    value={selectedProducerId}
                    onChange={setSelectedProducerId}
                  >
                    <option value="">+ Criar novo produtor agora</option>
                    {producers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.document})
                      </option>
                    ))}
                  </SelectField>

                  {!selectedProducerId && (
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                      <Field label="Nome da Produtora">
                        <Input
                          required={!selectedProducerId}
                          minLength={3}
                          value={newProducerName}
                          onChange={(e) => setNewProducerName(e.target.value)}
                          placeholder="Ex.: Produtora Prime Eventos"
                        />
                      </Field>
                      <Field label="CNPJ / CPF (somente números)">
                        <Input
                          required={!selectedProducerId}
                          minLength={11}
                          maxLength={18}
                          value={newProducerDoc}
                          onChange={(e) => setNewProducerDoc(e.target.value)}
                          placeholder="Ex.: 12345678000199"
                        />
                      </Field>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nome do Evento">
                      <Input
                        required
                        minLength={3}
                        value={newEventName}
                        onChange={(e) => setNewEventName(e.target.value)}
                        placeholder="Ex.: Festival SOUL 2026"
                      />
                    </Field>
                    <Field label="Código do Evento">
                      <Input
                        required
                        minLength={3}
                        maxLength={24}
                        value={newEventCode}
                        onChange={(e) => setNewEventCode(e.target.value)}
                        placeholder="Ex.: SOUL-2026"
                      />
                    </Field>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setQuickEventOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={busy}>
                      {busy ? "Salvando..." : "Salvar Evento"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            <FormCard title="Posição financeira por evento">
              <div className="space-y-3">
                {events.map((e) => (
                  <div className="rounded-xl border border-slate-100 p-3" key={e.id}>
                    <p className="font-semibold">{e.name}</p>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-slate-500 sm:grid-cols-5">
                      <div>
                        Direito registrado
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {fmtBRL(e.totalCents)}
                        </p>
                      </div>
                      <div>
                        Recebido / liquidado
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {fmtBRL(e.settledCents)}
                        </p>
                      </div>
                      <div>
                        Retenções (ECAD/Locação)
                        <p className="mt-1 text-sm font-semibold text-amber-800">
                          {fmtBRL(e.retainedCents ?? "0")}
                        </p>
                      </div>
                      <div>
                        Comprometido / baixado
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {fmtBRL(e.committedCents)}
                        </p>
                      </div>
                      <div>
                        Repasse disponível
                        <p className="mt-1 text-sm font-semibold text-emerald-700">
                          {fmtBRL(e.repasseCents)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {!events.length && (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <Empty text="Nenhum evento vinculado ainda. Cadastre um Produtor e Evento para configurar travas, retenções e repasses." />
                    <div className="flex flex-wrap justify-center gap-2">
                      {isAdmin && (
                        <Button onClick={() => setQuickEventOpen(true)}>
                          <CalendarPlus size={16} />
                          Cadastrar Produtor e Evento agora
                        </Button>
                      )}
                      {internal && (
                        <Link href="/vendas">
                          <Button variant="outline">
                            Ir para Vendas por Evento <ArrowRight size={14} className="ml-1" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </FormCard>
          </div>

          <PayoutLocksPanel onChanged={reload} />

          <ListFilters state={list} count={listing.data?.count} label="Buscar evento, produtor ou valor exato em centavos" statuses={[["ALL", "Todas"], ...Object.entries(statuses)]} />
          <p className="text-xs text-slate-500">Os saldos por evento independem dos filtros de solicitações. Total das solicitações filtradas: {listing.data ? fmtBRL(listing.data.summary.amountCents) : "—"}.</p>
          {listing.error && <ErrorNotice message={listing.error} retry={listing.reload} />}
          <Card className="mt-5 overflow-hidden">
            <div className="border-b border-slate-100 p-5 font-semibold">
              Solicitações e etapas de aprovação ({listing.data?.count ?? "—"})
            </div>
            {listing.loading ? <Loading /> : listing.error ? null : shown.length ? (
              <div className="overflow-x-auto">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Produtor / evento</th>
                      <th>Tipo</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Registro</th>
                      <th>Detalhes</th>
                      <th>Próxima ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong className="block">{p.eventName}</strong>
                          <span className="text-xs text-slate-500">{p.producerName}</span>
                        </td>
                        <td>{p.type === "REPASSE" ? "Repasse" : "Antecipação"}</td>
                        <td className="font-semibold">{fmtBRL(p.amountCents)}</td>
                        <td>
                          <Badge
                            tone={
                              p.status === "SETTLED"
                                ? "green"
                                : p.status === "REJECTED"
                                ? "red"
                                : "amber"
                            }
                          >
                            {statuses[p.status]}
                          </Badge>
                          {p.rejectionReason && (
                            <p className="mt-2 max-w-56 text-xs text-red-600">
                              {p.rejectionReason}
                            </p>
                          )}
                        </td>
                        <td>{displayDateTime(p.createdAt)}</td>
                        <td>
                          <DetailsButton onClick={() => setDetailId(p.id)} />
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            {(data ? availableActions(p, data.role) : []).map((a) => (
                              <Button
                                key={a}
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelected({ p, action: a });
                                  setMessage("");
                                }}
                              >
                                {actions[a]}
                              </Button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="Nenhuma solicitação de repasse ou antecipação registrada." />
            )}
          </Card>

          <ListPagination meta={listing.data} onPage={list.setPage} loading={listing.loading} />

          {selected && (
            <Dialog
              open={!!selected}
              onOpenChange={(open) => {
                if (!open) setSelected(null);
              }}
            >
              <DialogContent>
                <DialogTitle className="text-xl font-bold">{actions[selected.action]}</DialogTitle>
                <DialogDescription>
                  Ação autorizada e registrada na auditoria, sem instrução de pagamento bancário automático.
                </DialogDescription>
                <p className="mt-2 text-sm text-slate-500">
                  {selected.p.eventName} · {fmtBRL(selected.p.amountCents)} · {selected.p.type}
                </p>
                <form onSubmit={act} className="mt-4 max-w-lg space-y-4">
                  {selected.action === "REJECT" && (
                    <Field label="Motivo da reprovação">
                      <Input
                        required
                        minLength={8}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                  )}
                  {selected.action === "SETTLE" && (
                    <>
                      <SelectField
                        label="Conta financeira já debitada externamente"
                        value={bankId}
                        onChange={setBankId}
                      >
                        <option value="">Selecione</option>
                        {accounts.map((a) => (
                          <option value={a.id} key={a.id}>
                            {a.name} · {fmtBRL(a.balanceCents)}
                          </option>
                        ))}
                      </SelectField>
                      <Field label="Referência documental da transferência externa">
                        <Input
                          required
                          minLength={8}
                          maxLength={100}
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          placeholder="ID comprovante externo já realizado"
                        />
                      </Field>
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button disabled={busy}>
                      {busy ? "Processando..." : "Confirmar etapa"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelected(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
      <RecordDetailModal
        record={detailId ? { type: "repasse", id: detailId } : null}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}
