import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, "backups");

const ORDERED_MODELS = [
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

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function serializeRows(modelName: string, rows: unknown[]): unknown[] {
  const serialized = JSON.parse(
    JSON.stringify(rows, (_key, val) => (typeof val === "bigint" ? val.toString() : val))
  ) as Record<string, unknown>[];
  if (modelName === "session") {
    return serialized.map(r => ({ ...r, tokenHash: "[REDACTED_SESSION_TOKEN]" }));
  }
  return serialized;
}

async function exportDatabaseDump() {
  const delegates = ORDERED_MODELS.map(modelName => {
    const delegate = (prisma as unknown as Record<string, unknown>)[modelName] as
      | { findMany?: () => unknown }
      | undefined;
    if (!delegate || typeof delegate.findMany !== "function") {
      throw new Error(`Delegate Prisma ausente ou inválido para o modelo: ${modelName}`);
    }
    return { modelName, findMany: delegate.findMany.bind(delegate) };
  });

  // Snapshot consistente em transação única
  const results = await prisma.$transaction(
    delegates.map(d => d.findMany() as ReturnType<typeof prisma.user.findMany>)
  );

  const tables: Record<string, { count: number; rows: unknown[] }> = {};
  let totalRows = 0;

  for (let i = 0; i < delegates.length; i++) {
    const { modelName } = delegates[i];
    const serialized = serializeRows(modelName, results[i] as unknown[]);
    tables[modelName] = {
      count: serialized.length,
      rows: serialized
    };
    totalRows += serialized.length;
  }

  return {
    exportedAt: new Date().toISOString(),
    version: "SOUL-v5.3.0",
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

  console.log("1/4 Exportando snapshot transacional consistente do banco (34 modelos Prisma)...");
  let dbDump: Awaited<ReturnType<typeof exportDatabaseDump>>;
  try {
    dbDump = await exportDatabaseDump();
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }

  const dbDumpPath = path.join(BACKUP_DIR, "db-dump-soul-v5.2-completo.json");
  fs.writeFileSync(dbDumpPath, JSON.stringify(dbDump, null, 2), "utf8");

  console.log("2/4 Gerando Git Bundle completo (histórico, branches e tags)...");
  const bundlePath = path.join(BACKUP_DIR, "money-repo-soul-v5.2.bundle");
  execSync(`git bundle create "${bundlePath}" --all`, { cwd: ROOT, stdio: "inherit" });
  execSync(`git bundle verify "${bundlePath}"`, { cwd: ROOT, stdio: "inherit" });

  const headCommit = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim();

  console.log("3/4 Gerando manifesto de integridade (SHA-256)...");
  const manifest = {
    system: "SOUL Financeiro ERP",
    version: "5.3.0",
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
      modelCount: dbDump.modelCount,
      totalRows: dbDump.totalRows,
      sessionTokensRedacted: true
    }
  };

  const manifestPath = path.join(BACKUP_DIR, "manifesto-backup-soul-v5.2.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("4/4 Empacotando árvore completa de código-fonte, configs, bundle Git e dump do banco em ZIP...");
  const stagingDir = path.join(BACKUP_DIR, "_staging_backup");
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const itemsToInclude = [
    "src",
    "prisma",
    "scripts",
    "tests",
    "public",
    "homologacao",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.ts",
    "tailwind.config.ts",
    "postcss.config.js",
    "postcss.config.mjs",
    "components.json",
    "vercel.json",
    ".env.example",
    ".gitignore",
    "README.md",
    "RELATORIO_AUDITORIA_E_CORRECAO.md",
    "SOUL_V5_2_IMPLEMENTACAO.md",
    "SOUL_V5_3_IMPLEMENTACAO.md"
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
  const timestampedZipPath = path.join(BACKUP_DIR, `money-backup-v5.3-${stamp}.zip`);

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
    version: "5.3.0",
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
      modelCount: dbDump.modelCount,
      totalRows: dbDump.totalRows
    }
  };

  console.log(JSON.stringify(finalSummary, null, 2));
}

main().catch(err => {
  console.error("❌ Erro fatal ao gerar backup geral (operação abortada):", err);
  process.exit(1);
});
