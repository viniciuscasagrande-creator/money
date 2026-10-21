import { z } from "zod";
import { Prisma } from "@prisma/client";

export const titleInput = z.object({
  description: z.string().trim().min(3).max(180),
  amountCents: z.string().regex(/^\d{1,16}$/),
  dueDate: z.string().date().optional().nullable(),
  producerId: z.string().min(1).optional().nullable(),
  eventId: z.string().min(1).optional().nullable()
}).strict();

export const accountInput = z.object({
  name: z.string().trim().min(2).max(90),
  institution: z.string().trim().min(2).max(90),
  lastFour: z.string().regex(/^\d{4}$/).optional().nullable(),
  initialBalanceCents: z.string().regex(/^\d{1,16}$/).default("0")
}).strict();

export const producerInput = z.object({
  name: z.string().trim().min(2).max(140), document: z.string().trim().min(5).max(30).optional().nullable()
}).strict();
export const eventInput = z.object({
  name: z.string().trim().min(2).max(140), producerId: z.string().min(1), status: z.enum(["PLANNED", "ACTIVE", "CLOSED"]).default("PLANNED")
}).strict();
export const userInput = z.object({
  name: z.string().trim().min(2).max(140),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  role: z.enum(["ADMIN", "FINANCE_DISK", "PRODUCER"]),
  producerId: z.string().optional().nullable()
}).strict().refine((x) => x.role !== "PRODUCER" || !!x.producerId, { message: "Vincule o usuário ao produtor." });

export function isoDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(d.valueOf())) throw new Error("Data inválida.");
  return d;
}

export function apiCatch(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return {message:"Outra operação alterou a posição financeira. Atualize os dados e tente novamente.",status:409};
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { message: "Já existe um cadastro ou referência com esse identificador.", status: 409 };
  if (e instanceof z.ZodError) return { message: e.issues.map((i) => i.message).join("; "), status: 400 };
  if (e instanceof Error && e.message.startsWith("REGRA:")) return { message: e.message.slice(6), status: 409 };
  if (e instanceof Error && ["Valor em centavos inválido.", "Valor deve ser maior que zero.", "Data inválida."].includes(e.message)) return { message: e.message, status: 400 };
  // Não expor detalhes de banco, credenciais ou stack traces ao cliente.
  console.error("Erro de operação financeira", e);
  return { message: "Não foi possível concluir a operação.", status: 500 };
}
