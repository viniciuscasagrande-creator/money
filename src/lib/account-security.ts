import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export const sessionTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export class SecurityError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const windowMs = 15 * 60 * 1000;

/** The password comparison and session creation must agree on the same credential. */
export async function createVerifiedSession(db: PrismaClient, userId: string, passwordHash: string, tokenHash: string, expiresAt: Date) {
  await db.$transaction(async tx => {
    const updated = await tx.user.updateMany({where:{id:userId,active:true,passwordHash},data:{passwordHash}});
    if (updated.count !== 1) throw new SecurityError("Credencial alterada. Faça login novamente.", 409);
    await tx.session.create({data:{userId,tokenHash,expiresAt}});
  });
}

export async function changeAccountSecurity(db: PrismaClient, input: {
  userId: string; tokenHash: string; currentPassword: string;
  action: "CHANGE_PASSWORD" | "REVOKE_OTHERS"; newPassword?: string;
}) {
  const now = new Date(), key = sessionTokenHash(`account-security:${input.userId}`);
  const attempt = await db.loginAttempt.findUnique({where:{key}});
  if (attempt?.lockedUntil && attempt.lockedUntil > now) throw new SecurityError("Muitas tentativas. Aguarde 15 minutos.", 429);
  const user = await db.user.findUnique({where:{id:input.userId}});
  if (!user?.active) throw new SecurityError("Faça login novamente.", 401);
  if (!await bcrypt.compare(input.currentPassword, user.passwordHash)) {
    await db.$transaction(async tx => {
      await tx.loginAttempt.updateMany({where:{key,lastAttemptAt:{lt:new Date(now.getTime()-windowMs)}},data:{failedCount:0,lockedUntil:null}});
      const failed = await tx.loginAttempt.upsert({where:{key},create:{key,failedCount:1,lastAttemptAt:now},update:{failedCount:{increment:1},lastAttemptAt:now}});
      if (failed.failedCount >= 5) await tx.loginAttempt.update({where:{key},data:{lockedUntil:new Date(now.getTime()+windowMs)}});
    });
    throw new SecurityError("Senha atual inválida.", 401);
  }
  let nextHash = user.passwordHash;
  if (input.action === "CHANGE_PASSWORD") {
    const next = input.newPassword ?? "";
    if (next.length < 12 || Buffer.byteLength(next,"utf8") > 72) throw new SecurityError("A nova senha deve ter ao menos 12 caracteres e no máximo 72 bytes.", 400);
    if (await bcrypt.compare(next,user.passwordHash)) throw new SecurityError("Use uma senha diferente da atual.", 400);
    nextHash = await bcrypt.hash(next,12);
  }
  return db.$transaction(async tx => {
    // Lock the user before checking the session, also serializing concurrent credential changes.
    const updated = await tx.user.updateMany({where:{id:user.id,active:true,passwordHash:user.passwordHash},data:{passwordHash:nextHash}});
    if (updated.count !== 1) throw new SecurityError("Credencial alterada. Faça login novamente.", 409);
    const current = await tx.session.findUnique({where:{tokenHash:input.tokenHash}});
    if (!current || current.userId !== user.id || current.expiresAt <= new Date()) throw new SecurityError("Faça login novamente.", 401);
    const revoked = await tx.session.deleteMany({where:{userId:user.id,...(input.action === "REVOKE_OTHERS" ? {id:{not:current.id}} : {})}});
    await tx.loginAttempt.deleteMany({where:{key}});
    await tx.auditLog.create({data:{actorId:user.id,action:input.action === "CHANGE_PASSWORD" ? "PASSWORD_CHANGED" : "OTHER_SESSIONS_REVOKED",entity:"User",entityId:user.id,summary:`Segurança da conta atualizada; ${revoked.count} sessões encerradas.`}});
    return {revoked:revoked.count,requiresLogin:input.action === "CHANGE_PASSWORD"};
  });
}
