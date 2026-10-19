import test from "node:test";
import assert from "node:assert/strict";
import { parseCents, parseBRLToCents, fmtBRL } from "../src/lib/money";

test("converte valor brasileiro sem ponto flutuante", () => {
  assert.equal(parseBRLToCents("1.234,56"), "123456");
  assert.equal(parseBRLToCents("0,01"), "1");
  assert.equal(parseBRLToCents("100"), "10000");
  assert.equal(parseBRLToCents("1,5"), "150");
});
test("impede valores inválidos e negativos", () => {
  for (const value of ["-1", "1.50", "0", "2,999", "abc"]) assert.throws(() => parseBRLToCents(value));
  for (const value of ["0", "-1", "1.2", "abc"]) assert.throws(() => parseCents(value));
});
test("apresenta saldo positivo e negativo em pt-BR", () => {
  assert.equal(fmtBRL("123456"), "R$ 1.234,56");
  assert.equal(fmtBRL("-101"), "−R$ 1,01");
  assert.equal(parseCents("9999999999999999"), 9999999999999999n);
});
