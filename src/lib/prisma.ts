import { PrismaClient } from "@prisma/client";

const resolvedUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL;

if (resolvedUrl && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolvedUrl;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    ...(resolvedUrl ? { datasources: { db: { url: resolvedUrl } } } : {}),
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
