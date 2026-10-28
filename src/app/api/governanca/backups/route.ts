import { NextRequest, NextResponse } from "next/server";
import { authorize, fail } from "@/lib/auth";
import { withMonitoring } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import {
  runAndRecordBackupVerification,
  identifyDatabaseEnvironment,
  type BackupVerificationCertificate
} from "@/lib/backup-data";
import {
  authorizeAndAuditBackupOperation,
  backupKeyRing,
  compareBackupFiles,
  previewBackupRecovery
} from "@/lib/operational-backup";
import { inspectBackupOperationsHealth } from "@/lib/operational-monitor";

export const runtime = "nodejs";

export const GET = withMonitoring("/api/governanca/backups", async function GET(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN"]);
  if (error || !user) return error!;
  const latest = await prisma.financeSetting.findUnique({ where: { key: "backup_verification:latest" } });
  let certificate: BackupVerificationCertificate | null = null;
  if (latest) {
    try {
      certificate = JSON.parse(latest.value) as BackupVerificationCertificate;
    } catch {
      certificate = null;
    }
  }
  const operationalHealth = inspectBackupOperationsHealth();
  const environment = identifyDatabaseEnvironment();
  return NextResponse.json({
    hasVerifiedBackup: Boolean(certificate?.valid),
    latestCertificate: certificate,
    signingConfigured: Boolean(process.env.BACKUP_SIGNING_KEY?.trim()),
    environment,
    operationalHealth
  });
});

export const POST = withMonitoring("/api/governanca/backups", async function POST(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN"]);
  if (error || !user) return error!;
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? "VERIFY");

    if (action === "PREVIEW_RESTORE") {
      const file = String(body?.file ?? "");
      const preview = await authorizeAndAuditBackupOperation(
        prisma,
        user.id,
        "BACKUP_RESTORE_PREVIEWED",
        file || "preview",
        `Prévia de restauração assistida solicitada para ${file}`,
        async () => previewBackupRecovery(file, backupKeyRing())
      );
      return NextResponse.json({ ok: true, preview });
    }

    if (action === "DIFF_BACKUPS") {
      const olderFile = String(body?.olderFile ?? "");
      const newerFile = String(body?.newerFile ?? "");
      const diff = await authorizeAndAuditBackupOperation(
        prisma,
        user.id,
        "BACKUP_DIFF_INSPECTED",
        `${olderFile}..${newerFile}`,
        `Comparação entre backups executada`,
        async () => compareBackupFiles(olderFile, newerFile, backupKeyRing())
      );
      return NextResponse.json({ ok: true, diff });
    }

    const includeFullDump = Boolean(body?.includeFullDump);
    const { certificate, envelope } = await runAndRecordBackupVerification(prisma, user.id);
    return NextResponse.json({
      ok: true,
      certificate,
      ...(includeFullDump ? { envelope } : {})
    }, { status: 201 });
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
});
