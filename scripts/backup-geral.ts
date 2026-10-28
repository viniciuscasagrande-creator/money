import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  exportDatabaseDump as snapshotDatabase,
  identifyDatabaseEnvironment,
  summarizeDatabaseDump,
  detectBackupRegression
} from "../src/lib/backup-data";
import {
  backupKeyRing,
  encodeBackup,
  decodeBackup,
  saveEncryptedArchive,
  retentionPlan,
  readBackup
} from "../src/lib/operational-backup";

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, "backups");

function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256File(filePath: string): string {
  return sha256Buffer(fs.readFileSync(filePath));
}

async function exportDatabaseDump() {
  return snapshotDatabase(prisma);
}

async function main() {
  const allowPlaintext = process.argv.includes("--legacy-plaintext-json");
  const ring = backupKeyRing();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")
    .replace("T", "-");

  const envMeta = identifyDatabaseEnvironment();

  console.log("1/4 Exportando snapshot transacional e conferindo ambiente e saldos...");
  let dbDump: Awaited<ReturnType<typeof exportDatabaseDump>>;
  try {
    dbDump = await exportDatabaseDump();
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }

  const summary = summarizeDatabaseDump(dbDump);
  const opDir = path.resolve(process.env.BACKUP_LOCAL_DIR ?? path.join(BACKUP_DIR, "operacional"));
  let baselineDump = null;
  if (fs.existsSync(opDir)) {
    const plan = retentionPlan(opDir, ring, 2);
    if (plan.retained[0]) {
      try {
        baselineDump = readBackup(plan.retained[0], ring);
      } catch {
        baselineDump = null;
      }
    }
  }
  const regression = detectBackupRegression(dbDump, baselineDump);
  if (regression.regressionDetected && !process.argv.includes("--allow-regression")) {
    throw new Error(
      `Redução inesperada de registros detectada (${regression.previousBusinessRows} -> ${regression.currentBusinessRows}). Use --allow-regression se intencional.`
    );
  }

  // Criptografa o banco em memória antes de gravar no disco (evita JSON legível temporário)
  const encryptedDbBytes = encodeBackup(dbDump, ring.primary);
  decodeBackup(encryptedDbBytes, ring.primary);
  const encryptedDbPath = path.join(BACKUP_DIR, "db-dump-soul-v5.2-completo.moneybak");
  fs.writeFileSync(encryptedDbPath, encryptedDbBytes, { mode: 0o600 });

  // Remove eventual dump legado em texto aberto, a menos que explicitamente solicitado
  const legacyPlaintextPath = path.join(BACKUP_DIR, "db-dump-soul-v5.2-completo.json");
  if (allowPlaintext) {
    fs.writeFileSync(legacyPlaintextPath, JSON.stringify(dbDump, null, 2), "utf8");
  } else if (fs.existsSync(legacyPlaintextPath)) {
    fs.rmSync(legacyPlaintextPath, { force: true });
  }

  console.log("2/4 Gerando Git Bundle completo (histórico, branches e tags)...");
  const bundlePath = path.join(BACKUP_DIR, "money-repo-soul-v5.2.bundle");
  execSync(`git bundle create "${bundlePath}" --all`, { cwd: ROOT, stdio: "inherit" });

  const headCommit = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim();

  console.log("3/4 Gerando manifesto de integridade autenticado (SHA-256 + keyId)...");
  const manifest = {
    system: "SOUL Financeiro ERP",
    version: "5.2.1",
    createdAt: now.toISOString(),
    environment: envMeta,
    encryption: {
      algorithm: "AES-256-GCM",
      keyId: ring.primaryId,
      plaintextDatabaseIncluded: allowPlaintext
    },
    git: {
      commit: headCommit,
      branch: currentBranch,
      workingTreeDirty: execSync("git status --porcelain", { cwd: ROOT }).toString().trim().length > 0,
      bundleFile: path.basename(bundlePath),
      bundleSha256: sha256File(bundlePath)
    },
    database: {
      encryptedDumpFile: path.basename(encryptedDbPath),
      encryptedDumpSha256: sha256Buffer(encryptedDbBytes),
      modelCount: summary.modelCount,
      totalRows: summary.totalRows,
      businessRows: summary.businessRows,
      nonEmptyTables: summary.nonEmptyTables,
      financialTotals: summary.financialTotals,
      regressionCheck: regression
    }
  };

  const manifestPath = path.join(BACKUP_DIR, "manifesto-backup-soul-v5.2.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("4/4 Empacotando código-fonte, bundle Git e banco criptografado em pacote protegido...");
  const stagingDir = path.join(BACKUP_DIR, `_staging_backup_${crypto.randomUUID()}`);
  if (path.dirname(path.resolve(stagingDir)) !== path.resolve(BACKUP_DIR)) {
    throw new Error("Destino de staging inválido.");
  }
  const tempZipPath = path.join(BACKUP_DIR, `_staging_zip_${crypto.randomUUID()}.zip`);

  try {
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
      "postcss.config.js",
      ".env.example",
      ".env.backup.example",
      ".env.homologacao.example",
      ".env.monitor.example",
      ".github",
      ".gitignore",
      "vercel.json",
      "neon.ts",
      "components.json",
      "next-env.d.ts",
      "docs",
      "README.md"
    ];

    for (const item of itemsToInclude) {
      const srcPath = path.join(ROOT, item);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(stagingDir, item);
        fs.cpSync(srcPath, destPath, {
          recursive: true,
          filter: (file) => !/\.db(?:-(?:wal|shm|journal))?$/.test(file)
        });
      }
    }

    fs.cpSync(encryptedDbPath, path.join(stagingDir, path.basename(encryptedDbPath)));
    fs.cpSync(bundlePath, path.join(stagingDir, path.basename(bundlePath)));
    fs.cpSync(manifestPath, path.join(stagingDir, path.basename(manifestPath)));

    const sourceHashes: Record<string, string> = {};
    function inventory(folder: string) {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) inventory(file);
        else if (path.basename(file) !== path.basename(manifestPath)) {
          sourceHashes[path.relative(stagingDir, file).replaceAll("\\", "/")] = sha256File(file);
        }
      }
    }
    inventory(stagingDir);
    const completeManifestObj = { ...manifest, files: sourceHashes };
    const completeManifest = JSON.stringify(completeManifestObj, null, 2);
    fs.writeFileSync(manifestPath, completeManifest);
    fs.writeFileSync(path.join(stagingDir, path.basename(manifestPath)), completeManifest);

    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${tempZipPath}' -Force"`,
      { cwd: ROOT, stdio: "inherit" }
    );

    const zipBytes = fs.readFileSync(tempZipPath);
    const zipSha256 = sha256Buffer(zipBytes);
    const zipSizeBytes = zipBytes.length;

    // Salva pacote completo criptografado e autenticado (.moneyzip)
    const latestEncryptedArchive = path.join(BACKUP_DIR, "money-backup-v5.2-geral-completo.moneyzip");
    const timestampedEncryptedArchive = path.join(BACKUP_DIR, `money-backup-v5.2-${stamp}.moneyzip`);
    saveEncryptedArchive(latestEncryptedArchive, zipBytes, completeManifestObj, ring.primary);
    saveEncryptedArchive(timestampedEncryptedArchive, zipBytes, completeManifestObj, ring.primary);

    // Mantém o ZIP estrutural contendo APENAS o banco já criptografado (.moneybak), nunca JSON aberto
    const latestZipPath = path.join(BACKUP_DIR, "money-backup-v5.2-geral-completo.zip");
    const timestampedZipPath = path.join(BACKUP_DIR, `money-backup-v5.2-${stamp}.zip`);
    fs.copyFileSync(tempZipPath, latestZipPath);
    fs.copyFileSync(tempZipPath, timestampedZipPath);

    const finalSummary = {
      status: "OK",
      createdAt: now.toISOString(),
      commit: headCommit,
      keyId: ring.primaryId,
      environment: envMeta,
      files: {
        encryptedFullArchive: latestEncryptedArchive,
        timestampedEncryptedArchive,
        latestZip: latestZipPath,
        timestampedZip: timestampedZipPath,
        gitBundle: bundlePath,
        encryptedDbDump: encryptedDbPath,
        manifest: manifestPath
      },
      zipSizeBytes,
      zipSha256,
      databaseSummary: {
        modelCount: summary.modelCount,
        totalRows: summary.totalRows,
        businessRows: summary.businessRows,
        nonEmptyTables: summary.nonEmptyTables,
        financialTotals: summary.financialTotals,
        regressionCheck: regression
      }
    };

    console.log(JSON.stringify(finalSummary, null, 2));
  } finally {
    // Limpeza garantida de temporários em sucesso ou falha
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(tempZipPath, { force: true });
  }
}

main().catch((err) => {
  console.error("Erro ao gerar backup geral:", err instanceof Error ? err.message : "Falha na geração.");
  process.exit(1);
});
