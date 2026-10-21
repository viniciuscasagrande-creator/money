import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { ruleError } from "@/lib/split-calculation";

type Db = Prisma.TransactionClient;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(encoded: string): Buffer {
  const cleaned = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]!);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function computeTotpCode(secretBase32: string, timestampMs = Date.now(), stepSec = 30): string {
  const counter = Math.floor(timestampMs / 1000 / stepSec);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);
  const key = decodeBase32(secretBase32);
  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(secretBase32: string, code: string, timestampMs = Date.now(), windowSteps = 1): boolean {
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) return false;
  for (let w = -windowSteps; w <= windowSteps; w++) {
    const candidate = computeTotpCode(secretBase32, timestampMs + w * 30_000);
    const a = Buffer.from(candidate);
    const b = Buffer.from(cleanCode);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

const sha256 = (val: string) => createHash("sha256").update(val).digest("hex");

export type UserMfaRecord = {
  userId: string;
  enabled: boolean;
  secret: string;
  recoveryCodeHashes: string[];
  enrolledAt: string;
  verifiedAt: string | null;
  updatedAt: string;
};

export async function getUserMfaConfig(db: Db, userId: string): Promise<UserMfaRecord | null> {
  const row = await db.financeSetting.findUnique({ where: { key: `mfa_user:${userId}` } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as UserMfaRecord;
  } catch {
    return null;
  }
}

export async function enrollUserMfa(db: Db, userId: string, actorId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, active: true } });
  if (!user || !user.active) return ruleError("Usuário inválido ou inativo para MFA.");
  const secret = generateTotpSecret();
  const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(4).toString("hex").toUpperCase());
  const now = new Date().toISOString();
  const record: UserMfaRecord = {
    userId: user.id,
    enabled: false,
    secret,
    recoveryCodeHashes: recoveryCodes.map((c) => sha256(c)),
    enrolledAt: now,
    verifiedAt: null,
    updatedAt: now
  };
  await db.financeSetting.upsert({
    where: { key: `mfa_user:${user.id}` },
    create: { key: `mfa_user:${user.id}`, value: JSON.stringify(record), changedById: actorId },
    update: { value: JSON.stringify(record), changedById: actorId }
  });
  await db.auditLog.create({
    data: {
      actorId,
      action: "MFA_ENROLLED",
      entity: "User",
      entityId: user.id,
      summary: `Segredo TOTP e 8 códigos de recuperação gerados para ${user.email}. Aguardando confirmação para ativar.`
    }
  });
  const otpauthUri = `otpauth://totp/SOUL%20Financeiro:${encodeURIComponent(user.email)}?secret=${secret}&issuer=SOUL%20Financeiro&algorithm=SHA1&digits=6&period=30`;
  return {
    userId: user.id,
    email: user.email,
    enabled: false,
    secret,
    otpauthUri,
    recoveryCodes
  };
}

export async function activateUserMfa(db: Db, userId: string, totpCode: string, actorId: string) {
  const config = await getUserMfaConfig(db, userId);
  if (!config) return ruleError("Inicie o cadastramento MFA antes de ativar.");
  if (!verifyTotpCode(config.secret, totpCode)) {
    return ruleError("Código TOTP inválido. Verifique o horário do autenticador.");
  }
  const now = new Date().toISOString();
  const updated: UserMfaRecord = {
    ...config,
    enabled: true,
    verifiedAt: now,
    updatedAt: now
  };
  await db.financeSetting.update({
    where: { key: `mfa_user:${userId}` },
    data: { value: JSON.stringify(updated), changedById: actorId }
  });
  await db.auditLog.create({
    data: {
      actorId,
      action: "MFA_ACTIVATED",
      entity: "User",
      entityId: userId,
      summary: "Autenticação multifator (MFA TOTP) validada e ativada para o usuário."
    }
  });
  return { userId, enabled: true, verifiedAt: now };
}

