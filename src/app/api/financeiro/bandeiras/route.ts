import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().min(2).max(80) }).strict();
async function POSTHandler(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error || !user) return error!;
  try {
    const { name } = schema.parse(await request.json());
    const b = await prisma.$transaction(async tx => {
      const brand = await tx.cardBrand.create({ data: { name } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "BRAND_CREATED", entity: "CardBrand", entityId: brand.id, summary: "Bandeira ou modalidade cadastrada." } });
      return brand;
    });
    return NextResponse.json({ id: b.id }, { status: 201 });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}

export const POST=withMonitoring("/api/financeiro/bandeiras",POSTHandler);
