import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const COOKIE_NAME = "disk_financeiro_session";
const AGE_SEC = 60 * 60 * 8;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function findCurrentUser() {
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  if (!cookie || !/^[a-f\d]{64}$/.test(cookie)) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(cookie) },
    include: { user: { select: { id: true, name: true, email: true, role: true, active: true, producerId: true } } }
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  return session.user;
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof findCurrentUser>>>;
export const isInternal = (role: Role) => role === "ADMIN" || role === "FINANCE_DISK";

export async function issueSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + AGE_SEC * 1000) } });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: AGE_SEC
  });
}

export async function endSession() {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME)?.value;
  if (cookie) await prisma.session.deleteMany({ where: { tokenHash: hashToken(cookie) } });
  jar.delete(COOKIE_NAME);
}

/** Origem é validada para mutações feitas a partir de navegadores. */
export function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // clientes CLI não enviam Origin; autenticados por cookie
  try { return new URL(origin).host === request.nextUrl.host && new URL(origin).protocol === request.nextUrl.protocol; }
  catch { return false; }
}

export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function authorize(request: NextRequest, roles?: Role[]) {
  if (request.method !== "GET" && !originAllowed(request)) return { error: fail("Origem não autorizada.", 403), user: null };
  const user = await findCurrentUser();
  if (!user) return { error: fail("Faça login para continuar.", 401), user: null };
  if (roles && !roles.includes(user.role)) return { error: fail("Acesso negado.", 403), user: null };
  if (user.role === "PRODUCER" && !user.producerId) return { error: fail("Usuário sem produtor vinculado.", 403), user: null };
  return { error: null, user };
}
