"use client";

import { useState } from "react";
import { KeyRound, RefreshCw, CheckCircle2, ShieldCheck, ArrowUpRight, Plus, Trash2, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNotice, Loading, PageHeading, useApi } from "@/components/financeiro/shared";

type IntegracaoStatus = {
  connected: boolean;
  maskedKey: string | null;
  provider: string;
  totals: {
    producers: number;
    events: number;
    receivables: number;
  };
  supportedEndpoints: string[];
};

type VendaItem = {
  orderCode: string;
  buyerName: string;
  paymentMethod: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO";
  grossAmountBrl: string;
  dueDate: string;
};

export default function IntegracaoIngressosPage() {
  const { data, loading, error, reload } = useApi<IntegracaoStatus>("/api/integracao/ingressos");

  const [producerName, setProducerName] = useState("");
  const [producerDoc, setProducerDoc] = useState("");
  const [producerEmail, setProducerEmail] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sales, setSales] = useState<VendaItem[]>([
    {
      orderCode: "PED-1001",
      buyerName: "",
      paymentMethod: "PIX",
      grossAmountBrl: "150,00",
      dueDate: new Date().toISOString().slice(0, 10),
    },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  function addSaleRow() {
    setSales((prev) => [
      ...prev,
      {
        orderCode: `PED-${1001 + prev.length}`,
        buyerName: "",
        paymentMethod: "PIX",
        grossAmountBrl: "100,00",
        dueDate: new Date().toISOString().slice(0, 10),
      },
    ]);
  }

  function removeSaleRow(idx: number) {
    setSales((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSaleRow(idx: number, patch: Partial<VendaItem>) {
    setSales((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function parseBrlToCents(brl: string): number {
    const cleaned = brl.replace(/\./g, "").replace(",", ".").trim();
    const num = Number(cleaned);
    return Number.isFinite(num) && num > 0 ? Math.round(num * 100) : 0;
  }

  async function handleSync(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess(null);

    const parsedSales = sales.map((s) => ({
      orderCode: s.orderCode.trim(),
      buyerName: s.buyerName.trim(),
      paymentMethod: s.paymentMethod,
      grossAmountCents: parseBrlToCents(s.grossAmountBrl),
      dueDate: s.dueDate,
    }));

    if (parsedSales.some((s) => !s.orderCode || !s.buyerName || s.grossAmountCents <= 0)) {
      setSubmitError("Preencha código do pedido, comprador e valor válido (> 0) em todos os itens.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/integracao/ingressos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          producer: {
            name: producerName.trim(),
            document: producerDoc.trim(),
            email: producerEmail.trim() || undefined,
          },
          event: {
            name: eventName.trim(),
            startsAt: eventDate,
            location: eventLocation.trim() || undefined,
          },
          sales: parsedSales,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setSubmitError(payload.error || "Falha ao sincronizar vendas via API de Ingressos.");
        return;
      }
      setSubmitSuccess(
        `Sincronização concluída! ${payload.syncedTitles} título(s) a receber criados no razão financeiro (Produtor ID: ${payload.producerId.slice(0, 8)}..., Evento ID: ${payload.eventId.slice(0, 8)}...).`
      );
      reload();
    } catch {
      setSubmitError("Erro de comunicação ao sincronizar com /api/integracao/ingressos.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Menus 02, 07 e 17 · Integração Externa e Webhooks"
        title="API de Ingressos & Sincronização de Vendas"
        subtitle="Conector oficial autenticado via EXTERNAL_TICKETING_API_KEY para recepção de produtores, eventos, lotes e vendas em tempo real diretamente no banco relacional Prisma."
        action={
          <Badge tone={data?.connected ? "green" : "amber"}>
            {data?.connected ? "Chave API Ativa (.env)" : "Aguardando Chave"}
          </Badge>
        }
      />

      {error && <ErrorNotice message={error} retry={reload} />}
      {loading && <Loading />}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Credencial Configurada
                  </span>
                  <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                    <KeyRound size={18} />
                  </span>
                </div>
                <p className="font-mono text-lg font-bold text-slate-900">
                  {data.maskedKey || "Não configurada"}
                </p>
                <p className="mt-1 text-xs text-slate-500">{data.provider}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Produtores & Eventos Reais
                  </span>
                  <span className="rounded-xl bg-blue-50 p-2 text-blue-700">
                    <ShieldCheck size={18} />
                  </span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {data.totals.producers} produtor(es) · {data.totals.events} evento(s)
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Registros persistidos no banco SQLite/PostgreSQL sem dados fictícios
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Recebíveis Sincronizados
                  </span>
                  <span className="rounded-xl bg-violet-50 p-2 text-violet-700">
                    <RefreshCw size={18} />
                  </span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{data.totals.receivables}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Títulos em Contas a Receber vinculados a eventos e produtores
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <Card>
              <CardHeader>
                <CardTitle>Homologação / Ingestão de Vendas de Ingressos (Transação Atômica)</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSync} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Label>Nome / Razão Social do Produtor</Label>
                      <Input
                        required
                        value={producerName}
                        onChange={(e) => setProducerName(e.target.value)}
                        placeholder="Ex.: Produtora Prime Eventos LTDA"
                      />
                    </div>
                    <div>
                      <Label>CNPJ / CPF do Produtor</Label>
                      <Input
                        required
                        value={producerDoc}
                        onChange={(e) => setProducerDoc(e.target.value)}
                        placeholder="00.000.000/0001-00"
                      />
                    </div>
                    <div>
                      <Label>E-mail do Produtor (opcional)</Label>
                      <Input
                        type="email"
                        value={producerEmail}
                        onChange={(e) => setProducerEmail(e.target.value)}
                        placeholder="financeiro@produtora.com.br"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Label>Nome do Evento</Label>
                      <Input
                        required
                        value={eventName}
                        onChange={(e) => setEventName(e.target.value)}
                        placeholder="Ex.: Festival Arena 2026 - Lote 1"
                      />
                    </div>
                    <div>
                      <Label>Data do Evento</Label>
                      <Input
                        required
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Local / Cidade</Label>
                      <Input
                        value={eventLocation}
                        onChange={(e) => setEventLocation(e.target.value)}
                        placeholder="São Paulo / SP"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Pedidos / Transações de Ingressos a Sincronizar
                      </span>
                      <Button type="button" variant="outline" size="sm" onClick={addSaleRow}>
                        <Plus size={14} className="mr-1.5" /> Adicionar pedido
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {sales.map((item, idx) => (
                        <div
                          key={idx}
                          className="grid gap-2.5 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[110px_1fr_140px_120px_135px_auto]"
                        >
                          <div>
                            <Label className="text-[11px]">Pedido</Label>
                            <Input
                              required
                              value={item.orderCode}
                              onChange={(e) => updateSaleRow(idx, { orderCode: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-[11px]">Comprador / Lote</Label>
                            <Input
                              required
                              placeholder="Nome do comprador"
                              value={item.buyerName}
                              onChange={(e) => updateSaleRow(idx, { buyerName: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-[11px]">Meio Pagto</Label>
                            <select
                              value={item.paymentMethod}
                              onChange={(e) =>
                                updateSaleRow(idx, {
                                  paymentMethod: e.target.value as VendaItem["paymentMethod"],
                                })
                              }
                              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800"
                            >
                              <option value="PIX">PIX</option>
                              <option value="CREDIT_CARD">Cartão Crédito</option>
                              <option value="DEBIT_CARD">Cartão Débito</option>
                              <option value="BOLETO">Boleto</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-[11px]">Valor Bruto (R$)</Label>
                            <Input
                              required
                              value={item.grossAmountBrl}
                              onChange={(e) =>
                                updateSaleRow(idx, { grossAmountBrl: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-[11px]">Previsão Liq.</Label>
                            <Input
                              required
                              type="date"
                              value={item.dueDate}
                              onChange={(e) => updateSaleRow(idx, { dueDate: e.target.value })}
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={sales.length === 1}
                              onClick={() => removeSaleRow(idx)}
                              title="Remover linha"
                            >
                              <Trash2 size={15} className="text-slate-400 hover:text-red-600" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {submitError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                      {submitError}
                    </div>
                  )}

                  {submitSuccess && (
                    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                      <span>{submitSuccess}</span>
                    </div>
                  )}

                  <Button type="submit" disabled={submitting}>
                    <Send size={15} className="mr-2" />
                    {submitting
                      ? "Sincronizando no banco Prisma..."
                      : "Sincronizar Produtor, Evento e Recebíveis"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Documentação do Webhook Externo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs leading-relaxed text-slate-600">
                <p>
                  Sistemas externos de bilheteria ou gateways podem enviar vendas diretamente para o endpoint{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">
                    POST /api/integracao/ingressos
                  </code>{" "}
                  utilizando o cabeçalho HTTP{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">
                    X-Api-Key
                  </code>{" "}
                  configurado no arquivo <code className="font-mono">.env</code>.
                </p>

                <div className="rounded-xl bg-slate-900 p-3.5 font-mono text-[11px] text-slate-100">
                  <p className="text-emerald-400">POST /api/integracao/ingressos</p>
                  <p className="text-slate-400">X-Api-Key: {"<EXTERNAL_TICKETING_API_KEY>"}</p>
                  <p className="text-slate-400">Content-Type: application/json</p>
                  <pre className="mt-2 overflow-x-auto text-[10px] leading-4 text-slate-300">
{`{
  "producer": {
    "name": "Produtora Exemplo",
    "document": "12.345.678/0001-99"
  },
  "event": {
    "name": "Show Nacional 2026",
    "startsAt": "2026-11-20"
  },
  "sales": [
    {
      "orderCode": "ING-9001",
      "buyerName": "Cliente A",
      "paymentMethod": "PIX",
      "grossAmountCents": 25000,
      "dueDate": "2026-10-21"
    }
  ]
}`}
                  </pre>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-blue-950">
                  <p className="font-semibold">Submenus Atendidos por esta Integração:</p>
                  <ul className="mt-1.5 space-y-1 text-[11px] text-blue-900">
                    <li className="flex items-center gap-1.5">
                      <ArrowUpRight size={13} /> 02.04 · Vendas e Transações
                    </li>
                    <li className="flex items-center gap-1.5">
                      <ArrowUpRight size={13} /> 02.09 · Vendas por Evento e Lote (+19 Ingressos)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <ArrowUpRight size={13} /> 07.09 · Webhooks e Integrações
                    </li>
                    <li className="flex items-center gap-1.5">
                      <ArrowUpRight size={13} /> 17.09 · Integrações e Chaves de API
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
