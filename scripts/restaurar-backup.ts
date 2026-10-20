import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, "backups");

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const manifestPath = path.join(BACKUP_DIR, "manifesto-backup-soul-v5.2.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifesto não encontrado em ${manifestPath}. Execute npm run backup primeiro.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const bundlePath = path.join(BACKUP_DIR, manifest.git.bundleFile);
  const dumpPath = path.join(BACKUP_DIR, manifest.database.dumpFile);

  const actualBundleHash = sha256File(bundlePath);
  const actualDumpHash = sha256File(dumpPath);

  if (actualBundleHash !== manifest.git.bundleSha256) {
    throw new Error("Falha de integridade: SHA-256 do Git Bundle diverge do manifesto.");
  }
  if (actualDumpHash !== manifest.database.dumpSha256) {
    throw new Error("Falha de integridade: SHA-256 do Dump de Banco diverge do manifesto.");
  }

  execSync(`git bundle verify "${bundlePath}"`, { cwd: ROOT, stdio: "inherit" });

  const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
  console.log(
    JSON.stringify(
      {
        status: "VERIFIED_READY_FOR_RESTORE",
        version: manifest.version,
        commit: manifest.git.commit,
        bundleSha256Verified: true,
        dumpSha256Verified: true,
        modelCount: dump.modelCount,
        totalRows: dump.totalRows
      },
      null,
      2
    )
  );
}

main().catch(err => {
  console.error("❌ Falha na verificação/restauração do backup:", err);
  process.exit(1);
});
