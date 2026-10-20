import { test } from "node:test";
import { strict as assert } from "node:assert";
import { progressiveRelease, validateTiers } from "@/lib/release-policy-math";

const tiers = [
  { minSoldBps: 0, releaseBps: 0 },
  { minSoldBps: 5000, releaseBps: 2000 },
  { minSoldBps: 8000, releaseBps: 4000 }
];

test("abaixo do gatilho fica bloqueado", () => {
  assert.equal(
    progressiveRelease({ capacityTickets: 100, soldTickets: 49, tiers, eligibleCents: 100000n, committedCents: 0n }).remainingCents,
    0n
  );
});

test("ao atingir 50% teto cumulativo de 20%", () => {
  const p = progressiveRelease({ capacityTickets: 100, soldTickets: 50, tiers, eligibleCents: 100000n, committedCents: 5000n });
  assert.equal(p.cumulativeCapCents, 20000n);
  assert.equal(p.remainingCents, 15000n);
});

test("reservado não pode ser solicitado novamente", () => {
  assert.equal(
    progressiveRelease({ capacityTickets: 100, soldTickets: 80, tiers, eligibleCents: 100000n, committedCents: 40000n }).remainingCents,
    0n
  );
});

test("sem base elegível não libera", () => {
  assert.equal(
    progressiveRelease({ capacityTickets: 100, soldTickets: 100, tiers, eligibleCents: -500n, committedCents: 0n }).remainingCents,
    0n
  );
});

test("faixas inválidas são rejeitadas", () => {
  assert.throws(() =>
    validateTiers([
      { minSoldBps: 5000, releaseBps: 3000 },
      { minSoldBps: 4000, releaseBps: 2000 }
    ])
  );
});
