import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().min(2).max(100) }).strict();
async function POSTHandler(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error || !user) return error!;
  try {
    const { name } = schema.parse(await request.json());
    const g = await prisma.$transaction(async tx => {
      const gateway = await tx.gateway.create({ data: { name } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "GATEWAY_CREATED", entity: "Gateway", entityId: gateway.id, summary: "Adquirente/gateway cadastrado." } });
      return gateway;
    });
    return NextResponse.json({ id: g.id }, { status: 201 });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}

export const POST=withMonitoring("/api/financeiro/gateways",POSTHandler);
