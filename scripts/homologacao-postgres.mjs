/**
 * Homologação Geral Ponta a Ponta (Pacote 05 / SOUL v5.0) contra PostgreSQL (Lakebase Postgres / Neon).
 * Cria um schema PostgreSQL temporário e isolado (homolog_v5_<timestamp>), executa toda a suíte
 * de 64 verificações E2E e remove o schema temporário (DROP SCHEMA CASCADE) ao final.
 */
import "dotenv/config";
import { execSync, spawn } from "node:child_process";
import net from "node:net";

function withSchema(urlStr, schemaName) {
  const u = new URL(urlStr);
  u.searchParams.set("schema", schemaName);
  return u.toString();
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 3199;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${url}/login`);
      if (r.status === 200) return;
    } catch {
      // aguarda inicialização
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`Servidor não respondeu em ${url} dentro de ${timeoutMs}ms.`);
}

async function main() {
  const baseDbUrl = (process.env.DATABASE_URL || "").trim();
  const baseUnpooledUrl = (process.env.DATABASE_URL_UNPOOLED || baseDbUrl).trim();
  if (!baseDbUrl.startsWith("postgres://") && !baseDbUrl.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL não aponta para um banco PostgreSQL.");
  }

  const schemaName = `homolog_v5_${Date.now().toString(36)}`;
  const isolatedPooledUrl = withSchema(baseDbUrl, schemaName);
  const isolatedUnpooledUrl = withSchema(baseUnpooledUrl, schemaName);
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const homologEnv = {
    ...process.env,
    DATABASE_URL: isolatedPooledUrl,
    DATABASE_URL_UNPOOLED: isolatedUnpooledUrl,
    ISOLATED_HOMOLOGATION: "SIM",
    HOMOLOG_BASE_URL: baseUrl,
    HOMOLOG_ADMIN_EMAIL: `admin.${schemaName}@homolog.invalid`,
    HOMOLOG_ADMIN_PASSWORD: `Homolog!Admin#${Date.now()}`,
    HOMOLOG_PRODUCER_PASSWORD: `Homolog!Prod#${Date.now()}`,
    BOOTSTRAP_ADMIN_NAME: "Administrador Homologação PG",
    BOOTSTRAP_ADMIN_EMAIL: `admin.${schemaName}@homolog.invalid`,
    BOOTSTRAP_ADMIN_PASSWORD: `Homolog!Admin#${Date.now()}`,
  };

  console.log(`\n=== SOUL v5.0 — Homologação Geral em PostgreSQL (Schema Isolado: ${schemaName}) ===`);

  let serverProc = null;
  try {
    console.log("1. Gerando Prisma Client PostgreSQL...");
    execSync("npx prisma generate --schema=prisma/postgresql/schema.prisma", {
      stdio: "inherit",
      env: homologEnv,
    });

    console.log(`2. Aplicando schema de 23 modelos no schema isolado '${schemaName}'...`);
    execSync("npx prisma db push --schema=prisma/postgresql/schema.prisma --skip-generate", {
      stdio: "inherit",
      env: { ...homologEnv, DATABASE_URL: isolatedUnpooledUrl },
    });

    console.log("3. Criando Administrador inicial via bootstrap...");
    execSync("npm run bootstrap", { stdio: "inherit", env: homologEnv });

    console.log(`4. Iniciando servidor Next.js em ${baseUrl}...`);
    const nextBin = "./node_modules/next/dist/bin/next";
    serverProc = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
      env: homologEnv,
      stdio: "inherit",
    });

    await waitForServer(baseUrl);

    console.log("5. Executando suíte completa de homologação integrada (Pacotes 01 + 02 + 03 + 04 + 05)...");
    execSync("node scripts/homologacao-integrada.mjs", {
      stdio: "inherit",
      env: homologEnv,
    });
  } finally {
    if (serverProc && !serverProc.killed) {
      serverProc.kill();
    }
    console.log(`6. Removendo schema temporário '${schemaName}' do PostgreSQL...`);
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({ datasources: { db: { url: isolatedUnpooledUrl } } });
    try {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
      console.log(`✔ Schema temporário '${schemaName}' removido com sucesso. Banco de produção permanece 100% limpo.`);
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch((err) => {
  console.error("❌ Falha na homologação PostgreSQL:", err);
  process.exit(1);
});
