import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { authorize, isInternal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { eventAvailability, eventAvailabilityDTO } from "@/lib/operations";
export const runtime = "nodejs";
async function GETHandler(request: NextRequest) {
  const { user, error } = await authorize(request); if (error || !user) return error!;
  if (isInternal(user.role)) {
    const [accounts, entries, allEvents] = await Promise.all([
      prisma.bankAccount.findMany({ orderBy: { name: "asc" } }),
      prisma.ledgerEntry.groupBy({ by: ["bankAccountId", "direction"], _sum: { amountCents: true } }),
      prisma.event.findMany({ orderBy: { name: "asc" }, include: { producer: { select: { name: true } } } })
    ]);
    const computed = new Map<string, bigint>();
    for (const e of entries) computed.set(e.bankAccountId, (computed.get(e.bankAccountId) ?? 0n) + (e.direction === "CREDIT" ? (e._sum.amountCents ?? 0n) : -(e._sum.amountCents ?? 0n)));
    const events = await Promise.all(allEvents.map(async e => ({
      ...eventAvailabilityDTO(e.id, e.name, await eventAvailability(prisma, e.id)),
      producerId: e.producerId,
      producerName: e.producer.name
    })));
    return NextResponse.json({ mode: "INTERNAL", items: accounts.map(a => ({ id: a.id, name: a.name, institution: a.institution,
      balanceCents: a.balanceCents.toString(), ledgerBalanceCents: (computed.get(a.id) ?? 0n).toString(),
      reconciled: a.balanceCents === (computed.get(a.id) ?? 0n), active: a.active })), events });
  }
  // A posição do produtor vem somente das vendas e obrigações calculadas,
  // não do recebível da adquirente nem da conta bancária da Disk.
  const events = await prisma.event.findMany({ where: { producerId: user.producerId! }, orderBy: { name: "asc" } });
  const items = await Promise.all(events.map(async e => eventAvailabilityDTO(e.id, e.name, await eventAvailability(prisma, e.id))));
  return NextResponse.json({ mode: "PRODUCER_INFORMATIONAL", items });
}

export const GET=withMonitoring("/api/saldos",GETHandler);
