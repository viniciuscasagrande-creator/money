import "dotenv/config";
import { execSync } from "node:child_process";

function run(cmd, customEnv = process.env) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: customEnv });
}

async function ensureBootstrapAdminIfConfigured() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const name = (process.env.BOOTSTRAP_ADMIN_NAME || "Administrador Geral").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";

  if (!email || password.length < 12) {
    console.log(
      "ℹ Bootstrap automático de administrador ignorado (defina BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD com >= 12 caracteres ou use npm run bootstrap)."
    );
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const bcryptModule = await import("bcryptjs");
  const bcrypt = bcryptModule.default || bcryptModule;
  const prisma = new PrismaClient();

  try {
    const existingAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (existingAdmins === 0) {
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.create({
        data: { name, email, role: "ADMIN", passwordHash }
      });
      console.log(`✔ Administrador inicial criado via variáveis explícitas de bootstrap: ${email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const skipPush = process.env.SKIP_DB_PUSH === "1";
  const dbUrl = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    ""
  ).trim();
  if (dbUrl && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = dbUrl;
  }
  const unpooledUrl = (
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ""
  ).trim();
  const isPostgres =
    dbUrl.startsWith("postgres://") ||
    dbUrl.startsWith("postgresql://") ||
    process.env.VERCEL === "1";

  if (isPostgres) {
    console.log("🌐 Ambiente PostgreSQL / Vercel detectado.");
    run("npx prisma generate --schema=prisma/postgresql/schema.prisma");
    if (!skipPush && (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://"))) {
      const migrationEnv = unpooledUrl ? { ...process.env, DATABASE_URL: unpooledUrl } : process.env;
      run("npx prisma db push --schema=prisma/postgresql/schema.prisma --skip-generate", migrationEnv);
      await ensureBootstrapAdminIfConfigured();
    }
  } else {
    console.log("💻 SQLite local detectado em DATABASE_URL.");
    run("npx prisma generate --schema=prisma/schema.prisma");
    if (!skipPush && dbUrl.startsWith("file:")) {
      run("npx prisma db push --schema=prisma/schema.prisma --skip-generate");
      await ensureBootstrapAdminIfConfigured();
    }
  }
}

main().catch((err) => {
  console.error("❌ Erro ao preparar Prisma / Banco de Dados:", err);
  process.exit(1);
});
