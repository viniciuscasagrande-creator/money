import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import { nonnegativeCents, ruleError } from "@/lib/operations";
export const runtime = "nodejs";
const schema = z.object({ gatewayId: z.string().min(1), brandId: z.string().min(1), installments: z.number().int().min(1).max(48),
  rateBps: z.number().int().min(0).max(10000), fixedCents: z.string().regex(/^\d{1,16}$/) }).strict();
export async function POST(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error || !user) return error!;
  try {
    const input = schema.parse(await request.json());
    const fixedCents = nonnegativeCents(input.fixedCents);
    const rule = await prisma.$transaction(async tx => {
      const [g, b] = await Promise.all([tx.gateway.findUnique({ where: { id: input.gatewayId } }), tx.cardBrand.findUnique({ where: { id: input.brandId } })]);
      if (!g?.active || !b?.active) return ruleError("Adquirente ou bandeira indisponível.");
      const r = await tx.mdrRule.upsert({ where: { gatewayId_brandId_installments: {
        gatewayId: input.gatewayId, brandId: input.brandId, installments: input.installments } },
        update: { rateBps: input.rateBps, fixedCents, active: true }, create: { ...input, fixedCents } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "MDR_RULE_SAVED", entity: "MdrRule", entityId: r.id,
        summary: `Regra MDR alterada. ${input.rateBps} pontos-base; parcelamento ${input.installments}x. Vendas anteriores preservam valores calculados.` } });
      return r;
    });
    return NextResponse.json({ id: rule.id });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}
