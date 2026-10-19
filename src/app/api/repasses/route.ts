import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail, isInternal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPayout, eventAvailability, eventAvailabilityDTO, payoutDTO } from "@/lib/operations";
import { apiCatch } from "@/lib/validation";
export const runtime = "nodejs";
const schema = z.object({ eventId: z.string().min(1), type: z.enum(["REPASSE", "ANTECIPACAO"]),
  amountCents: z.string().regex(/^\d{1,16}$/) }).strict();
export async function GET(request: NextRequest) {
  const { user, error } = await authorize(request); if (error || !user) return error!;
  const internal = isInternal(user.role);
  const [payouts, events] = await Promise.all([
    prisma.payoutRequest.findMany({ where: internal ? {} : { producerId: user.producerId! },
      include: { producer: { select: { name: true } }, event: { select: { name: true } } }, take: 100, orderBy: { createdAt: "desc" } }),
    prisma.event.findMany({ where: internal ? {} : { producerId: user.producerId! },
      orderBy: { name: "asc" }, select: { id: true, name: true, producerId: true, producer: { select: { name: true } } } })
  ]);
  const balances = await Promise.all(events.map(async e => ({ ...eventAvailabilityDTO(e.id, e.name, await eventAvailability(prisma, e.id)), producerId: e.producerId, producerName: e.producer.name })));
  return NextResponse.json({ items: payouts.map(p => payoutDTO(p, internal)), events: balances, role: user.role });
}
export async function POST(request: NextRequest) {
  const { user, error } = await authorize(request); if (error || !user) return error!;
  try { const input = schema.parse(await request.json()); const payout = await createPayout(input, user);
    return NextResponse.json({ id: payout.id }, { status: 201 });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}
