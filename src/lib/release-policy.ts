import type { Prisma } from "@prisma/client";
import { progressiveRelease } from "@/lib/release-policy-math";
import { eventAvailability } from "@/lib/operations";

type Db = Prisma.TransactionClient;
const blockedStatuses = ["REQUESTED", "APPROVED", "PRODUCER_ACCEPTED", "READY_TO_SETTLE", "SETTLED"] as const;

export async function releaseLimit(tx: Db, eventId: string) {
  const policy = await tx.eventReleasePolicy.findUnique({
    where: { eventId },
    include: { tiers: { orderBy: { minSoldBps: "asc" } } }
  });
  if (!policy || !policy.active) return null;
  const [sales, settled, payouts, risk, reserves, outgoing] = await Promise.all([
    tx.financialSale.aggregate({ where: { eventId }, _sum: { quantity: true } }),
    tx.financialSale.aggregate({ where: { eventId, status: "SETTLED" }, _sum: { producerNetCents: true } }),
    tx.payoutRequest.aggregate({ where: { eventId, status: { in: [...blockedStatuses] } }, _sum: { amountCents: true } }),
    tx.riskCase.aggregate({ where: { eventId, status: { in: ["OPEN", "CONFIRMED"] } }, _sum: { exposureCents: true } }),
    tx.eventReserve.aggregate({ where: { eventId, status: "ACTIVE" }, _sum: { amountCents: true } }),
    tx.eventTransfer.aggregate({ where: { originEventId: eventId, status: { in: ["REQUESTED", "APPROVED", "PRODUCER_ACCEPTED", "EXECUTED"] } }, _sum: { amountCents: true } })
  ]);
  const eligible =
    (settled._sum.producerNetCents ?? 0n) -
    (risk._sum.exposureCents ?? 0n) -
    (reserves._sum.amountCents ?? 0n) -
    (outgoing._sum.amountCents ?? 0n);
  const v = progressiveRelease({
    capacityTickets: policy.capacityTickets,
    soldTickets: sales._sum.quantity ?? 0,
    tiers: policy.tiers,
    eligibleCents: eligible,
    committedCents: payouts._sum.amountCents ?? 0n
  });
  const available = await eventAvailability(tx, eventId);
  return {
    ...v,
    version: policy.version,
    availableCents: v.remainingCents < available.repasseCents ? v.remainingCents : available.repasseCents
  };
}

/** Verifica uma solicitação já reservada: não conta sua própria reserva duas vezes. */
export async function validateExistingPayout(
  tx: Db,
  p: { eventId: string; amountCents: bigint; type?: "REPASSE" | "ANTECIPACAO" }
) {
  const limit = p.type !== "ANTECIPACAO" ? await releaseLimit(tx, p.eventId) : null;
  const availability = await eventAvailability(tx, p.eventId);
  // O total já comprometido inclui este repasse; se exceder o novo teto, bloqueie.
  if (limit) {
    const commitments = await tx.payoutRequest.aggregate({
      where: { eventId: p.eventId, status: { in: [...blockedStatuses] } },
      _sum: { amountCents: true }
    });
    if ((commitments._sum.amountCents ?? 0n) > limit.cumulativeCapCents) {
      throw new Error("REGRA:Política progressiva alterou o limite; revisão financeira necessária.");
    }
  }
  const baseCents = p.type === "ANTECIPACAO" ? availability.totalCents : availability.settledCents;
  const rawRemaining =
    baseCents -
    availability.committedCents -
    availability.blockedCents -
    availability.reserveCents -
    availability.transferReservedCents -
    availability.transferExecutedCents;
  if (rawRemaining < 0n) {
    throw new Error("REGRA:Retenções, riscos ou outras solicitações reduziram o saldo; reanalise a operação.");
  }
}
