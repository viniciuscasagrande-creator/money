import { PrismaClient } from "@prisma/client";

function currentDatabaseUrl(): string | undefined {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL;
  if (url && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = url;
  }
  return url;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaUrl?: string;
};

function getClient(): PrismaClient {
  const url = currentDatabaseUrl();
  if (!globalForPrisma.prisma || (url && globalForPrisma.prismaUrl !== url)) {
    globalForPrisma.prisma = new PrismaClient({
      transactionOptions: { maxWait: 5000, timeout: 15000 },
      log: ["error", "warn"],
      ...(url ? { datasources: { db: { url } } } : {}),
    });
    globalForPrisma.prismaUrl = url;
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client as object, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
