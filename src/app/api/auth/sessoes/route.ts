import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { withMonitoring } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import { listActiveUserSessions, revokeUserSessions } from "@/lib/security-mfa";

export const runtime = "nodejs";

const revokeSchema = z.object({
  scope: z.enum(["SINGLE_SESSION", "OTHER_SESSIONS", "ALL_USER_SESSIONS"]),
  sessionId: z.string().min(1).optional(),
  targetUserId: z.string().min(1).optional()
}).strict();

async function getCurrentTokenHash(): Promise<string | undefined> {
  const cookie = (await cookies()).get("disk_financeiro_session")?.value;
  if (!cookie) return undefined;
  return createHash("sha256").update(cookie).digest("hex");
}

export const GET = withMonitoring("/api/auth/sessoes", async function GET(request: NextRequest) {
  const { user, error } = await authorize(request);
  if (error || !user) return error!;
  const currentHash = await getCurrentTokenHash();
  const sessions = await listActiveUserSessions(prisma, user, currentHash);
  return NextResponse.json({ items: sessions, count: sessions.length });
});

export const POST = withMonitoring("/api/auth/sessoes", async function POST(request: NextRequest) {
  const { user, error } = await authorize(request);
  if (error || !user) return error!;
  try {
    const input = revokeSchema.parse(await request.json());
    const currentHash = await getCurrentTokenHash();
    const res = await prisma.$transaction((tx) =>
      revokeUserSessions(tx, user, { ...input, currentTokenHash: currentHash })
    );
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
});
