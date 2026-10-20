/** Valores inteiros: bps representam 0..10000, quantias em centavos bigint. */
export type ReleaseTier = { minSoldBps: number; releaseBps: number };

export function validateTiers(tiers: ReleaseTier[]) {
  if (!tiers.length || tiers.length > 20) throw new Error("REGRA:Cadastre de 1 a 20 faixas.");
  let prev = -1,
    rate = -1;
  for (const t of tiers) {
    if (
      !Number.isInteger(t.minSoldBps) ||
      !Number.isInteger(t.releaseBps) ||
      t.minSoldBps < 0 ||
      t.minSoldBps > 10000 ||
      t.releaseBps < 0 ||
      t.releaseBps > 10000 ||
      t.minSoldBps <= prev ||
      t.releaseBps < rate
    ) {
      throw new Error("REGRA:Faixas devem ter limites crescentes, sem repetição e percentuais entre 0% e 100%.");
    }
    prev = t.minSoldBps;
    rate = t.releaseBps;
  }
}

export function progressiveRelease(input: {
  capacityTickets: number;
  soldTickets: number;
  tiers: ReleaseTier[];
  eligibleCents: bigint;
  committedCents: bigint;
}) {
  validateTiers(input.tiers);
  if (
    !Number.isSafeInteger(input.capacityTickets) ||
    input.capacityTickets <= 0 ||
    !Number.isSafeInteger(input.soldTickets) ||
    input.soldTickets < 0
  ) {
    throw new Error("REGRA:Capacidade e quantidade de vendas inválidas.");
  }
  const soldBps = Math.min(10000, Math.floor((input.soldTickets * 10000) / input.capacityTickets));
  let releaseBps = 0;
  for (const tier of input.tiers) {
    if (soldBps >= tier.minSoldBps) releaseBps = tier.releaseBps;
  }
  const eligible = input.eligibleCents > 0n ? input.eligibleCents : 0n;
  const cap = (eligible * BigInt(releaseBps)) / 10000n;
  const available = cap > input.committedCents ? cap - input.committedCents : 0n;
  return { soldBps, releaseBps, cumulativeCapCents: cap, remainingCents: available };
}