export async function verifyUserMfaChallenge(db: Db, userId: string, code: string): Promise<{ valid: boolean; usedRecoveryCode: boolean }> {
  const config = await getUserMfaConfig(db, userId);
  if (!config || !config.enabled) return { valid: true, usedRecoveryCode: false };
  const clean = code.trim().toUpperCase();
  if (verifyTotpCode(config.secret, clean)) {
    return { valid: true, usedRecoveryCode: false };
  }
  const codeHash = sha256(clean);
  const idx = config.recoveryCodeHashes.indexOf(codeHash);
  if (idx >= 0) {
    const remaining = config.recoveryCodeHashes.filter((_, i) => i !== idx);
    const updated: UserMfaRecord = {
      ...config,
      recoveryCodeHashes: remaining,
      updatedAt: new Date().toISOString()
    };
    await db.financeSetting.update({
      where: { key: `mfa_user:${userId}` },
      data: { value: JSON.stringify(updated), changedById: userId }
    });
    await db.auditLog.create({
      data: {
        actorId: userId,
        action: "MFA_RECOVERY_CODE_USED",
        entity: "User",
        entityId: userId,
        summary: `Código de recuperação MFA utilizado. Restam ${remaining.length} códigos.`
      }
    });
    return { valid: true, usedRecoveryCode: true };
  }
  return { valid: false, usedRecoveryCode: false };
}

export async function disableUserMfa(db: Db, userId: string, actorId: string, reason: string) {
  const config = await getUserMfaConfig(db, userId);
  if (!config) return ruleError("MFA não está configurado para este usuário.");
  if (reason.trim().length < 5) return ruleError("Informe uma justificativa (mínimo 5 caracteres) para desativar o MFA.");
  await db.financeSetting.delete({ where: { key: `mfa_user:${userId}` } });
  await db.auditLog.create({
    data: {
      actorId,
      action: "MFA_DISABLED",
      entity: "User",
      entityId: userId,
      summary: `MFA desativado. Motivo: ${reason.trim()}`
    }
  });
  return { userId, enabled: false };
}

export type PasswordResetRecord = {
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  requestedById: string;
};

export async function issuePasswordResetToken(db: Db, email: string, actorId?: string) {
  const normalized = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalized } });
  if (!user || !user.active) {
    return ruleError("Usuário ativo não encontrado para recuperação de senha.");
  }
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = sha256(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const record: PasswordResetRecord = {
    userId: user.id,
    email: user.email,
    tokenHash,
    expiresAt,
    createdAt: now.toISOString(),
    requestedById: actorId ?? user.id
  };
  await db.financeSetting.upsert({
    where: { key: `pwd_reset:${tokenHash}` },
    create: { key: `pwd_reset:${tokenHash}`, value: JSON.stringify(record), changedById: actorId ?? user.id },
    update: { value: JSON.stringify(record), changedById: actorId ?? user.id }
  });
  await db.auditLog.create({
    data: {
      actorId: actorId ?? user.id,
      action: "PASSWORD_RESET_REQUESTED",
      entity: "User",
      entityId: user.id,
      summary: `Token temporário de recuperação de senha emitido para ${user.email} (expira em 30 minutos).`
    }
  });
  return {
    userId: user.id,
    email: user.email,
    resetToken: rawToken,
    expiresAt
  };
}

