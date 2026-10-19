import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueSession, originAllowed, fail } from "@/lib/auth";
export const runtime = "nodejs";
const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
export async function POST(request: NextRequest) {
  try {
    if (!originAllowed(request)) return fail("Origem não autorizada.", 403);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Dados de login inválidos.");
    const email = parsed.data.email.trim().toLowerCase();
    const ip = (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 80);
    const key = createHash("sha256").update(email + ":" + ip).digest("hex");
    const attempt = await prisma.loginAttempt.findUnique({ where: { key } });
    const now = new Date();
    if (attempt?.lockedUntil && attempt.lockedUntil > now) return fail("Muitas tentativas. Tente novamente mais tarde.", 429);
    const user = await prisma.user.findUnique({ where: { email } });
    // Verificação de custo equivalente mesmo para e-mails inexistentes.
    const fallbackHash = "$2a$12$oaSmeSUjgJOVbgNiYiNdAe.s4zgrREoOVTSZ6AuTL28PnyO06G6dm";
    const validPassword = await bcrypt.compare(parsed.data.password, user?.passwordHash || fallbackHash);
    if (!user || !user.active || !validPassword) {
      const withinWindow = !!attempt && (Date.now() - attempt.lastAttemptAt.getTime() < 15 * 60 * 1000);
      const failedCount = (withinWindow ? attempt!.failedCount : 0) + 1;
      await prisma.loginAttempt.upsert({ where: { key }, create: { key, failedCount, lastAttemptAt: now, lockedUntil: failedCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null },
        update: { failedCount, lastAttemptAt: now, lockedUntil: failedCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null } });
      return fail("E-mail ou senha inválidos.", 401);
    }
    await prisma.loginAttempt.deleteMany({ where: { key } });
    if (user.role === "PRODUCER" && !user.producerId) return fail("Perfil sem produtor vinculado.", 403);
    await issueSession(user.id);
    return NextResponse.json({ ok: true, role: user.role, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error("Erro em /api/auth/login:", err);
    return fail("Serviço de banco de dados indisponível ou em atualização. Tente novamente em instantes.", 500);
  }
}
