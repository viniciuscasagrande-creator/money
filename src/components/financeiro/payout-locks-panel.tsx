"use client";
import { useState, type FormEvent } from "react";
import { ShieldCheck, Lock, Sliders, Calculator, Plus, CheckCircle2, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, Empty, ErrorNotice, Field, Loading, useApi } from "@/components/financeiro/shared";
import { SelectField, bpsToPercent, percentToBps, nonnegativeBRLInput } from "@/components/financeiro/operations-shared";
import { fmtBRL } from "@/lib/money";
import { evaluatePayoutLocksAndCeiling, type PayoutLockDefinition, type ProgressiveTier, type ReleaseCalculationBase, type RetentionCategory } from "@/lib/control-math";
import type { EventLockPolicyConfig, EventRetentionItem, EventTransferRecord, ProducerFinancialPolicyConfig } from "@/lib/payout-locks";

type TravasEvent = {
  id: string;
  name: string;
  producerId: string;
  producerName: string;
  totalCents: string;
  settledCents: string;
  committedCents: string;
  blockedCents: string;
  retainedCents: string;
  transferOutCents?: string;
  transferInCents?: string;
  internalPositionCents?: string;
  repasseCents: string;
  antecipacaoCents: string;
  allRetentions: EventRetentionItem[];
  lockPolicy: EventLockPolicyConfig;
  lockSummary: {
    policyActive: boolean;
    soldPercentBps: number;
    tierLabel: string;
    releaseLimitBps: number;
    calculationBase: ReleaseCalculationBase;
    eligible: boolean;
    blockingReasons: string[];
    conditionalWarnings: string[];
  };
};

type ProducerPolicyItem = {
  id: string;
  name: string;
  policy: ProducerFinancialPolicyConfig;
};

type TravasPayload = {
  role: "ADMIN" | "FINANCE_DISK" | "PRODUCER";
  catalog: PayoutLockDefinition[];
  progressiveTiers: ProgressiveTier[];
  retentionCategories: Record<RetentionCategory, string>;
  events: TravasEvent[];
  producers: ProducerPolicyItem[];
  transfers: EventTransferRecord[];
};

const BASE_LABELS: Record<ReleaseCalculationBase, string> = {
  PRODUCER_NET_AFTER_RETENTIONS: "20% / Faixa sobre o valor líquido pertencente ao produtor, após encargos e retenções (Recomendado)",
  GROSS_SOLD: "20% / Faixa sobre o valor bruto dos ingressos vendidos",
  POTENTIAL_TOTAL: "20% / Faixa sobre o potencial total previsto do evento (limitado ao saldo disponível)"
};

const TRANSFER_STATUS_LABELS: Record<EventTransferRecord["status"], string> = {
  REQUESTED: "Aguardando Financeiro SOUL",
  APPROVED: "Aprovada · Aguardando confirmação",
  PRODUCER_ACCEPTED: "Aceite do produtor · Pronta p/ execução",
  EXECUTED: "Transferência atômica executada",
  REJECTED: "Reprovada",
  REVERSED: "Estorno compensatório"
};

