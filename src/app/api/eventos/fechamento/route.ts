import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authorize, fail, isInternal } from "@/lib/auth";
import { withMonitoring } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import { buildEventClosingPosition, executeAuditedEventClosing } from "@/lib/event-closing";

export const runtime = "nodejs";

const closeSchema = z.object({
  eventId: z.string().min(1),
  notes: z.string().min(8).max(400),
  allowResidualBalanceWithJustification: z.boolean().optional()
}).strict();

export const GET = withMonitoring("/api/eventos/fechamento", async function GET(request: NextRequest) {
  const { user, error } = await authorize(request);
  if (error || !user) return error!;
  const eventId = request.nextUrl.searchParams.get("eventId");
  const internal = isInternal(user.role);

  if (eventId) {
    const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, producerId: true } });
    if (!ev) return fail("Evento não encontrado.", 404);
    if (!internal && ev.producerId !== user.producerId) return fail("Acesso negado ao evento.", 403);
    const report = await buildEventClosingPosition(prisma, eventId);
    return NextResponse.json(report);
  }

  const events = await prisma.event.findMany({
    where: internal ? {} : { producerId: user.producerId! },
    select: { id: true },
    orderBy: { name: "asc" }
  });
  const items = await Promise.all(events.map((e) => buildEventClosingPosition(prisma, e.id)));
  return NextResponse.json({ items });
});

export const POST = withMonitoring("/api/eventos/fechamento", async function POST(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]);
  if (error || !user) return error!;
  try {
    const input = closeSchema.parse(await request.json());
    const result = await prisma.$transaction(
      (tx) => executeAuditedEventClosing(tx, input, user),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
});
