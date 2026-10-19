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
  feeValue: bigint; feeExtraFixedCents?: bigint; mdrRateBps: number; mdrFixedCents: bigint; producerPaysMdr: boolean }) {
  if (input.quantity < 1 || input.quantity > 10000 || !Number.isInteger(input.quantity)) return ruleError("Quantidade inválida.");
  const gross = input.unitPriceCents * BigInt(input.quantity);
  if (gross > MAX) return ruleError("Valor bruto acima do limite permitido.");
  const extraFixedTotal = (input.feeExtraFixedCents ?? 0n) * BigInt(input.quantity);
  const fee = input.feeMode === "PERCENT_BPS"
    ? percentageCents(gross, Number(input.feeValue)) + extraFixedTotal
    : input.feeValue * BigInt(input.quantity);
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

export type CostBearer = "PRODUCER" | "SOUL" | "BUYER";
export type SaleChannel = "ONLINE" | "POS" | "BILHETERIA";
export type PaymentMethod = "PIX" | "DEBIT" | "CREDIT_SINGLE" | "CREDIT_INSTALLMENT";

export type ExtendedSaleInput = {
  unitPriceCents: bigint;
  quantity: number;
  feeMode: "PERCENT_BPS" | "FIXED_PER_TICKET";
  feeValue: bigint;
  mdrRateBps: number;
  mdrFixedCents: bigint;
  producerPaysMdr: boolean;
  channel?: SaleChannel;
  paymentMethod?: PaymentMethod;
  installments?: number;
  installmentInterestBps?: number;
  costBearer?: CostBearer;
  spreadBps?: number;
  advancedBps?: number;
  rebateBps?: number;
};

export function extendedSaleBreakdown(input: ExtendedSaleInput) {
  const base = saleBreakdown(input);
  const channel: SaleChannel = input.channel ?? "ONLINE";
  const installments = input.installments ?? 1;
  const paymentMethod: PaymentMethod = input.paymentMethod ?? (installments > 1 ? "CREDIT_INSTALLMENT" : "CREDIT_SINGLE");
  const costBearer: CostBearer = input.costBearer ?? (input.producerPaysMdr ? "PRODUCER" : "SOUL");
  const interestBps = input.installmentInterestBps ?? 0;
  const spreadBps = input.spreadBps ?? 0;
  const advancedBps = input.advancedBps ?? 0;
  const rebateBps = input.rebateBps ?? 0;

  const installmentSurchargeCents = interestBps > 0 ? percentageCents(base.gross, interestBps) : 0n;
  const spreadCents = spreadBps > 0 ? percentageCents(base.gross, spreadBps) : 0n;
  const advancedCents = advancedBps > 0 ? percentageCents(base.gross, advancedBps) : 0n;
  const rebateCents = rebateBps > 0 ? percentageCents(base.mdr, rebateBps) : 0n;

  const buyerTotalCents = costBearer === "BUYER" ? base.gross + installmentSurchargeCents + spreadCents : base.gross;
  const producerExtraCharges = costBearer === "PRODUCER" ? installmentSurchargeCents + spreadCents + advancedCents : 0n;
  const soulExtraRevenue = installmentSurchargeCents + spreadCents + advancedCents + rebateCents;

  const producerNet = base.producerNet > producerExtraCharges ? base.producerNet - producerExtraCharges : 0n;
  const diskNet = base.diskNet + (costBearer === "PRODUCER" ? producerExtraCharges : 0n) + (costBearer === "BUYER" ? installmentSurchargeCents + spreadCents : 0n) + rebateCents;
  const netSettlement = buyerTotalCents - base.mdr + rebateCents;

  return {
    ...base,
    channel,
    paymentMethod,
    installments,
    costBearer,
    buyerTotalCents,
    installmentSurchargeCents,
    spreadCents,
    advancedCents,
    rebateCents,
    producerNet,
    diskNet,
    netSettlement,
    memory: {
      channel,
      paymentMethod,
      installments,
      costBearer,
      ticketGrossCents: base.gross.toString(),
      buyerTotalCents: buyerTotalCents.toString(),
      gatewayMdrCents: base.mdr.toString(),
      soulAdminFeeCents: base.fee.toString(),
      installmentSurchargeCents: installmentSurchargeCents.toString(),
      spreadCents: spreadCents.toString(),
      advancedCents: advancedCents.toString(),
      rebateCents: rebateCents.toString(),
      netSettlementCents: netSettlement.toString(),
      producerNetCents: producerNet.toString(),
      soulResultCents: diskNet.toString()
    }
  };
}

export function simulateInstallmentMatrix(input: {
  ticketPriceCents: bigint;
  totalChargeBps: number;
  costBearer: CostBearer;
  installments?: number;
}) {
  const installments = Math.min(12, Math.max(1, input.installments ?? 12));
  const chargeCents = percentageCents(input.ticketPriceCents, input.totalChargeBps);
  const buyerTotalCents = input.costBearer === "BUYER" ? input.ticketPriceCents + chargeCents : input.ticketPriceCents;
  const producerAbsorbedCents = input.costBearer === "PRODUCER" ? chargeCents : 0n;
  const soulAbsorbedCents = input.costBearer === "SOUL" ? chargeCents : 0n;
  const installmentValueCents = buyerTotalCents / BigInt(installments);
  return {
    installments,
    ticketPriceCents: input.ticketPriceCents,
    chargeCents,
    buyerTotalCents,
    producerAbsorbedCents,
    soulAbsorbedCents,
    installmentValueCents,
    costBearer: input.costBearer
  };
}


