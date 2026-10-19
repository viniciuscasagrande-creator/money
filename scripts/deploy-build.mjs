import "dotenv/config";
import { execSync } from "node:child_process";

function run(cmd) {
  console.log(`\n▶ Executando: ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });
}

async function ensureAdminIfConfigured() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const name = (process.env.BOOTSTRAP_ADMIN_NAME || "Administrador").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";

  if (!email || !password) {
    console.log("ℹ BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD não informados — pulando verificação de administrador inicial.");
    return;
  }

  if (!email.includes("@") || password.length < 12) {
    console.warn("⚠ BOOTSTRAP_ADMIN_EMAIL inválido ou BOOTSTRAP_ADMIN_PASSWORD menor que 12 caracteres — pulando criação automática.");
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const bcryptModule = await import("bcryptjs");
  const bcrypt = bcryptModule.default || bcryptModule;
  const prisma = new PrismaClient();

  try {
    const existingAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (existingAdmins > 0) {
      console.log("✔ Administrador já existente no banco — mantendo credenciais intactas.");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        name,
        email,
        role: "ADMIN",
        passwordHash,
      },
    });
    console.log(`✔ Administrador inicial criado com sucesso: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const dbUrl = (process.env.DATABASE_URL || "").trim();
  const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");

  if (isPostgres) {
    console.log("🌐 Ambiente PostgreSQL detectado em DATABASE_URL.");
    run("npx prisma generate --schema=prisma/postgresql/schema.prisma");
    run("npx prisma db push --schema=prisma/postgresql/schema.prisma --skip-generate");
    await ensureAdminIfConfigured();
  } else {
    console.log("💻 Ambiente SQLite local detectado.");
    run("npx prisma generate --schema=prisma/schema.prisma");
    if (dbUrl.startsWith("file:")) {
      run("npx prisma db push --schema=prisma/schema.prisma --skip-generate");
      await ensureAdminIfConfigured();
    }
  }

  run("npx next build");
}

main().catch((err) => {
  console.error("❌ Falha no build de publicação:", err);
  process.exit(1);
});
