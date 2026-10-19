import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registerSale } from "@/lib/operations";
import { apiCatch } from "@/lib/validation";
export const runtime = "nodejs";
const schema = z.object({ externalReference: z.string().trim().min(5).max(100), eventId: z.string().min(1),
  mdrRuleId: z.string().min(1), unitPriceCents: z.string().regex(/^\d{1,16}$/), quantity: z.number().int().min(1).max(10000) }).strict();
export async function GET(request: NextRequest) {
  const { error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error) return error;
  const items = await prisma.financialSale.findMany({ include: { event: { select: { name: true } }, producer: { select: { name: true } },
    gateway: { select: { name: true } }, brand: { select: { name: true } } }, take: 100, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ items: items.map(s => ({ id: s.id, reference: s.externalReference, eventName: s.event.name,
    producerName: s.producer.name, gatewayName: s.gateway.name, brandName: s.brand.name, status: s.status, quantity: s.quantity,
    grossCents: s.grossCents.toString(), feeModeAtSale: s.feeModeAtSale, feeValueAtSale: s.feeValueAtSale.toString(),
    producerPaysMdrAtSale: s.producerPaysMdrAtSale, mdrRateBpsAtSale: s.mdrRateBpsAtSale, mdrFixedCentsAtSale: s.mdrFixedCentsAtSale.toString(), feeCents: s.feeCents.toString(), mdrCents: s.mdrCents.toString(),
    producerNetCents: s.producerNetCents.toString(), diskNetCents: s.diskNetCents.toString(),
    netSettlementCents: s.netSettlementCents.toString(), createdAt: s.createdAt.toISOString(), receivableTitleId: s.receivableTitleId })) });
}
export async function POST(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error || !user) return error!;
  try { const input = schema.parse(await request.json()); const sale = await registerSale(input, user);
    return NextResponse.json({ id: sale.id, receivableTitleId: sale.receivableTitleId }, { status: 201 });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}
