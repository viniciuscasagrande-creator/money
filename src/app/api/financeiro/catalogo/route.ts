import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const { error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error) return error;
  const [gateways, brands, mdrRules, fees, events] = await Promise.all([
    prisma.gateway.findMany({ orderBy: { name: "asc" } }),
    prisma.cardBrand.findMany({ orderBy: { name: "asc" } }),
    prisma.mdrRule.findMany({ include: { gateway: { select: { name: true } }, brand: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.eventFeePolicy.findMany({ include: { event: { select: { name: true, producer: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } }),
    prisma.event.findMany({ include: { producer: { select: { name: true } } }, orderBy: { name: "asc" } })
  ]);
  return NextResponse.json({ gateways, brands, rules: mdrRules.map(m => ({ id: m.id, gatewayId: m.gatewayId, gatewayName: m.gateway.name,
    brandId: m.brandId, brandName: m.brand.name, installments: m.installments, rateBps: m.rateBps, fixedCents: m.fixedCents.toString(), active: m.active })),
    fees: fees.map(f => ({ id: f.id, eventId: f.eventId, eventName: f.event.name, producerName: f.event.producer.name,
      mode: f.mode, value: f.value.toString(), producerPaysMdr: f.producerPaysMdr, active: f.active })),
    events: events.map(e => ({ id: e.id, name: e.name, producerName: e.producer.name, producerId: e.producerId, status: e.status })) });
}
