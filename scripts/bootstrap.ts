import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const name = (process.env.BOOTSTRAP_ADMIN_NAME || "Administrador").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  if (!email.includes("@") || password.length < 12) {
    throw new Error("Informe BOOTSTRAP_ADMIN_EMAIL válido e BOOTSTRAP_ADMIN_PASSWORD (mín. 12 caracteres) no ambiente.");
  }
  const existingAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (existingAdmins > 0) throw new Error("Bootstrap bloqueado: já existe administrador. Não é permitido recriar credenciais por bootstrap.");
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) throw new Error("Este e-mail já está cadastrado.");
  await prisma.user.create({ data: { name, email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) } });
  console.log(`Administrador inicial criado: ${email}. Nenhum saldo, produtor ou lançamento fictício foi criado.`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
