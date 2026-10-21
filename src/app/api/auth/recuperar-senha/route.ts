import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail, originAllowed } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import { completePasswordReset, issuePasswordResetToken } from "@/lib/security-mfa";

export const runtime = "nodejs";

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("REQUEST"), email: z.string().email() }).strict(),
  z.object({ action: z.literal("RESET"), token: z.string().min(16).max(128), newPassword: z.string().min(12).max(128) }).strict()
]);

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return fail("Origem não autorizada.", 403);
  try {
    const input = postSchema.parse(await request.json());
    if (input.action === "REQUEST") {
      // Exige operador autenticado (ADMIN) para emissão direta do token ou registra solicitação auditada
      const { user, error } = await authorize(request, ["ADMIN"]);
      if (error || !user) return error!;
      const issued = await prisma.$transaction((tx) => issuePasswordResetToken(tx, input.email, user.id));
      return NextResponse.json({ ok: true, ...issued }, { status: 201 });
    }

    const result = await prisma.$transaction((tx) => completePasswordReset(tx, input.token, input.newPassword));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
}
