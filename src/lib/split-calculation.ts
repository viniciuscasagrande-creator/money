/** Motor puro de cálculo em centavos, independente de banco e navegador. */
const MAX = 9999999999999999n;
export const ruleError = (message: string): never => { throw new Error(`REGRA:${message}`); };
export function nonnegativeCents(s: string): bigint {
  if (!/^\d{1,16}$/.test(s)) return ruleError("Valor em centavos inválido.");
  const n = BigInt(s);
  if (n > MAX) return ruleError("Valor acima do limite permitido.");
  return n;
}
export function percentageCents(base: bigint, bps: number): bigint {
  return (base * BigInt(bps) + 5000n) / 10000n; // arredondamento meio para cima
}
export function saleBreakdown(input: { unitPriceCents: bigint; quantity: number; feeMode: "PERCENT_BPS" | "FIXED_PER_TICKET";
  feeValue: bigint; mdrRateBps: number; mdrFixedCents: bigint; producerPaysMdr: boolean }) {
  if (input.quantity < 1 || input.quantity > 10000 || !Number.isInteger(input.quantity)) return ruleError("Quantidade inválida.");
  const gross = input.unitPriceCents * BigInt(input.quantity);
  if (gross > MAX) return ruleError("Valor bruto acima do limite permitido.");
  const fee = input.feeMode === "PERCENT_BPS" ? percentageCents(gross, Number(input.feeValue)) : input.feeValue * BigInt(input.quantity);
  const mdr = percentageCents(gross, input.mdrRateBps) + input.mdrFixedCents;
  if (fee >= gross) return ruleError("A taxa Disk não pode consumir o valor integral da venda.");
  if (mdr >= gross) return ruleError("As taxas MDR não podem consumir o valor integral da venda.");
  const netSettlement = gross - mdr;
  const producerNet = gross - fee - (input.producerPaysMdr ? mdr : 0n);
  const diskNet = fee - (input.producerPaysMdr ? 0n : mdr);
  if (producerNet <= 0n) return ruleError("A divisão deixou o produtor sem valor a receber.");
  if (netSettlement !== producerNet + diskNet) throw new Error("Falha de conservação financeira.");
  return { gross, fee, mdr, netSettlement, producerNet, diskNet };
}

