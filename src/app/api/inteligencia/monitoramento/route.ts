import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { withMonitoring } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import { checkOperationalHealth, recordIntegrationIncident } from "@/lib/operational-monitoring";

export const runtime = "nodejs";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("RECORD_INCIDENT"),
    provider: z.string().min(2).max(60),
    externalReference: z.string().max(150).nullable().optional(),
    reason: z.string().min(5).max(300)
  }).strict(),
  z.object({
    action: z.literal("RESOLVE_INCIDENT"),
    incidentId: z.string().min(5).max(100)
  }).strict()
]);

export const GET = withMonitoring("/api/inteligencia/monitoramento", async function GET(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]);
  if (error || !user) return error!;
  const report = await checkOperationalHealth(prisma);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withMonitoring("/api/inteligencia/monitoramento", async function POST(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]);
  if (error || !user) return error!;
  try {
    const input = postSchema.parse(await request.json());
    if (input.action === "RECORD_INCIDENT") {
      const incident = await prisma.$transaction((tx) =>
        recordIntegrationIncident(tx, {
          provider: input.provider,
          externalReference: input.externalReference,
          reason: input.reason,
          actorId: user.id
        })
      );
      return NextResponse.json(incident, { status: 201 });
    }

    const key = `incident_integration:${input.incidentId}`;
    const existing = await prisma.financeSetting.findUnique({ where: { key } });
    if (!existing) return fail("Incidente não encontrado.", 404);
    const parsed = JSON.parse(existing.value);
    const updated = { ...parsed, resolved: true, resolvedAt: new Date().toISOString(), resolvedById: user.id };
    await prisma.$transaction([
      prisma.financeSetting.update({ where: { key }, data: { value: JSON.stringify(updated), changedById: user.id } }),
      prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "INTEGRATION_INCIDENT_RESOLVED",
          entity: "FinanceSetting",
          entityId: key,
          summary: `Incidente de integração ${input.incidentId} marcado como resolvido.`
        }
      })
    ]);
    return NextResponse.json({ ok: true, incident: updated });
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
});
