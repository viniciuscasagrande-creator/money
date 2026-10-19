import { NextRequest, NextResponse } from "next/server";
import { authorize, fail } from "@/lib/auth";
import { apiCatch, eventInput } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const { user, error } = await authorize(request); if (error || !user) return error!;
  const events = await prisma.event.findMany({ where: user.role === "PRODUCER" ? { producerId: user.producerId! } : {},
    include: { producer: { select: { name: true } } }, orderBy: { name: "asc" } });
  return NextResponse.json({ items: events.map(e => ({ id: e.id, name: e.name, status: e.status, producerId: e.producerId, producerName: e.producer.name })) });
}
export async function POST(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN"]); if (error || !user) return error!;
  try { const input = eventInput.parse(await request.json());
    const producer = await prisma.producer.findUnique({ where: { id: input.producerId } });
    if (!producer || !producer.active) return fail("Produtor inexistente ou inativo.");
    const event = await prisma.$transaction(async tx => {
      const e = await tx.event.create({ data: input });
      await tx.auditLog.create({ data: { actorId: user.id, action: "EVENT_CREATED", entity: "Event", entityId: e.id, summary: `Evento ${e.name} cadastrado.` } });
      return e;
    });
    return NextResponse.json({ id: event.id }, { status: 201 });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}
