import "dotenv/config";
import { execSync } from "node:child_process";

function run(cmd, customEnv = process.env) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: customEnv });
}

async function ensureDefaultAdmin() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@financeiro.local").trim().toLowerCase();
  const name = (process.env.BOOTSTRAP_ADMIN_NAME || "Administrador Geral").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "Admin@Financeiro2026!";

  const { PrismaClient } = await import("@prisma/client");
  const bcryptModule = await import("bcryptjs");
  const bcrypt = bcryptModule.default || bcryptModule;
  const prisma = new PrismaClient();

  try {
    const existingAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (existingAdmins === 0) {
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.create({
        data: { name, email, role: "ADMIN", passwordHash },
      });
      console.log(`✔ Administrador inicial garantido no banco: ${email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const dbUrl = (process.env.DATABASE_URL || "").trim();
  const unpooledUrl = (process.env.DATABASE_URL_UNPOOLED || "").trim();
  const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");

  if (isPostgres) {
    console.log("🌐 Lakebase Postgres (Neon) detectado em DATABASE_URL.");
    run("npx prisma generate --schema=prisma/postgresql/schema.prisma");
    // Per neon-postgres skill best practices: use direct/unpooled connection for schema migrations when available
    const migrationEnv = unpooledUrl ? { ...process.env, DATABASE_URL: unpooledUrl } : process.env;
    run("npx prisma db push --schema=prisma/postgresql/schema.prisma --skip-generate", migrationEnv);
    await ensureDefaultAdmin();
  } else {
    console.log("💻 SQLite local detectado em DATABASE_URL.");
    run("npx prisma generate --schema=prisma/schema.prisma");
    if (dbUrl.startsWith("file:")) {
      run("npx prisma db push --schema=prisma/schema.prisma --skip-generate");
      await ensureDefaultAdmin();
    }
  }
}

main().catch((err) => {
  console.error("❌ Erro ao preparar Prisma / Banco de Dados:", err);
  process.exit(1);
});
