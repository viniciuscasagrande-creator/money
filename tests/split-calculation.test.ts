import test from "node:test";
import assert from "node:assert/strict";
import { saleBreakdown, percentageCents, nonnegativeCents, simulateInstallmentMatrix, extendedSaleBreakdown } from "../src/lib/split-calculation";

test("calcula split conservando o valor líquido da adquirente", () => {
  const result = saleBreakdown({ unitPriceCents: 10000n, quantity: 2, feeMode: "PERCENT_BPS", feeValue: 1000n,
    mdrRateBps: 250, mdrFixedCents: 0n, producerPaysMdr: true });
  assert.equal(result.gross, 20000n);
  assert.equal(result.fee, 2000n);
  assert.equal(result.mdr, 500n);
  assert.equal(result.netSettlement, 19500n);
  assert.equal(result.producerNet, 17500n);
  assert.equal(result.diskNet, 2000n);
});
test("taxa fixa é por ingresso e MDR fixo por transação", () => {
  const result = saleBreakdown({ unitPriceCents: 5000n, quantity: 3, feeMode: "FIXED_PER_TICKET", feeValue: 200n,
    mdrRateBps: 0, mdrFixedCents: 150n, producerPaysMdr: true });
  assert.equal(result.fee, 600n);
  assert.equal(result.mdr, 150n);
  assert.equal(result.netSettlement, result.producerNet + result.diskNet);
});
test("quando MDR é custo da Disk, margem pode ser negativa mas split permanece equilibrado", () => {
  const result = saleBreakdown({ unitPriceCents: 1000n, quantity: 1, feeMode: "FIXED_PER_TICKET", feeValue: 10n,
    mdrRateBps: 200, mdrFixedCents: 0n, producerPaysMdr: false });
  assert.equal(result.producerNet, 990n);
  assert.equal(result.diskNet, -10n);
  assert.equal(result.netSettlement, 980n);
});
test("arredondamento meio para cima e limite financeiro", () => {
  assert.equal(percentageCents(100n, 50), 1n);
  assert.equal(percentageCents(10000n, 250), 250n);
  assert.equal(nonnegativeCents("0"), 0n);
  assert.throws(() => nonnegativeCents("-1"));
});
test("impede cobrança integral e MDR inviável", () => {
  const base = { unitPriceCents: 1000n, quantity: 1, feeMode: "PERCENT_BPS" as const,
    feeValue: 0n, mdrRateBps: 0, mdrFixedCents: 0n, producerPaysMdr: true };
  assert.throws(() => saleBreakdown({ ...base, feeValue: 10000n }));
  assert.throws(() => saleBreakdown({ ...base, mdrRateBps: 10000 }));
  assert.throws(() => saleBreakdown({ ...base, quantity: 0 }));
});
test("simulador de matriz de parcelamento 12x distingue absorção pelo comprador, produtor e SOUL", () => {
  const buyerSim = simulateInstallmentMatrix({ ticketPriceCents: 20000n, totalChargeBps: 800, costBearer: "BUYER", installments: 12 });
  assert.equal(buyerSim.chargeCents, 1600n);
  assert.equal(buyerSim.buyerTotalCents, 21600n);
  assert.equal(buyerSim.installmentValueCents, 1800n);
  const prodSim = simulateInstallmentMatrix({ ticketPriceCents: 20000n, totalChargeBps: 800, costBearer: "PRODUCER", installments: 12 });
  assert.equal(prodSim.buyerTotalCents, 20000n);
  assert.equal(prodSim.producerAbsorbedCents, 1600n);
});
test("memória de cálculo completa inclui canal POS/Online, Spread, Advanced e Rebate", () => {
  const ext = extendedSaleBreakdown({
    unitPriceCents: 20000n, quantity: 1, feeMode: "PERCENT_BPS", feeValue: 1000n,
    mdrRateBps: 250, mdrFixedCents: 0n, producerPaysMdr: true,
    channel: "POS", installments: 6, installmentInterestBps: 400, costBearer: "PRODUCER",
    spreadBps: 100, advancedBps: 50, rebateBps: 2000
  });
  assert.equal(ext.channel, "POS");
  assert.equal(ext.spreadCents, 200n);
  assert.equal(ext.advancedCents, 100n);
  assert.equal(ext.rebateCents, 100n);
  assert.equal(ext.memory.channel, "POS");
  assert.equal(ext.memory.soulAdminFeeCents, "2000");
});
test("taxa por evento híbrida (Percentual % + Valor Fixo R$ por ingresso) soma ambos os componentes", () => {
  const result = saleBreakdown({
    unitPriceCents: 10000n, // R$ 100,00
    quantity: 2, // 2 ingressos = R$ 200,00 bruto
    feeMode: "PERCENT_BPS",
    feeValue: 1000n, // 10% = R$ 20,00
    feeExtraFixedCents: 250n, // + R$ 2,50 por ingresso = R$ 5,00
    mdrRateBps: 200, // 2% = R$ 4,00
    mdrFixedCents: 0n,
    producerPaysMdr: true
  });
  assert.equal(result.gross, 20000n);
  assert.equal(result.fee, 2500n); // R$ 20,00 (10%) + R$ 5,00 (2 x R$ 2,50) = R$ 25,00
  assert.equal(result.producerNet, 17100n); // R$ 200,00 - R$ 25,00 - R$ 4,00 = R$ 171,00
  assert.equal(result.diskNet, 2500n);
});

test("extendedSaleBreakdown impede quebra de conservação quando encargos excedem líquido do produtor (A10)", () => {
  assert.throws(() =>
    extendedSaleBreakdown({
      unitPriceCents: 10000n,
      quantity: 1,
      feeMode: "PERCENT_BPS",
      feeValue: 1000n,
      mdrRateBps: 0,
      mdrFixedCents: 0n,
      producerPaysMdr: true,
      costBearer: "PRODUCER",
      installmentInterestBps: 5000,
      spreadBps: 5000,
      advancedBps: 5000
    })
  );
  const valid = extendedSaleBreakdown({
    unitPriceCents: 10000n,
    quantity: 1,
    feeMode: "PERCENT_BPS",
    feeValue: 1000n,
    mdrRateBps: 200,
    mdrFixedCents: 0n,
    producerPaysMdr: true,
    costBearer: "PRODUCER",
    installmentInterestBps: 300,
    spreadBps: 100,
    advancedBps: 100
  });
  assert.equal(valid.netSettlement, valid.producerNet + valid.diskNet);
});



