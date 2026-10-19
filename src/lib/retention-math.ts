/** Cálculos monetários em centavos: valores recebidos por transferência não aumentam elegibilidade para repasse externo. */
export function repasseAvailable(inputs: {settled: bigint; committed: bigint; riskBlocked: bigint; reserve: bigint; transferReserved: bigint; transferExecuted: bigint; policyCeiling?: bigint}) {
  const {settled, committed, riskBlocked, reserve, transferReserved, transferExecuted, policyCeiling} = inputs;
  const liquid = settled - committed - riskBlocked - reserve - transferReserved - transferExecuted;
  const safe = liquid > 0n ? liquid : 0n;
  return policyCeiling === undefined ? safe : safe < policyCeiling ? safe : policyCeiling > 0n ? policyCeiling : 0n;
}
