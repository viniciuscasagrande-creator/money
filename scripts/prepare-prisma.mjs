import "dotenv/config";
import { execSync } from "node:child_process";

function run(cmd, customEnv = process.env) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: customEnv });
}

async function main() {
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
  const isPostgres =
    dbUrl.startsWith("postgres://") ||
    dbUrl.startsWith("postgresql://") ||
    process.env.VERCEL === "1";

  if (isPostgres) {
    console.log("🌐 Ambiente PostgreSQL / Vercel detectado.");
    run("npx prisma generate --schema=prisma/postgresql/schema.prisma");
  } else {
    console.log("💻 SQLite local detectado em DATABASE_URL.");
    run("npx prisma generate --schema=prisma/schema.prisma");

  }
}

main().catch((err) => {
  console.error("❌ Erro ao preparar Prisma / Banco de Dados:", err);
  process.exit(1);
});