export function PayoutLocksPanel({ onChanged }: { onChanged?: () => void }) {
  const { data, loading, error, reload } = useApi<TravasPayload>("/api/repasses/travas");
  const [subTab, setSubTab] = useState<"travas" | "retencoes" | "transferencias" | "faixas">("travas");
  const [retentionModal, setRetentionModal] = useState(false);
  const [policyModalEventId, setPolicyModalEventId] = useState<string | null>(null);
  const [producerModalId, setProducerModalId] = useState<string | null>(null);
  const [transferModal, setTransferModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Retention form state
  const [retEventId, setRetEventId] = useState("");
  const [retCategory, setRetCategory] = useState<RetentionCategory>("ECAD");
  const [retDesc, setRetDesc] = useState("");
  const [retBeneficiary, setRetBeneficiary] = useState("");
  const [retDoc, setRetDoc] = useState("");
  const [retOwner, setRetOwner] = useState("Financeiro SOUL");
  const [retDueDate, setRetDueDate] = useState("");
  const [retCalcMode, setRetCalcMode] = useState<"FIXED" | "PERCENT">("FIXED");
  const [retAmount, setRetAmount] = useState("");
  const [retPercent, setRetPercent] = useState("10,00");

  // Policy form state
  const [polActive, setPolActive] = useState(true);
  const [polCapacity, setPolCapacity] = useState("1000");
  const [polSoldOverride, setPolSoldOverride] = useState("550");
  const [polTriggerPct, setPolTriggerPct] = useState("50,00");
  const [polCustomLimitPct, setPolCustomLimitPct] = useState("");
  const [polBase, setPolBase] = useState<ReleaseCalculationBase>("PRODUCER_NET_AFTER_RETENTIONS");
  const [polContract, setPolContract] = useState(true);
  const [polDocs, setPolDocs] = useState(true);
  const [polReconciled, setPolReconciled] = useState(true);
  const [polOverdue, setPolOverdue] = useState(false);
  const [polManualBlock, setPolManualBlock] = useState(false);
  const [polManualReason, setPolManualReason] = useState("");
  const [polPostClosed, setPolPostClosed] = useState(false);

  // Producer Financial Policy form state
  const [prodAllowPayout, setProdAllowPayout] = useState(true);
  const [prodAllowAdvance, setProdAllowAdvance] = useState(true);
  const [prodAllowTransfer, setProdAllowTransfer] = useState(false);
  const [prodMaxTransferBRL, setProdMaxTransferBRL] = useState("0,00");
  const [prodMaxTransferPct, setProdMaxTransferPct] = useState("100,00");
  const [prodMaxTransferCount, setProdMaxTransferCount] = useState("10");
  const [prodApprovalPolicy, setProdApprovalPolicy] = useState<"FINANCE_SOUL" | "DUAL_INTERNAL">("FINANCE_SOUL");

  // Transfer request form state
  const [trSourceEventId, setTrSourceEventId] = useState("");
  const [trTargetEventId, setTrTargetEventId] = useState("");
  const [trAmountBRL, setTrAmountBRL] = useState("");
  const [trReason, setTrReason] = useState("");

  // Interactive simulator state
  const [simSoldPct, setSimSoldPct] = useState("55");
  const [simSettledBRL, setSimSettledBRL] = useState("67000,00");
  const [simRetentionsBRL, setSimRetentionsBRL] = useState("12000,00");
  const [simPrevPayoutsBRL, setSimPrevPayoutsBRL] = useState("3000,00");
  const [simBase, setSimBase] = useState<ReleaseCalculationBase>("PRODUCER_NET_AFTER_RETENTIONS");
  const [simContract, setSimContract] = useState(true);
  const [simReconciled, setSimReconciled] = useState(true);
  const [simCriticalRisk, setSimCriticalRisk] = useState(false);

  const internal = data?.role !== "PRODUCER";
  const selectedRetEv = data?.events.find(ev => ev.id === retEventId);

  function openPolicyModal(ev: TravasEvent) {
    setMsg("");
    setPolicyModalEventId(ev.id);
    const p = ev.lockPolicy;
    setPolActive(p.active);
    setPolCapacity(String(p.capacityTickets ?? 1000));
    setPolSoldOverride(p.soldTicketsOverride !== null && p.soldTicketsOverride !== undefined ? String(p.soldTicketsOverride) : "");
    setPolTriggerPct(bpsToPercent(p.salesTriggerBps ?? 5000).replace("%", ""));
    setPolCustomLimitPct(p.customReleaseLimitBps !== null && p.customReleaseLimitBps !== undefined ? bpsToPercent(p.customReleaseLimitBps).replace("%", "") : "");
    setPolBase(p.calculationBase ?? "PRODUCER_NET_AFTER_RETENTIONS");
    setPolContract(p.contractSigned ?? true);
    setPolDocs(p.producerDocsValid ?? true);
    setPolReconciled(p.reconciliationApproved ?? true);
    setPolOverdue(p.overdueExpensesActive ?? false);
    setPolManualBlock(p.manualBlockActive ?? false);
    setPolManualReason(p.manualBlockReason ?? "");
    setPolPostClosed(p.postEventClosed ?? false);
  }

  function openProducerPolicyModal(item: ProducerPolicyItem) {
    setMsg("");
    setProducerModalId(item.id);
    setProdAllowPayout(item.policy.allowPayoutRequests);
    setProdAllowAdvance(item.policy.allowAdvanceRequests);
    setProdAllowTransfer(item.policy.allowEventTransfers);
    setProdMaxTransferBRL(fmtBRL(item.policy.maxSingleTransferCents || "0").replace("R$ ", ""));
    setProdMaxTransferPct(bpsToPercent(item.policy.maxTransferPercentBps ?? 10000).replace("%", ""));
    setProdMaxTransferCount(String(item.policy.maxTransfersPerEvent ?? 10));
    setProdApprovalPolicy(item.policy.approvalPolicy ?? "FINANCE_SOUL");
  }

  async function submitRetention(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      let computedAmountCents = "0";
      if (retCalcMode === "PERCENT") {
        const bps = BigInt(percentToBps(retPercent));
        const baseCents = BigInt(selectedRetEv?.settledCents ?? "0");
        computedAmountCents = ((baseCents * bps + 5000n) / 10000n).toString();
      } else {
        computedAmountCents = nonnegativeBRLInput(retAmount);
      }
      await api("/api/repasses/travas", {
        method: "POST",
        body: JSON.stringify({
          kind: "RETENTION_CREATE",
          eventId: retEventId,
          category: retCategory,
          description: retCalcMode === "PERCENT" ? `${retDesc} (${retPercent}% sobre liquidado)` : retDesc,
          beneficiary: retBeneficiary,
          documentRef: retDoc,
          ownerName: retOwner,
          dueDate: retDueDate || null,
          amountCents: computedAmountCents
        })
      });
      setRetDesc("");
      setRetBeneficiary("");
      setRetDoc("");
      setRetAmount("");
      setRetentionModal(false);
      reload();
      onChanged?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro ao registrar retenção.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRetentionStatus(eventId: string, retentionId: string, status: "RELEASED" | "CANCELED") {
    setBusy(true);
    setMsg("");
    try {
      await api("/api/repasses/travas", {
        method: "POST",
        body: JSON.stringify({
          kind: "RETENTION_STATUS",
          eventId,
          retentionId,
          status,
          reason: status === "RELEASED" ? "Comprovação contratual validada pelo Financeiro SOUL" : "Cancelamento administrativo"
        })
      });
      reload();
      onChanged?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro ao atualizar retenção.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPolicy(e: FormEvent) {
    e.preventDefault();
    if (!policyModalEventId) return;
    setBusy(true);
    setMsg("");
    try {
      await api("/api/repasses/travas", {
        method: "POST",
        body: JSON.stringify({
          kind: "LOCK_POLICY_SAVE",
          eventId: policyModalEventId,
          active: polActive,
          capacityTickets: Number(polCapacity) || 1000,
          soldTicketsOverride: polSoldOverride.trim() !== "" ? Number(polSoldOverride) : null,
          salesTriggerBps: percentToBps(polTriggerPct),
          customReleaseLimitBps: polCustomLimitPct.trim() !== "" ? percentToBps(polCustomLimitPct) : null,
          calculationBase: polBase,
          contractSigned: polContract,
          producerDocsValid: polDocs,
          reconciliationApproved: polReconciled,
          overdueExpensesActive: polOverdue,
          manualBlockActive: polManualBlock,
          manualBlockReason: polManualReason,
          postEventClosed: polPostClosed
        })
      });
      setPolicyModalEventId(null);
      reload();
      onChanged?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro ao salvar política de travas.");
    } finally {
      setBusy(false);
    }
  }

  async function submitProducerPolicy(e: FormEvent) {
    e.preventDefault();
    if (!producerModalId) return;
    setBusy(true);
    setMsg("");
    try {
      await api("/api/repasses/travas", {
        method: "POST",
        body: JSON.stringify({
          kind: "PRODUCER_POLICY_SAVE",
          producerId: producerModalId,
          allowPayoutRequests: prodAllowPayout,
          allowAdvanceRequests: prodAllowAdvance,
          allowEventTransfers: prodAllowTransfer,
          maxSingleTransferCents: nonnegativeBRLInput(prodMaxTransferBRL || "0,00"),
          maxTransferPercentBps: percentToBps(prodMaxTransferPct || "100,00"),
          maxTransfersPerEvent: Number(prodMaxTransferCount) || 10,
          approvalPolicy: prodApprovalPolicy
        })
      });
      setProducerModalId(null);
      reload();
      onChanged?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro ao salvar política do produtor.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTransferRequest(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await api("/api/repasses/travas", {
        method: "POST",
        body: JSON.stringify({
          kind: "TRANSFER_REQUEST",
          sourceEventId: trSourceEventId,
          targetEventId: trTargetEventId,
          amountCents: nonnegativeBRLInput(trAmountBRL),
          reason: trReason
        })
      });
      setTrSourceEventId("");
      setTrTargetEventId("");
      setTrAmountBRL("");
      setTrReason("");
      setTransferModal(false);
      reload();
      onChanged?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível solicitar a transferência.");
    } finally {
      setBusy(false);
    }
  }

  async function actOnTransfer(transferId: string, action: "APPROVE" | "REJECT" | "PRODUCER_ACCEPT" | "EXECUTE" | "REVERSE") {
    setBusy(true);
    setMsg("");
    try {
      await api("/api/repasses/travas", {
        method: "POST",
        body: JSON.stringify({
          kind: "TRANSFER_ACTION",
          transferId,
          action,
          reason: action === "REJECT" ? "Reprovada na análise do Financeiro SOUL" : action === "REVERSE" ? "Estorno compensatório autorizado pelo Financeiro SOUL" : undefined
        })
      });
      reload();
      onChanged?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro ao atualizar transferência.");
    } finally {
      setBusy(false);
    }
  }

  let simResult: ReturnType<typeof evaluatePayoutLocksAndCeiling> | null = null;
  try {
    const soldBps = Math.min(10000, Math.max(0, Math.round(Number(simSoldPct.replace(",", ".")) * 100)));
    const settled = BigInt(nonnegativeBRLInput(simSettledBRL || "0,00"));
    const ret = BigInt(nonnegativeBRLInput(simRetentionsBRL || "0,00"));
    const prev = BigInt(nonnegativeBRLInput(simPrevPayoutsBRL || "0,00"));
    simResult = evaluatePayoutLocksAndCeiling({
      settledProducerCents: settled,
      grossSoldCents: settled,
      potentialEventCents: settled * 2n,
      mandatoryRetentionsCents: ret,
      openRiskCents: simCriticalRisk ? 100n : 0n,
      previousPayoutsCents: prev,
      soldPercentBps: soldBps,
      salesTriggerBps: 3000,
      calculationBase: simBase,
      contractSigned: simContract,
      producerDocsValid: true,
      reconciliationApproved: simReconciled,
      criticalRiskActive: simCriticalRisk
    });
  } catch {
    simResult = null;
  }

  if (loading) return <Loading />;
  if (error) return <ErrorNotice message={error} retry={reload} />;

  const selectedSourceEv = data?.events.find(e => e.id === trSourceEventId);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <Button variant={subTab === "travas" ? "default" : "outline"} size="sm" onClick={() => setSubTab("travas")}>
          <Lock size={15} /> Central de Travas e Políticas (20 Travas)
        </Button>
        <Button variant={subTab === "retencoes" ? "default" : "outline"} size="sm" onClick={() => setSubTab("retencoes")}>
          <ShieldCheck size={15} /> Retenções Obrigatórias (ECAD, Aluguel, Despesas)
        </Button>
        <Button variant={subTab === "transferencias" ? "default" : "outline"} size="sm" onClick={() => setSubTab("transferencias")}>
          <ArrowLeftRight size={15} /> Transferências entre Eventos
        </Button>
        <Button variant={subTab === "faixas" ? "default" : "outline"} size="sm" onClick={() => setSubTab("faixas")}>
          <Calculator size={15} /> Faixas de Liberação e Simulador de Repasse
        </Button>
      </div>

      {msg && <ErrorNotice message={msg} />}

      {subTab === "travas" && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Política de Liberação e Travas Ativas por Evento</h3>
                <p className="text-xs text-slate-500">
                  Fórmula de segurança: min(Limite Comercial Restante da Faixa, Saldo Financeiro Disponível após Retenções e Riscos). Validada na solicitação, aprovação e baixa.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {data?.events.map(ev => (
                <div key={ev.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{ev.name}</p>
                      <p className="text-xs text-slate-500">{ev.producerName}</p>
                    </div>
                    <Badge tone={ev.lockSummary.policyActive ? (ev.lockSummary.eligible ? "green" : "red") : "amber"}>
                      {ev.lockSummary.policyActive ? (ev.lockSummary.eligible ? "Travas cumpridas" : "Bloqueado por trava") : "Padrão (Saldo liquidado)"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>Faixa atual: <strong>{ev.lockSummary.tierLabel} ({bpsToPercent(ev.lockSummary.releaseLimitBps)})</strong></div>
                    <div>Ingressos vendidos: <strong>{bpsToPercent(ev.lockSummary.soldPercentBps)}</strong></div>
                    <div>Retenções ativas: <strong>{fmtBRL(ev.retainedCents)}</strong></div>
                    <div>Teto liberável hoje: <strong className="text-emerald-700">{fmtBRL(ev.repasseCents)}</strong></div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Base: {BASE_LABELS[ev.lockSummary.calculationBase]}
                  </p>
                  {ev.lockSummary.blockingReasons.map((r, i) => (
                    <p key={i} className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertTriangle size={13} /> {r}
                    </p>
                  ))}
                  {ev.lockSummary.conditionalWarnings.map((w, i) => (
                    <p key={i} className="mt-1 text-xs text-amber-700">{w}</p>
                  ))}
                  {internal && (
                    <div className="mt-3">
                      <Button size="sm" variant="outline" onClick={() => openPolicyModal(ev)}>
                        <Sliders size={14} /> Configurar travas do evento
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {!data?.events.length && <Empty text="Nenhum evento disponível." />}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 p-5 font-semibold">
              Catálogo Oficial SOUL — 20 Travas de Repasse (Impeditivas, Condicionais e de Limite)
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Trava</th>
                    <th>Categoria</th>
                    <th>Condição para liberar</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.catalog.map(lock => (
                    <tr key={lock.code}>
                      <td className="font-mono font-semibold">{lock.number}</td>
                      <td className="font-medium">{lock.title}</td>
                      <td>
                        <Badge tone={lock.category === "IMPEDITIVA" ? "red" : lock.category === "CONDICIONAL" ? "amber" : "green"}>
                          {lock.category === "IMPEDITIVA" ? "Trava impeditiva" : lock.category === "CONDICIONAL" ? "Trava condicional" : "Trava de limite"}
                        </Badge>
                      </td>
                      <td className="text-slate-600">{lock.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {subTab === "retencoes" && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h3 className="font-semibold">Retenções Obrigatórias e Garantias do Evento</h3>
              <p className="text-xs text-slate-500">
                Valores reservados para ECAD, aluguel de teatro/casa de shows, equipe, tributos e risco. Indisponíveis para saque pelo produtor.
              </p>
            </div>
            {internal && (
              <Button size="sm" onClick={() => { setMsg(""); setRetentionModal(true); }}>
                <Plus size={15} /> Nova retenção obrigatória
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Evento / Produtor</th>
                  <th>Tipo de retenção</th>
                  <th>Finalidade / Documento</th>
                  <th>Beneficiário</th>
                  <th>Vencimento</th>
                  <th>Valor retido</th>
                  <th>Status</th>
                  {internal && <th>Ação</th>}
                </tr>
              </thead>
              <tbody>
                {data?.events.flatMap(ev =>
                  ev.allRetentions.map(ret => (
                    <tr key={ret.id}>
                      <td>
                        <strong className="block">{ev.name}</strong>
                        <span className="text-xs text-slate-500">{ev.producerName}</span>
                      </td>
                      <td>{data.retentionCategories[ret.category] ?? ret.category}</td>
                      <td>
                        <span className="block font-medium">{ret.description}</span>
                        <span className="text-xs text-slate-400">Doc: {ret.documentRef} · Resp: {ret.ownerName}</span>
                      </td>
                      <td>{ret.beneficiary}</td>
                      <td>{ret.dueDate || "Conforme contrato"}</td>
                      <td className="font-semibold">{fmtBRL(ret.amountCents)}</td>
                      <td>
                        <Badge tone={ret.status === "ACTIVE" ? "amber" : ret.status === "RELEASED" ? "green" : "red"}>
                          {ret.status === "ACTIVE" ? "Retido / Bloqueado" : ret.status === "RELEASED" ? "Liberado após comprovação" : "Cancelado"}
                        </Badge>
                      </td>
                      {internal && (
                        <td>
                          {ret.status === "ACTIVE" && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => changeRetentionStatus(ev.id, ret.id, "RELEASED")}>
                              <CheckCircle2 size={14} /> Liberar reserva
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {!data?.events.some(e => e.allRetentions.length > 0) && (
              <Empty text="Nenhuma retenção obrigatória cadastrada para os eventos listados." />
            )}
          </div>
        </Card>
      )}

      {subTab === "transferencias" && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Central de Políticas Financeiras por Produtor</h3>
                <p className="text-xs text-slate-500">
                  O Financeiro SOUL define quais produtores podem solicitar repasses, antecipações e transferências atômicas entre seus próprios eventos, respeitando retenções de ECAD/aluguel e sem inflar o teto de repasse externo do destino.
                </p>
              </div>
              <Button size="sm" onClick={() => { setMsg(""); setTransferModal(true); }}>
                <ArrowLeftRight size={15} /> Solicitar transferência entre eventos
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {data?.producers.map(p => (
                <div key={p.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    <Badge tone={p.policy.allowEventTransfers ? "green" : "amber"}>
                      {p.policy.allowEventTransfers ? "Transferências habilitadas" : "Transferências bloqueadas"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Repasses: <strong>{p.policy.allowPayoutRequests ? "Permitidos" : "Bloqueados"}</strong> ·{" "}
                    Antecipações: <strong>{p.policy.allowAdvanceRequests ? "Permitidas" : "Bloqueadas"}</strong> ·{" "}
                    Transferências: <strong>{p.policy.allowEventTransfers ? "Habilitadas" : "Bloqueadas"}</strong>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Limite máx./transferência: {p.policy.maxSingleTransferCents !== "0" ? fmtBRL(p.policy.maxSingleTransferCents) : "Até o saldo elegível"} ·{" "}
                    Teto percentual: {bpsToPercent(p.policy.maxTransferPercentBps)} ·{" "}
                    Alçada: {p.policy.approvalPolicy === "DUAL_INTERNAL" ? "Dupla aprovação interna" : "Aprovação do Financeiro SOUL"}
                  </p>
                  {internal && (
                    <div className="mt-3">
                      <Button size="sm" variant="outline" onClick={() => openProducerPolicyModal(p)}>
                        <Sliders size={14} /> Configurar permissões do produtor
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {!data?.producers.length && <Empty text="Nenhum produtor encontrado." />}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 p-5 font-semibold">
              Histórico e Fluxo de Aprovação — Transferências Internas entre Eventos do Mesmo Produtor
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Produtor</th>
                    <th>Evento de origem (Débito)</th>
                    <th>Evento de destino (Crédito)</th>
                    <th>Valor</th>
                    <th>Justificativa</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.transfers.map(tr => (
                    <tr key={tr.id}>
                      <td className="font-medium">{tr.producerName}</td>
                      <td>{tr.sourceEventName}</td>
                      <td>{tr.targetEventName}</td>
                      <td className="font-semibold">{fmtBRL(tr.amountCents)}</td>
                      <td className="text-xs text-slate-600">{tr.reason}</td>
                      <td>
                        <Badge tone={tr.status === "EXECUTED" ? "green" : tr.status === "REJECTED" || tr.status === "REVERSED" ? "red" : "amber"}>
                          {TRANSFER_STATUS_LABELS[tr.status]}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {internal && tr.status === "REQUESTED" && (
                            <>
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => actOnTransfer(tr.id, "APPROVE")}>Aprovar</Button>
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => actOnTransfer(tr.id, "REJECT")}>Reprovar</Button>
                            </>
                          )}
                          {!internal && tr.status === "APPROVED" && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => actOnTransfer(tr.id, "PRODUCER_ACCEPT")}>Confirmar aceite</Button>
                          )}
                          {internal && (tr.status === "APPROVED" || tr.status === "PRODUCER_ACCEPTED") && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => actOnTransfer(tr.id, "EXECUTE")}>Executar transferência</Button>
                          )}
                          {internal && tr.status === "EXECUTED" && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => actOnTransfer(tr.id, "REVERSE")}>Estorno compensatório</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.transfers.length && <Empty text="Nenhuma transferência entre eventos registrada." />}
            </div>
          </Card>
        </div>
      )}

      {subTab === "faixas" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h3 className="font-semibold">Tabela Progressiva por Percentual de Ingressos Vendidos</h3>
              <p className="text-xs text-slate-500">
                O limite cumulativo desconta repasses já pagos ou reservados e incide sobre a base contratual configurada.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Ingressos vendidos</th>
                    <th>Limite cumulativo de repasse</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.progressiveTiers.map((tier, idx) => (
                    <tr key={idx}>
                      <td className="font-medium">{tier.label}</td>
                      <td className="font-semibold text-emerald-700">{bpsToPercent(tier.releaseLimitBps)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-lg font-semibold">Simulador de Travas e Limite de Repasse</h3>
            <p className="mt-1 text-xs text-slate-500">
              Simulação conceitual determinística: min(L_comercial restante, S_financeiro disponível). Não altera dados reais.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Ingressos vendidos (%)">
                <Input value={simSoldPct} onChange={e => setSimSoldPct(e.target.value)} placeholder="55" />
              </Field>
              <Field label="Saldo liquidado do produtor (R$)">
                <Input value={simSettledBRL} onChange={e => setSimSettledBRL(e.target.value)} placeholder="67000,00" />
              </Field>
              <Field label="Retenções obrigatórias ECAD/Aluguel (R$)">
                <Input value={simRetentionsBRL} onChange={e => setSimRetentionsBRL(e.target.value)} placeholder="12000,00" />
              </Field>
              <Field label="Repasses anteriores consumidos (R$)">
                <Input value={simPrevPayoutsBRL} onChange={e => setSimPrevPayoutsBRL(e.target.value)} placeholder="3000,00" />
              </Field>
              <div className="sm:col-span-2">
                <SelectField label="Base de incidência do percentual liberável" value={simBase} onChange={v => setSimBase(v as ReleaseCalculationBase)}>
                  <option value="PRODUCER_NET_AFTER_RETENTIONS">{BASE_LABELS.PRODUCER_NET_AFTER_RETENTIONS}</option>
                  <option value="GROSS_SOLD">{BASE_LABELS.GROSS_SOLD}</option>
                  <option value="POTENTIAL_TOTAL">{BASE_LABELS.POTENTIAL_TOTAL}</option>
                </SelectField>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={simContract} onChange={e => setSimContract(e.target.checked)} />
                Contrato assinado (Trava 07)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={simReconciled} onChange={e => setSimReconciled(e.target.checked)} />
                Conciliação aprovada (Trava 13)
              </label>
              <label className="flex items-center gap-2 text-xs sm:col-span-2">
                <input type="checkbox" checked={simCriticalRisk} onChange={e => setSimCriticalRisk(e.target.checked)} />
                Ocorrência crítica de risco ativa (Trava 09)
              </label>
            </div>
            {simResult && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs text-slate-500">Limite da faixa ({simResult.tierLabel})</span>
                    <p className="text-lg font-bold text-slate-900">{bpsToPercent(simResult.releaseLimitBps)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Saldo após reservas (ECAD/Riscos)</span>
                    <p className="text-lg font-bold text-slate-900">{fmtBRL(simResult.balanceAfterReservesCents.toString())}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Teto comercial acumulado da faixa</span>
                    <p className="font-semibold">{fmtBRL(simResult.cumulativeCommercialCeilingCents.toString())}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Valor máximo para nova solicitação</span>
                    <p className="text-xl font-extrabold text-emerald-700">{fmtBRL(simResult.maxNewRequestCents.toString())}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs font-medium text-slate-700">
                  {simResult.eligible
                    ? "Elegível para solicitar, sujeito à aprovação financeira e alçada."
                    : `Bloqueado: ${simResult.blockingReasons.join(" · ")}`}
                </p>
                {simResult.conditionalWarnings.map((w, i) => (
                  <p key={i} className="mt-1 text-xs text-amber-700">{w}</p>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Modal: Nova Retenção Obrigatória */}
      <Dialog open={retentionModal} onOpenChange={setRetentionModal}>
        <DialogContent className="max-w-[650px]">
          <DialogTitle className="text-xl font-bold">Registrar Retenção Obrigatória do Evento</DialogTitle>
          <DialogDescription>
            Reserva financeira para ECAD, locação de espaço, equipe, tributos ou risco. Abate imediatamente o saldo disponível para repasse ao produtor.
          </DialogDescription>
          <form onSubmit={submitRetention} className="mt-4 grid gap-4 sm:grid-cols-2">
            <SelectField label="Evento" value={retEventId} onChange={setRetEventId}>
              <option value="">Selecione</option>
              {data?.events.map(ev => <option key={ev.id} value={ev.id}>{ev.producerName} · {ev.name}</option>)}
            </SelectField>
            <SelectField label="Tipo de retenção" value={retCategory} onChange={v => setRetCategory(v as RetentionCategory)}>
              {Object.entries(data?.retentionCategories ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectField>
            <Field label="Finalidade / Descrição contratual">
              <Input required minLength={3} value={retDesc} onChange={e => setRetDesc(e.target.value)} placeholder="Ex.: Taxa ECAD show principal" />
            </Field>
            <Field label="Beneficiário da obrigação">
              <Input required minLength={2} value={retBeneficiary} onChange={e => setRetBeneficiary(e.target.value)} placeholder="Ex.: ECAD / Teatro Municipal" />
            </Field>
            <Field label="Contrato / Documento comprobatório">
              <Input required minLength={2} value={retDoc} onChange={e => setRetDoc(e.target.value)} placeholder="Ex.: CTR-2026-089" />
            </Field>
            <Field label="Responsável interno">
              <Input required minLength={2} value={retOwner} onChange={e => setRetOwner(e.target.value)} />
            </Field>
            <Field label="Vencimento previsto">
              <Input type="date" value={retDueDate} onChange={e => setRetDueDate(e.target.value)} />
            </Field>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Modalidade da retenção / taxa do evento</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRetCalcMode("FIXED")}
                  className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all ${
                    retCalcMode === "FIXED"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Valor Fixo (R$)
                </button>
                <button
                  type="button"
                  onClick={() => setRetCalcMode("PERCENT")}
                  className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all ${
                    retCalcMode === "PERCENT"
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Percentual (%)
                </button>
              </div>
            </div>
            {retCalcMode === "FIXED" ? (
              <Field label="Valor retido fixo (R$)">
                <Input required value={retAmount} onChange={e => setRetAmount(e.target.value)} placeholder="12000,00" />
              </Field>
            ) : (
              <Field label={`Percentual sobre saldo liquidado (%)${selectedRetEv ? ` · Base: ${fmtBRL(selectedRetEv.settledCents)}` : ""}`}>
                <Input required value={retPercent} onChange={e => setRetPercent(e.target.value)} placeholder="10,00" />
              </Field>
            )}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setRetentionModal(false)}>Cancelar</Button>
              <Button disabled={busy || !retEventId}>{busy ? "Salvando..." : "Registrar retenção"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Configurar Travas do Evento */}
      <Dialog open={!!policyModalEventId} onOpenChange={o => { if (!o) setPolicyModalEventId(null); }}>
        <DialogContent className="max-w-[700px]">
          <DialogTitle className="text-xl font-bold">Configurar Travas e Política de Liberação do Evento</DialogTitle>
          <DialogDescription>
            Parametrização auditada por evento. Aplica travas impeditivas, condicionais e faixas de limite no cálculo de repasses.
          </DialogDescription>
          <form onSubmit={submitPolicy} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm font-medium sm:col-span-2">
              <input type="checkbox" checked={polActive} onChange={e => setPolActive(e.target.checked)} />
              Ativar motor de travas e faixas progressivas para este evento
            </label>
            <Field label="Capacidade comercial de ingressos">
              <Input type="number" min="1" value={polCapacity} onChange={e => setPolCapacity(e.target.value)} />
            </Field>
            <Field label="Ingressos elegíveis vendidos (opcional)">
              <Input type="number" min="0" value={polSoldOverride} onChange={e => setPolSoldOverride(e.target.value)} placeholder="Usa soma das vendas registradas se vazio" />
            </Field>
            <Field label="Gatilho mínimo de vendas (%) — Trava 01">
              <Input required value={polTriggerPct} onChange={e => setPolTriggerPct(e.target.value)} placeholder="50,00" />
            </Field>
            <Field label="Limite fixo liberável (%) — Vazio usa Faixa Progressiva">
              <Input value={polCustomLimitPct} onChange={e => setPolCustomLimitPct(e.target.value)} placeholder="Ex.: 20,00" />
            </Field>
            <div className="sm:col-span-2">
              <SelectField label="Base de cálculo do percentual liberável" value={polBase} onChange={v => setPolBase(v as ReleaseCalculationBase)}>
                <option value="PRODUCER_NET_AFTER_RETENTIONS">{BASE_LABELS.PRODUCER_NET_AFTER_RETENTIONS}</option>
                <option value="GROSS_SOLD">{BASE_LABELS.GROSS_SOLD}</option>
                <option value="POTENTIAL_TOTAL">{BASE_LABELS.POTENTIAL_TOTAL}</option>
              </SelectField>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={polContract} onChange={e => setPolContract(e.target.checked)} />
              Trava 07: Contrato assinado e vigente
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={polDocs} onChange={e => setPolDocs(e.target.checked)} />
              Trava 08: Documentação cadastral/bancária válida
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={polReconciled} onChange={e => setPolReconciled(e.target.checked)} />
              Trava 13: Conciliação bancária conferida
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={polOverdue} onChange={e => setPolOverdue(e.target.checked)} />
              Trava 10: Há despesas críticas vencidas (Bloqueia)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={polPostClosed} onChange={e => setPolPostClosed(e.target.checked)} />
              Evento encerrado / pós-fechamento (Libera até 100% líquido)
            </label>
            <label className="flex items-center gap-2 text-xs text-red-700">
              <input type="checkbox" checked={polManualBlock} onChange={e => setPolManualBlock(e.target.checked)} />
              Trava 20: Ativar bloqueio manual excepcional
            </label>
            {polManualBlock && (
              <div className="sm:col-span-2">
                <Field label="Motivo obrigatório do bloqueio manual (Auditado)">
                  <Input required minLength={5} value={polManualReason} onChange={e => setPolManualReason(e.target.value)} placeholder="Justificativa formal para retenção cautelar" />
                </Field>
              </div>
            )}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setPolicyModalEventId(null)}>Cancelar</Button>
              <Button disabled={busy}>{busy ? "Salvando..." : "Salvar política do evento"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Configurar Política Financeira por Produtor */}
      <Dialog open={!!producerModalId} onOpenChange={o => { if (!o) setProducerModalId(null); }}>
        <DialogContent className="max-w-[650px]">
          <DialogTitle className="text-xl font-bold">Política Financeira do Produtor</DialogTitle>
          <DialogDescription>
            Habilite ou bloqueie repasses, antecipações e transferências entre eventos próprios, definindo limites e alçadas.
          </DialogDescription>
          <form onSubmit={submitProducerPolicy} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-xs font-medium">
              <input type="checkbox" checked={prodAllowPayout} onChange={e => setProdAllowPayout(e.target.checked)} />
              Permitir solicitação de repasses
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-xs font-medium">
              <input type="checkbox" checked={prodAllowAdvance} onChange={e => setProdAllowAdvance(e.target.checked)} />
              Permitir antecipações
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-xs font-medium sm:col-span-2">
              <input type="checkbox" checked={prodAllowTransfer} onChange={e => setProdAllowTransfer(e.target.checked)} />
              Permitir transferência entre eventos próprios (Mesmo produtor)
            </label>
            <Field label="Valor máximo por transferência (R$ — 0 = Sem teto fixo)">
              <Input required value={prodMaxTransferBRL} onChange={e => setProdMaxTransferBRL(e.target.value)} placeholder="20000,00" />
            </Field>
            <Field label="Percentual máximo transferível (%)">
              <Input required value={prodMaxTransferPct} onChange={e => setProdMaxTransferPct(e.target.value)} placeholder="100,00" />
            </Field>
            <Field label="Quantidade máx. de transferências por evento">
              <Input required type="number" min="1" max="100" value={prodMaxTransferCount} onChange={e => setProdMaxTransferCount(e.target.value)} />
            </Field>
            <SelectField label="Política de aprovação" value={prodApprovalPolicy} onChange={v => setProdApprovalPolicy(v as "FINANCE_SOUL" | "DUAL_INTERNAL")}>
              <option value="FINANCE_SOUL">Aprovação do Financeiro SOUL</option>
              <option value="DUAL_INTERNAL">Dupla aprovação interna</option>
            </SelectField>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setProducerModalId(null)}>Cancelar</Button>
              <Button disabled={busy}>{busy ? "Salvando..." : "Salvar política do produtor"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Solicitar Transferência entre Eventos */}
      <Dialog open={transferModal} onOpenChange={setTransferModal}>
        <DialogContent className="max-w-[650px]">
          <DialogTitle className="text-xl font-bold">Solicitar Transferência entre Eventos do Mesmo Produtor</DialogTitle>
          <DialogDescription>
            Transferência contábil interna sem movimentação bancária e sem criar receita nova. Respeita retenções de ECAD/aluguel na origem.
          </DialogDescription>
          <form onSubmit={submitTransferRequest} className="mt-4 grid gap-4 sm:grid-cols-2">
            <SelectField label="Evento de Origem (Débito)" value={trSourceEventId} onChange={setTrSourceEventId}>
              <option value="">Selecione</option>
              {data?.events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.producerName} · {ev.name} (Disp: {fmtBRL(ev.repasseCents)})</option>
              ))}
            </SelectField>
            <SelectField label="Evento de Destino (Crédito — Mesmo produtor)" value={trTargetEventId} onChange={setTrTargetEventId}>
              <option value="">Selecione</option>
              {data?.events
                .filter(ev => !selectedSourceEv || (ev.producerId === selectedSourceEv.producerId && ev.id !== selectedSourceEv.id))
                .map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.producerName} · {ev.name}</option>
                ))}
            </SelectField>
            <Field label="Valor da transferência (R$)">
              <Input required value={trAmountBRL} onChange={e => setTrAmountBRL(e.target.value)} placeholder="20000,00" />
            </Field>
            <Field label="Justificativa operacional / contratual">
              <Input required minLength={5} value={trReason} onChange={e => setTrReason(e.target.value)} placeholder="Ex.: Cobertura de locação do Evento B" />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setTransferModal(false)}>Cancelar</Button>
              <Button disabled={busy || !trSourceEventId || !trTargetEventId}>{busy ? "Enviando..." : "Solicitar transferência"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
