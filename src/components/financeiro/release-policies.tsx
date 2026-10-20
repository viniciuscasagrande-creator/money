"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, PageHeading, Loading, ErrorNotice, useApi } from "@/components/financeiro/shared";
import { fmtBRL } from "@/lib/money";

type Tier = { minSoldBps: number; releaseBps: number };
type Policy = {
  eventId: string;
  eventName: string;
  producerName: string;
  capacityTickets: number;
  active: boolean;
  version: number;
  tiers: Tier[];
  soldBps: number;
  releaseBps?: number;
  cumulativeCapCents?: string;
  availableCents: string;
};

export function ReleasePoliciesPage() {
  const policies = useApi<{ items: Policy[] }>("/api/financeiro/politicas-liberacao");
  const payouts = useApi<{ events: { id: string; name: string; producerName?: string }[] }>("/api/repasses");
  const [event, setEvent] = useState("");
  const [capacity, setCapacity] = useState("");
  const [active, setActive] = useState(true);
  const [tiers, setTiers] = useState<Tier[]>([{ minSoldBps: 0, releaseBps: 0 }, { minSoldBps: 5000, releaseBps: 2000 }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function selectEvent(id: string) {
    setEvent(id);
    setMessage("");
    const found = policies.data?.items.find(p => p.eventId === id);
    setCapacity(found ? String(found.capacityTickets) : "1000");
    setActive(found?.active ?? true);
    setTiers(found?.tiers ?? [{ minSoldBps: 0, releaseBps: 0 }, { minSoldBps: 5000, releaseBps: 2000 }]);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/api/financeiro/politicas-liberacao", {
        method: "POST",
        body: JSON.stringify({
          eventId: event,
          capacityTickets: Number(capacity),
          active,
          tiers
        })
      });
      setMessage("Política salva; as novas solicitações usarão esta regra. Operações já reservadas passam por revalidação automática.");
      policies.reload();
      payouts.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao salvar política.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Financeiro · Aprovação por evento (SOUL v5.3)"
        title="Faixas e Travas Progressivas de Repasses"
        subtitle="Configure a capacidade comercial de ingressos, gatilhos de vendas (%) e tetos cumulativos de repasse (%) por evento. O produtor não pode alterar estas regras."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/repasses"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Repasses e Antecipações
            </Link>
            <Link
              href="/retencoes"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Retenções por Evento
            </Link>
            <Link
              href="/transferencias"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Transferências entre Eventos
            </Link>
          </div>
        }
      />
      {policies.error && <ErrorNotice message={policies.error} retry={policies.reload} />}
      {payouts.error && <ErrorNotice message={payouts.error} retry={payouts.reload} />}
      {(policies.loading || payouts.loading) && <Loading />}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Configurar política por evento</h2>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setTiers([
                    { minSoldBps: 0, releaseBps: 0 },
                    { minSoldBps: 5000, releaseBps: 2000 }
                  ])
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Regra 50% vendas → 20%
              </button>
              <button
                type="button"
                onClick={() =>
                  setTiers([
                    { minSoldBps: 0, releaseBps: 0 },
                    { minSoldBps: 5000, releaseBps: 2000 },
                    { minSoldBps: 7000, releaseBps: 3500 },
                    { minSoldBps: 8500, releaseBps: 5000 },
                    { minSoldBps: 10000, releaseBps: 7000 }
                  ])
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Escala Progressiva Completa
              </button>
            </div>
          </div>

          <form className="space-y-4" onSubmit={save}>
            <label className="block text-sm font-medium text-slate-700">
              Evento
              <select
                required
                value={event}
                onChange={e => selectEvent(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"
              >
                <option value="">Selecione o evento</option>
                {(payouts.data?.events ?? []).map(e => (
                  <option key={e.id} value={e.id}>
                    {e.producerName ? `${e.producerName} · ${e.name}` : e.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Capacidade comercial de ingressos
              <Input
                type="number"
                min="1"
                required
                value={capacity}
                onChange={e => setCapacity(e.target.value)}
                placeholder="Ex.: 1000"
              />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Política progressiva ativa para este evento
            </label>

            <div className="flex items-center justify-between pt-2">
              <h3 className="font-semibold">Faixas progressivas de vendas (%) → Teto cumulativo (%)</h3>
              <Button
                type="button"
                variant="outline"
                disabled={tiers.length >= 20}
                onClick={() =>
                  setTiers(prev => [
                    ...prev,
                    {
                      minSoldBps: Math.min(10000, (prev.at(-1)?.minSoldBps ?? 0) + 1000),
                      releaseBps: prev.at(-1)?.releaseBps ?? 0
                    }
                  ])
                }
              >
                + Faixa
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Valores em percentual (%). Ordene os gatilhos de forma crescente; a liberação é cumulativa sobre a base líquida após retenções e nunca se renova por solicitação.
            </p>

            <div className="space-y-2.5">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-end gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                  <label className="flex-1 text-xs font-medium text-slate-700">
                    Vendas mínimas (%)
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={t.minSoldBps / 100}
                      onChange={e =>
                        setTiers(x =>
                          x.map((v, j) => (j === i ? { ...v, minSoldBps: Math.round(Number(e.target.value) * 100) } : v))
                        )
                      }
                    />
                  </label>
                  <label className="flex-1 text-xs font-medium text-slate-700">
                    Teto liberável cumulativo (%)
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={t.releaseBps / 100}
                      onChange={e =>
                        setTiers(x =>
                          x.map((v, j) => (j === i ? { ...v, releaseBps: Math.round(Number(e.target.value) * 100) } : v))
                        )
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={tiers.length === 1}
                    onClick={() => setTiers(x => x.filter((_, j) => j !== i))}
                  >
                    Remover
                  </Button>
                </div>
              ))}
            </div>

            {message && (
              <p aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {message}
              </p>
            )}
            <Button type="submit" disabled={busy || !event}>
              {busy ? "Salvando..." : "Salvar política"}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold">Políticas cadastradas</h2>
          <div className="space-y-3">
            {policies.data?.items.length === 0 ? (
              <p className="text-sm text-slate-500">
                Ainda não há políticas configuradas. Repasses seguem apenas as travas financeiras já existentes.
              </p>
            ) : (
              policies.data?.items.map(p => (
                <button
                  type="button"
                  onClick={() => selectEvent(p.eventId)}
                  key={p.eventId}
                  className="w-full rounded-xl border border-slate-200 p-3.5 text-left transition hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      {p.eventName} <span className="text-xs font-normal text-slate-500">v{p.version}</span>
                    </p>
                    <Badge tone={p.active ? "green" : "neutral"}>{p.active ? "Ativa" : "Desativada"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {p.producerName} · Capacidade: {p.capacityTickets} ing. · Vendidos: {(p.soldBps / 100).toFixed(2)}%
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.tiers.map((t, idx) => (
                      <span
                        key={idx}
                        className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                      >
                        ≥{(t.minSoldBps / 100).toFixed(0)}% → {(t.releaseBps / 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                  <p className="mt-2.5 text-sm text-slate-800">
                    Teto de nova solicitação: <strong className="text-emerald-700">{fmtBRL(p.availableCents)}</strong>
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
