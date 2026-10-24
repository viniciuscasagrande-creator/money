import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { withMonitoring } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import {
  activateUserMfa,
  disableUserMfa,
  enrollUserMfa,
  getUserMfaConfig,
  verifyUserMfaChallenge
} from "@/lib/security-mfa";

export const runtime = "nodejs";

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ENROLL"), targetUserId: z.string().min(1).optional() }).strict(),
  z.object({ action: z.literal("ACTIVATE"), totpCode: z.string().regex(/^\d{6}$/), targetUserId: z.string().min(1).optional() }).strict(),
  z.object({ action: z.literal("VERIFY"), code: z.string().min(6).max(16) }).strict(),
  z.object({ action: z.literal("DISABLE"), reason: z.string().min(5).max(200), targetUserId: z.string().min(1).optional(), code: z.string().min(6).max(16).optional() }).strict()
]);

export const GET = withMonitoring("/api/auth/mfa", async function GET(request: NextRequest) {
  const { user, error } = await authorize(request);
  if (error || !user) return error!;
  const myMfa = await getUserMfaConfig(prisma, user.id);
  let internalUsersMfa: Array<{ id: string; name: string; email: string; role: string; mfaEnabled: boolean; verifiedAt: string | null }> = [];
  if (user.role === "ADMIN") {
    const internals = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "FINANCE_DISK"] }, active: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" }
    });
    internalUsersMfa = await Promise.all(
      internals.map(async (u) => {
        const cfg = await getUserMfaConfig(prisma, u.id);
        return {
          ...u,
          mfaEnabled: Boolean(cfg?.enabled),
          verifiedAt: cfg?.verifiedAt ?? null
        };
      })
    );
  }
  return NextResponse.json({
    userId: user.id,
    role: user.role,
    enabled: Boolean(myMfa?.enabled),
    enrolledAt: myMfa?.enrolledAt ?? null,
    verifiedAt: myMfa?.verifiedAt ?? null,
    remainingRecoveryCodes: myMfa?.recoveryCodeHashes.length ?? 0,
    ...(user.role === "ADMIN" ? { internalUsersMfa } : {})
  });
});

export const POST = withMonitoring("/api/auth/mfa", async function POST(request: NextRequest) {
  const { user, error } = await authorize(request);
  if (error || !user) return error!;
  try {
    const input = postSchema.parse(await request.json());
    if (input.action === "VERIFY") {
      const check = await verifyUserMfaChallenge(prisma, user.id, input.code);
      if (!check.valid) return fail("Código MFA inválido.", 401);
      return NextResponse.json({ ok: true, usedRecoveryCode: check.usedRecoveryCode });
    }

    const targetId = input.targetUserId ?? user.id;
    if (targetId !== user.id && user.role !== "ADMIN") {
      return fail("Somente administradores podem gerenciar o MFA de outros usuários.", 403);
    }

    if (input.action === "ENROLL") {
      const enrolled = await prisma.$transaction((tx) => enrollUserMfa(tx, targetId, user.id));
      return NextResponse.json(enrolled, { status: 201 });
    }

    if (input.action === "ACTIVATE") {
      const activated = await prisma.$transaction((tx) => activateUserMfa(tx, targetId, input.totpCode, user.id));
      return NextResponse.json(activated);
    }

    if (targetId === user.id && user.role !== "ADMIN") {
      if (!input.code) return fail("Informe o código MFA atual para desativar.", 400);
      const check = await verifyUserMfaChallenge(prisma, user.id, input.code);
      if (!check.valid) return fail("Código MFA inválido.", 401);
    }
    const disabled = await prisma.$transaction((tx) => disableUserMfa(tx, targetId, user.id, input.reason));
    return NextResponse.json(disabled);
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
});
