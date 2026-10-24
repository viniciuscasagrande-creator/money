import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
async function GETHandler(request: NextRequest) {
  const { error } = await authorize(request, ["ADMIN"]); if (error) return error;
  const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100,
    include: { actor: { select: { name: true, email: true } } } });
  return NextResponse.json({ items: entries.map(e => ({ id: e.id, action: e.action, entity: e.entity, entityId: e.entityId,
    summary: e.summary, actor: e.actor.name, actorEmail: e.actor.email, createdAt: e.createdAt.toISOString() })) });
}

export const GET=withMonitoring("/api/auditoria",GETHandler);
