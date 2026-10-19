import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildSixMonthTrend, sixMonthStart } from "../src/lib/dashboard-trend";

const reference = new Date("2026-10-19T12:00:00.000Z");

test("agrega por mês com centavos inteiros e sem simular movimentações", () => {
  const data = buildSixMonthTrend([
    { kind: "RECEIVABLE", amountCents: 1025n, settledAt: new Date("2026-09-10T12:00:00Z") },
    { kind: "RECEIVABLE", amountCents: 75n, settledAt: new Date("2026-09-12T12:00:00Z") },
    { kind: "PAYABLE", amountCents: 300n, settledAt: new Date("2026-09-17T12:00:00Z") }
  ], reference);
  assert.equal(data.length, 6);
  assert.deepEqual(data[4], { label: "set", receivedCents: "1100", paidCents: "300" });
  assert.deepEqual(data[5], { label: "out", receivedCents: "0", paidCents: "0" });
});

test("mantém meses vazios zerados e não inclui meses anteriores", () => {
  const data = buildSixMonthTrend([
    { kind: "PAYABLE", amountCents: 400n, settledAt: new Date("2026-04-30T12:00:00Z") },
    { kind: "RECEIVABLE", amountCents: 500n, settledAt: null }
  ], reference);
  assert.ok(data.every(row => row.receivedCents === "0" && row.paidCents === "0"));
});

test("calcula corretamente janela de seis meses na virada de ano", () => {
  assert.equal(sixMonthStart(new Date("2027-02-18T00:00:00Z")).toISOString(), "2026-09-01T00:00:00.000Z");
});

test("preserva exatidão com números acima do limite de Number seguro", () => {
  const value = 9007199254740993n;
  const data = buildSixMonthTrend([{ kind: "RECEIVABLE", amountCents: value, settledAt: reference }], reference);
  assert.equal(data[5].receivedCents, value.toString());
});
