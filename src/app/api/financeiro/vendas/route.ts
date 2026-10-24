import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { withMonitoring } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { registerSale } from "@/lib/operations";
import { apiCatch } from "@/lib/validation";
export const runtime = "nodejs";
const schema = z.object({
  externalReference: z.string().trim().min(5).max(100),
  eventId: z.string().min(1),
  mdrRuleId: z.string().min(1),
  unitPriceCents: z.string().regex(/^\d{1,16}$/),
  quantity: z.number().int().min(1).max(10000),
  channel: z.enum(["ONLINE", "POS", "BILHETERIA"]).optional(),
  paymentMethod: z.enum(["PIX", "DEBIT", "CREDIT_SINGLE", "CREDIT_INSTALLMENT"]).optional(),
  installments: z.number().int().min(1).max(12).optional(),
  costBearer: z.enum(["PRODUCER", "SOUL", "BUYER"]).optional(),
  spreadBps: z.number().int().min(0).max(5000).optional(),
  advancedBps: z.number().int().min(0).max(5000).optional(),
  rebateBps: z.number().int().min(0).max(5000).optional(),
  installmentInterestBps: z.number().int().min(0).max(5000).optional()
}).strict();

export const GET = withMonitoring("/api/financeiro/vendas", async function GET(request: NextRequest) {
  const { error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error) return error;
  const items = await prisma.financialSale.findMany({
    include: {
      event: { select: { name: true } },
      producer: { select: { name: true } },
      gateway: { select: { name: true } },
      brand: { select: { name: true } }
    },
    take: 100,
    orderBy: { createdAt: "desc" }
  });
  const memoryKeys = items.map(s => `sale_memory:${s.id}`);
  const memories = memoryKeys.length > 0
    ? await prisma.financeSetting.findMany({ where: { key: { in: memoryKeys } } })
    : [];
  const memoryMap = new Map<string, Record<string, unknown>>();
  for (const m of memories) {
    try {
      memoryMap.set(m.key.replace(/^sale_memory:/, ""), JSON.parse(m.value));
    } catch {
      // ignora
    }
  }
  return NextResponse.json({
    items: items.map(s => ({
      id: s.id,
      reference: s.externalReference,
      eventName: s.event.name,
      producerName: s.producer.name,
      gatewayName: s.gateway.name,
      brandName: s.brand.name,
      status: s.status,
      quantity: s.quantity,
      grossCents: s.grossCents.toString(),
      feeModeAtSale: s.feeModeAtSale,
      feeValueAtSale: s.feeValueAtSale.toString(),
      producerPaysMdrAtSale: s.producerPaysMdrAtSale,
      mdrRateBpsAtSale: s.mdrRateBpsAtSale,
      mdrFixedCentsAtSale: s.mdrFixedCentsAtSale.toString(),
      feeCents: s.feeCents.toString(),
      mdrCents: s.mdrCents.toString(),
      producerNetCents: s.producerNetCents.toString(),
      diskNetCents: s.diskNetCents.toString(),
      netSettlementCents: s.netSettlementCents.toString(),
      createdAt: s.createdAt.toISOString(),
      receivableTitleId: s.receivableTitleId,
      calculationMemory: memoryMap.get(s.id) ?? null
    }))
  });
});

export const POST = withMonitoring("/api/financeiro/vendas", async function POST(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error || !user) return error!;
  try {
    const input = schema.parse(await request.json());
    const sale = await registerSale(input, user);
    return NextResponse.json({ id: sale.id, receivableTitleId: sale.receivableTitleId }, { status: 201 });
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
});
