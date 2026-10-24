import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authorize, fail } from "@/lib/auth";
import { apiCatch, userInput } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
async function GETHandler(request: NextRequest) {
  const { error } = await authorize(request, ["ADMIN"]); if (error) return error;
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, producer: { select: { name: true } } }, orderBy: { name: "asc" } });
  return NextResponse.json({ items: users });
}
async function POSTHandler(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN"]); if (error || !user) return error!;
  try {
    const input = userInput.parse(await request.json());
    const producerId = input.role === "PRODUCER" ? input.producerId : null;
    if (producerId) {
      const producer = await prisma.producer.findUnique({ where: { id: producerId } });
      if (!producer || !producer.active) return fail("Produtor inexistente ou inativo.");
    }
    const email = input.email.toLowerCase();
    const found = await prisma.user.findUnique({ where: { email } });
    if (found) return fail("Já existe um usuário com esse e-mail.", 409);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const created = await prisma.$transaction(async tx => {
      const u = await tx.user.create({ data: { name: input.name, email, passwordHash, role: input.role, producerId } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "USER_CREATED", entity: "User", entityId: u.id, summary: `Usuário cadastrado com perfil ${u.role}.` } });
      return u;
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}

export const GET=withMonitoring("/api/admin/usuarios",GETHandler);
export const POST=withMonitoring("/api/admin/usuarios",POSTHandler);
