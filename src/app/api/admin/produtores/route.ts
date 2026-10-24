import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { authorize, fail } from "@/lib/auth";
import { apiCatch, producerInput } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
async function GETHandler(request: NextRequest) {
  const { error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error) return error;
  const producers = await prisma.producer.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ items: producers.map(p => ({ id: p.id, name: p.name, document: p.document, active: p.active })) });
}
async function POSTHandler(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN"]); if (error || !user) return error!;
  try { const input = producerInput.parse(await request.json());
    const producer = await prisma.$transaction(async tx => {
      const p = await tx.producer.create({ data: input });
      await tx.auditLog.create({ data: { actorId: user.id, action: "PRODUCER_CREATED", entity: "Producer", entityId: p.id, summary: `Produtor ${p.name} cadastrado.` } });
      return p;
    });
    return NextResponse.json({ id: producer.id }, { status: 201 });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}

export const GET=withMonitoring("/api/admin/produtores",GETHandler);
export const POST=withMonitoring("/api/admin/produtores",POSTHandler);
