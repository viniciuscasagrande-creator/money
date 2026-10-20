import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, "backups");

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function serializeBigInt(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => (typeof val === "bigint" ? val.toString() : val))
  );
}

async function exportDatabaseDump() {
  const models = [
    "user",
    "session",
    "producer",
    "event",
    "bankAccount",
    "financialTitle",
    "ledgerEntry",
    "auditLog",
    "loginAttempt",
    "gateway",
    "cardBrand",
    "mdrRule",
    "eventFeePolicy",
    "financialSale",
    "payoutRequest",
    "bankStatementLine",
    "riskCase",
    "budgetLine",
    "financialContract",
    "userPermissionOverride",
    "approvalAuthority",
    "financeSetting",
    "alertAcknowledgement",
    "accountingAccount",
    "accountingPeriod",
    "accountingRule",
    "accountingBusinessEvent",
    "accountingJournal",
    "accountingPosting",
    "eventReserve",
    "eventTransfer",
    "producerTransferPermission",
    "eventReleasePolicy",
    "eventReleaseTier"
  ] as const;

  const tables: Record<string, { count: number; rows: unknown[] }> = {};
  let totalRows = 0;

  for (const modelName of models) {
    const delegate = (prisma as unknown as Record<string, unknown>)[modelName] as
      | { findMany?: () => Promise<unknown[]> }
      | undefined;
    if (delegate && typeof delegate.findMany === "function") {
      const rows = await delegate.findMany();
      const serialized = serializeBigInt(rows) as unknown[];
      tables[modelName] = {
        count: serialized.length,
        rows: serialized
      };
      totalRows += serialized.length;
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    version: "SOUL-v5.2",
    modelCount: Object.keys(tables).length,
    totalRows,
    tables
  };
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")
    .replace("T", "-");

  console.log("1/4 Exportando snapshot completo do banco de dados (32 modelos Prisma)...");
  let dbDump: Awaited<ReturnType<typeof exportDatabaseDump>> | { error: string; exportedAt: string };
  try {
    dbDump = await exportDatabaseDump();
  } catch (err) {
    dbDump = {
      exportedAt: now.toISOString(),
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }

  const dbDumpPath = path.join(BACKUP_DIR, "db-dump-soul-v5.2-completo.json");
  fs.writeFileSync(dbDumpPath, JSON.stringify(dbDump, null, 2), "utf8");

  console.log("2/4 Gerando Git Bundle completo (histórico, branches e tags)...");
  const bundlePath = path.join(BACKUP_DIR, "money-repo-soul-v5.2.bundle");
  execSync(`git bundle create "${bundlePath}" --all`, { cwd: ROOT, stdio: "inherit" });

  const headCommit = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim();

  console.log("3/4 Gerando manifesto de integridade (SHA-256)...");
  const manifest = {
    system: "SOUL Financeiro ERP",
    version: "5.2.0",
    createdAt: now.toISOString(),
    git: {
      commit: headCommit,
      branch: currentBranch,
      bundleFile: path.basename(bundlePath),
      bundleSha256: sha256File(bundlePath)
    },
    database: {
      dumpFile: path.basename(dbDumpPath),
      dumpSha256: sha256File(dbDumpPath),
      modelCount: "modelCount" in dbDump ? dbDump.modelCount : 0,
      totalRows: "totalRows" in dbDump ? dbDump.totalRows : 0
    }
  };

  const manifestPath = path.join(BACKUP_DIR, "manifesto-backup-soul-v5.2.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("4/4 Empacotando código-fonte, schemas, testes, bundle Git e dump do banco em ZIP...");
  const stagingDir = path.join(BACKUP_DIR, "_staging_backup");
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const itemsToInclude = [
    "src",
    "prisma",
    "scripts",
    "tests",
    "public",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.ts",
    "tailwind.config.ts",
    "postcss.config.mjs",
    "README.md",
    "RELATORIO_AUDITORIA_E_CORRECAO.md"
  ];

  for (const item of itemsToInclude) {
    const srcPath = path.join(ROOT, item);
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(stagingDir, item);
      fs.cpSync(srcPath, destPath, { recursive: true });
    }
  }

  fs.cpSync(dbDumpPath, path.join(stagingDir, path.basename(dbDumpPath)));
  fs.cpSync(bundlePath, path.join(stagingDir, path.basename(bundlePath)));
  fs.cpSync(manifestPath, path.join(stagingDir, path.basename(manifestPath)));

  const latestZipPath = path.join(BACKUP_DIR, "money-backup-v5.2-geral-completo.zip");
  const timestampedZipPath = path.join(BACKUP_DIR, `money-backup-v5.2-${stamp}.zip`);

  if (fs.existsSync(latestZipPath)) fs.rmSync(latestZipPath, { force: true });
  if (fs.existsSync(timestampedZipPath)) fs.rmSync(timestampedZipPath, { force: true });

  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${latestZipPath}' -Force"`,
    { cwd: ROOT, stdio: "inherit" }
  );
  fs.cpSync(latestZipPath, timestampedZipPath);
  fs.rmSync(stagingDir, { recursive: true, force: true });

  const zipSha256 = sha256File(latestZipPath);
  const zipSizeBytes = fs.statSync(latestZipPath).size;

  const finalSummary = {
    status: "OK",
    createdAt: now.toISOString(),
    commit: headCommit,
    files: {
      latestZip: latestZipPath,
      timestampedZip: timestampedZipPath,
      gitBundle: bundlePath,
      dbDump: dbDumpPath,
      manifest: manifestPath
    },
    zipSizeBytes,
    zipSha256,
    databaseSummary: {
      modelCount: "modelCount" in dbDump ? dbDump.modelCount : 0,
      totalRows: "totalRows" in dbDump ? dbDump.totalRows : 0
    }
  };

  console.log(JSON.stringify(finalSummary, null, 2));
}

main().catch(err => {
  console.error("Erro ao gerar backup geral:", err);
  process.exit(1);
});
