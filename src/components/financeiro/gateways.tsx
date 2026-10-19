"use client";
import { useState, type FormEvent } from "react";
import { Plus, Settings2, Landmark, CreditCard, Calculator } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, Empty, ErrorNotice, Field, Loading, PageHeading, useApi } from "@/components/financeiro/shared";
import {
  SelectField,
  bpsToPercent,
  percentToBps,
  nonnegativeBRLInput,
  type Catalog,
} from "@/components/financeiro/operations-shared";
import { ListSearch, searchRows } from "@/components/financeiro/list-search";
import { fmtBRL, parseBRLToCents } from "@/lib/money";

type Modal = "gateway" | "brand" | "mdr" | null;

export function GatewaysPage() {
  const { data, loading, error, reload } = useApi<Catalog>("/api/financeiro/catalogo");
  const [modal, setModal] = useState<Modal>(null),
    [query, setQuery] = useState("");
  const [gatewayName, setGatewayName] = useState(""),
    [brandName, setBrandName] = useState("");
  const [gatewayId, setGatewayId] = useState(""),
    [brandId, setBrandId] = useState("");
  const [installments, setInstallments] = useState("1"),
    [rate, setRate] = useState(""),
    [fixed, setFixed] = useState("0,00");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");

  // Simulador rápido de custo MDR e líquido adquirente
  const [simAmount, setSimAmount] = useState("100,00");
  const [simRate, setSimRate] = useState("2,99");
  const [simFixed, setSimFixed] = useState("0,50");

  const rules = data?.rules ?? [];
  const gateways = data?.gateways ?? [];
  const brands = data?.brands ?? [];
  const shown = searchRows(rules, query, (r) => [
    r.gatewayName,
    r.brandName,
    r.installments,
    r.rateBps,
  ]);

  let simGrossCents = 10000n;
  let simMdrCents = 0n;
  let simNetCents = 10000n;
  try {
    simGrossCents = BigInt(parseBRLToCents(simAmount));
    const bps = BigInt(percentToBps(simRate));
    const fix = BigInt(nonnegativeBRLInput(simFixed));
    simMdrCents = (simGrossCents * bps + 5000n) / 10000n + fix;
    simNetCents = simGrossCents > simMdrCents ? simGrossCents - simMdrCents : 0n;
  } catch {
    // mantém último valor válido durante digitação
  }

  function open(next: Modal) {
    setMessage("");
    if (next === "mdr") {
      if (!gatewayId && gateways[0]) setGatewayId(gateways[0].id);
      if (!brandId && brands[0]) setBrandId(brands[0].id);
    }
    setModal(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!modal) return;
    setBusy(true);
    setMessage("");
    try {
      if (modal === "gateway") {
        await api("/api/financeiro/gateways", {
          method: "POST",
          body: JSON.stringify({ name: gatewayName }),
        });
      }
      if (modal === "brand") {
        await api("/api/financeiro/bandeiras", {
          method: "POST",
          body: JSON.stringify({ name: brandName }),
        });
      }
      if (modal === "mdr") {
        await api("/api/financeiro/mdr", {
          method: "POST",
          body: JSON.stringify({
            gatewayId,
            brandId,
            installments: Number(installments),
            rateBps: percentToBps(rate),
            fixedCents: nonnegativeBRLInput(fixed),
          }),
        });
      }
      setGatewayName("");
      setBrandName("");
      setRate("");
      setFixed("0,00");
      setModal(null);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Financeiro interno · meios de pagamento"
        title="Gateways, Bandeiras e MDR"
        subtitle="Mantenha as adquirentes, bandeiras, modalidades (PIX, Débito, Crédito 1x–12x) e custos MDR. Alterações valem para novas vendas sem alterar o histórico."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => open("gateway")}>
              <Plus size={15} />
              Nova adquirente
            </Button>
            <Button variant="outline" onClick={() => open("brand")}>
              <Plus size={15} />
              Nova bandeira
            </Button>
            <Button onClick={() => open("mdr")}>
              <Plus size={16} />
              Nova regra MDR
            </Button>
          </div>
        }
      />

      {error && <ErrorNotice message={error} retry={reload} />}
      {loading ? (
        <Loading />
      ) : (
        <>
          {/* Indicadores próprios de Gateways e MDR */}
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Adquirentes ativas</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {gateways.filter((g) => g.active).length}
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-400">
                {gateways.map((g) => g.name).join(", ") || "Nenhuma cadastrada"}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Bandeiras e modalidades</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {brands.filter((b) => b.active).length}
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-400">
                {brands.map((b) => b.name).join(", ") || "Nenhuma cadastrada"}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Regras MDR configuradas</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{rules.length}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Tabelas por adquirente, bandeira e parcela
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-slate-500">Líquido simulado (R$ {simAmount})</p>
              <p className="mt-2 text-2xl font-bold text-sky-800">{fmtBRL(simNetCents)}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Custo MDR: {fmtBRL(simMdrCents)} ({simRate}% + R$ {simFixed})
              </p>
            </Card>
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Landmark size={19} className="text-[#b75c53]" />
                  <h2 className="font-semibold">Adquirentes ({gateways.length})</h2>
                </div>
                <Button variant="outline" size="sm" onClick={() => open("gateway")}>
                  <Plus size={14} />
                  Adicionar
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {gateways.length ? (
                  gateways.map((g) => (
                    <Badge key={g.id} tone={g.active ? "green" : "neutral"}>
                      {g.name}
                    </Badge>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">Nenhuma adquirente cadastrada.</p>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard size={19} className="text-[#b75c53]" />
                  <h2 className="font-semibold">Bandeiras e modalidades ({brands.length})</h2>
                </div>
                <Button variant="outline" size="sm" onClick={() => open("brand")}>
                  <Plus size={14} />
                  Adicionar
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {brands.length ? (
                  brands.map((b) => (
                    <Badge key={b.id} tone={b.active ? "blue" : "neutral"}>
                      {b.name}
                    </Badge>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">Nenhuma bandeira cadastrada.</p>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Calculator size={19} className="text-[#b75c53]" />
                <h2 className="font-semibold">Simulador Rápido de Custo MDR</h2>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Field label="Venda (R$)">
                  <Input value={simAmount} onChange={(e) => setSimAmount(e.target.value)} />
                </Field>
                <Field label="MDR (%)">
                  <Input value={simRate} onChange={(e) => setSimRate(e.target.value)} />
                </Field>
                <Field label="Fixo (R$)">
                  <Input value={simFixed} onChange={(e) => setSimFixed(e.target.value)} />
                </Field>
              </div>
              <p className="mt-2.5 text-xs text-slate-600">
                Retenção Adquirente: <strong>{fmtBRL(simMdrCents)}</strong> · Líquido Adquirente:{" "}
                <strong className="text-emerald-700">{fmtBRL(simNetCents)}</strong>
              </p>
            </Card>
          </div>

          <ListSearch
            value={query}
            onChange={setQuery}
            count={shown.length}
            label="Buscar adquirente, bandeira ou parcelamento"
          />

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eee9e7] p-5">
              <div className="flex items-center gap-2 font-semibold">
                <Settings2 size={18} />
                Regras MDR configuradas ({shown.length})
              </div>
              <Button size="sm" onClick={() => open("mdr")}>
                <Plus size={14} />
                Configurar regra MDR
              </Button>
            </div>
            {shown.length ? (
              <div className="overflow-x-auto">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Adquirente</th>
                      <th>Bandeira</th>
                      <th>Parcelas</th>
                      <th>MDR (%)</th>
                      <th>Fixo/transação</th>
                      <th>Líquido em R$ 100,00</th>
                      <th>Situação</th>
                      <th>Simular</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const sampleMdr = (10000n * BigInt(r.rateBps) + 5000n) / 10000n + BigInt(r.fixedCents);
                      const sampleNet = 10000n > sampleMdr ? 10000n - sampleMdr : 0n;
                      return (
                        <tr key={r.id}>
                          <td className="font-semibold">{r.gatewayName}</td>
                          <td>{r.brandName}</td>
                          <td>{r.installments}x</td>
                          <td className="font-semibold text-amber-800">{bpsToPercent(r.rateBps)}</td>
                          <td>{fmtBRL(r.fixedCents)}</td>
                          <td className="font-semibold text-emerald-700">{fmtBRL(sampleNet)}</td>
                          <td>
                            <Badge tone={r.active ? "green" : "neutral"}>
                              {r.active ? "Ativa" : "Inativa"}
                            </Badge>
                          </td>
                          <td>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSimRate(bpsToPercent(r.rateBps).replace("%", "").trim());
                                setSimFixed(
                                  fmtBRL(r.fixedCents).replace("R$", "").trim()
                                );
                              }}
                            >
                              Testar no simulador
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 p-10 text-center">
                <Empty text="Nenhuma regra MDR cadastrada ainda para as adquirentes e bandeiras." />
                <div className="flex flex-wrap justify-center gap-2">
                  {gateways.length === 0 && (
                    <Button variant="outline" onClick={() => open("gateway")}>
                      <Plus size={15} />
                      1. Cadastrar adquirente
                    </Button>
                  )}
                  {brands.length === 0 && (
                    <Button variant="outline" onClick={() => open("brand")}>
                      <Plus size={15} />
                      2. Cadastrar bandeira
                    </Button>
                  )}
                  <Button onClick={() => open("mdr")}>
                    <Plus size={15} />
                    Configurar regra MDR
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      <Dialog
        open={!!modal}
        onOpenChange={(o) => {
          if (!o) setModal(null);
        }}
      >
        <DialogContent className="max-w-[650px]">
          <DialogTitle className="text-xl font-bold">
            {modal === "gateway"
              ? "Nova adquirente"
              : modal === "brand"
              ? "Nova bandeira ou modalidade"
              : "Configurar regra MDR"}
          </DialogTitle>
          <DialogDescription>
            Cadastro exclusivo do Financeiro Interno. Registros financeiros existentes permanecem inalterados.
          </DialogDescription>
          <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            {modal === "gateway" && (
              <div className="sm:col-span-2">
                <Field label="Nome da adquirente">
                  <Input
                    required
                    minLength={2}
                    value={gatewayName}
                    onChange={(e) => setGatewayName(e.target.value)}
                    placeholder="Ex.: PagSeguro, Stone, Cielo, Rede"
                  />
                </Field>
              </div>
            )}
            {modal === "brand" && (
              <div className="sm:col-span-2">
                <Field label="Bandeira/modalidade">
                  <Input
                    required
                    minLength={2}
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Ex.: Visa, Mastercard, PIX, Elo"
                  />
                </Field>
              </div>
            )}
            {modal === "mdr" && (
              <>
                <SelectField label="Adquirente" value={gatewayId} onChange={setGatewayId}>
                  <option value="">Selecione</option>
                  {gateways
                    .filter((g) => g.active)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </SelectField>
                <SelectField label="Bandeira" value={brandId} onChange={setBrandId}>
                  <option value="">Selecione</option>
                  {brands
                    .filter((b) => b.active)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </SelectField>
                <Field label="Parcelas (1 a 48)">
                  <Input
                    required
                    type="number"
                    min="1"
                    max="48"
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                  />
                </Field>
                <Field label="Taxa MDR (%)">
                  <Input
                    required
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="2,50"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Custo fixo por transação (R$)">
                    <Input
                      required
                      value={fixed}
                      onChange={(e) => setFixed(e.target.value)}
                      placeholder="0,00"
                    />
                  </Field>
                </div>
              </>
            )}
            {message && (
              <div className="sm:col-span-2">
                <ErrorNotice message={message} />
              </div>
            )}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button disabled={busy || (modal === "mdr" && (!gatewayId || !brandId))}>
                {busy ? "Salvando..." : "Salvar cadastro"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