export async function completePasswordReset(db: Db, rawToken: string, newPassword: string) {
  if (newPassword.length < 12) {
    return ruleError("A nova senha deve possuir no mínimo 12 caracteres.");
  }
  const tokenHash = sha256(rawToken.trim());
  const row = await db.financeSetting.findUnique({ where: { key: `pwd_reset:${tokenHash}` } });
  if (!row) return ruleError("Token de recuperação inválido ou já utilizado.");
  let record: PasswordResetRecord;
  try {
    record = JSON.parse(row.value) as PasswordResetRecord;
  } catch {
    return ruleError("Registro de recuperação corrompido.");
  }
  if (new Date(record.expiresAt) <= new Date()) {
    await db.financeSetting.delete({ where: { key: `pwd_reset:${tokenHash}` } });
    return ruleError("Token de recuperação expirado. Solicite um novo token.");
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({
    where: { id: record.userId },
    data: { passwordHash }
  });
  await db.financeSetting.delete({ where: { key: `pwd_reset:${tokenHash}` } });
  const revoked = await db.session.deleteMany({ where: { userId: record.userId } });
  await db.auditLog.create({
    data: {
      actorId: record.userId,
      action: "PASSWORD_RESET_COMPLETED",
      entity: "User",
      entityId: record.userId,
      summary: `Senha redefinida com sucesso e ${revoked.count} sessão(ões) ativa(s) encerrada(s) preventivamente.`
    }
  });
  return { userId: record.userId, email: record.email, revokedSessionsCount: revoked.count };
}

export async function listActiveUserSessions(db: Db, actor: { id: string; role: string }, currentTokenHash?: string) {
  const now = new Date();
  const isAdmin = actor.role === "ADMIN";
  const sessions = await db.session.findMany({
    where: {
      expiresAt: { gt: now },
      ...(isAdmin ? {} : { userId: actor.id })
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, active: true } }
    },
    orderBy: { createdAt: "desc" }
  });
  return sessions.map((s) => ({
    id: s.id,
    userId: s.userId,
    userName: s.user.name,
    userEmail: s.user.email,
    userRole: s.user.role,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    isCurrent: currentTokenHash ? s.tokenHash === currentTokenHash : false
  }));
}

export async function revokeUserSessions(
  db: Db,
  actor: { id: string; role: string },
  input: {
    scope: "SINGLE_SESSION" | "OTHER_SESSIONS" | "ALL_USER_SESSIONS";
    sessionId?: string;
    targetUserId?: string;
    currentTokenHash?: string;
  }
) {
  const isAdmin = actor.role === "ADMIN";
  if (input.scope === "SINGLE_SESSION") {
    if (!input.sessionId) return ruleError("Informe o identificador da sessão a encerrar.");
    const session = await db.session.findUnique({ where: { id: input.sessionId } });
    if (!session) return ruleError("Sessão não encontrada.");
    if (!isAdmin && session.userId !== actor.id) return ruleError("Sem permissão para encerrar sessão de outro usuário.");
    await db.session.delete({ where: { id: session.id } });
    await db.auditLog.create({
      data: {
        actorId: actor.id,
        action: "SESSION_REVOKED",
        entity: "Session",
        entityId: session.id,
        summary: `Sessão individual encerrada para usuário ${session.userId}.`
      }
    });
    return { revokedCount: 1 };
  }

  if (input.scope === "OTHER_SESSIONS") {
    const res = await db.session.deleteMany({
      where: {
        userId: actor.id,
        ...(input.currentTokenHash ? { tokenHash: { not: input.currentTokenHash } } : {})
      }
    });
    await db.auditLog.create({
      data: {
        actorId: actor.id,
        action: "OTHER_SESSIONS_REVOKED",
        entity: "User",
        entityId: actor.id,
        summary: `${res.count} outra(s) sessão(ões) do próprio usuário encerrada(s).`
      }
    });
    return { revokedCount: res.count };
  }

  const targetUserId = input.targetUserId ?? actor.id;
  if (!isAdmin && targetUserId !== actor.id) {
    return ruleError("Somente administradores podem encerrar todas as sessões de outro usuário.");
  }
  const res = await db.session.deleteMany({ where: { userId: targetUserId } });
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      action: "ALL_USER_SESSIONS_REVOKED",
      entity: "User",
      entityId: targetUserId,
      summary: `Todas as ${res.count} sessão(ões) ativa(s) do usuário ${targetUserId} foram encerradas.`
    }
  });
  return { revokedCount: res.count };
}
