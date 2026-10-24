import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CHART_OF_ACCOUNTS } from "@/lib/accounting-core";
import {Prisma} from "@prisma/client";
import {apiCatch} from "@/lib/validation";

export const runtime = "nodejs";

const account = z
  .object({
    kind: z.literal("account"),
    code: z.string().regex(/^[1-9][0-9]*(\.[0-9]+)*$/),
    name: z.string().min(3).max(140),
    type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "DEDUCTION", "EXPENSE"]),
    postable: z.boolean().default(true)
  })
  .strict();

const period = z
  .object({
    kind: z.literal("period"),
    name: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  })
  .strict();

const rule = z
  .object({
    kind: z.literal("rule"),
    eventType: z.string().regex(/^[A-Z_]{3,60}$/),
    version: z.number().int().positive(),
    debitAccountId: z.string().min(1),
    creditAccountId: z.string().min(1),
    validFrom: z.string().datetime(),
    validUntil: z.string().datetime().nullable().optional()
  })
  .strict();

const seedChart = z.object({ kind: z.literal("seed_chart") }).strict();

const taxConfig = z
  .object({
    kind: z.literal("tax_config"),
    issBps: z.number().int().min(0).max(2000),
    pisBps: z.number().int().min(0).max(1000),
    cofinsBps: z.number().int().min(0).max(2000)
  })
  .strict();

async function POSTHandler(req: NextRequest) {
  const { error, user } = await authorize(req, ["ADMIN"]);
  if (error || !user) return error!;
  try {
    const body = z.union([account, period, rule, seedChart, taxConfig]).parse(await req.json());
    const result = await prisma.$transaction(async (tx) => {
      const createSetup=async()=>{
      if (body.kind === "seed_chart") {
        const existingRows = await tx.accountingAccount.findMany({ select: { code: true } });
        const existingCodes = new Set(existingRows.map((r) => r.code));
        const toCreate = DEFAULT_CHART_OF_ACCOUNTS.filter((acc) => !existingCodes.has(acc.code)).map((acc) => ({
          code: acc.code,
          name: acc.name,
          type: acc.type,
          postable: acc.postable
        }));
        if (toCreate.length > 0) {
          await tx.accountingAccount.createMany({ data: toCreate });
        }
        return { id: "seed_chart", createdCount: toCreate.length };
      }
      if (body.kind === "tax_config") {
        const value = JSON.stringify({ ISS: body.issBps, PIS: body.pisBps, COFINS: body.cofinsBps });
        await tx.financeSetting.upsert({
          where: { key: "accounting_tax_bps" },
          create: { key: "accounting_tax_bps", value, changedById: user.id },
          update: { value, changedById: user.id }
        });
        return { id: "accounting_tax_bps" };
      }
      if (body.kind === "account")
        return tx.accountingAccount.create({
          data: { code: body.code, name: body.name, type: body.type, postable: body.postable }
        });
      if (body.kind === "period") {
        const startAt = new Date(body.name + "-01T00:00:00.000Z"),
          endAt = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth() + 1, 1));
        return tx.accountingPeriod.create({ data: { name: body.name, startAt, endAt } });
      }
      if (body.debitAccountId === body.creditAccountId)
        throw new Error("REGRA:Contas de débito e crédito devem ser distintas.");
      if (body.validUntil && new Date(body.validUntil) <= new Date(body.validFrom)) throw new Error("REGRA:Vigência inválida.");
      const found = await tx.accountingAccount.findMany({
        where: { id: { in: [body.debitAccountId, body.creditAccountId] }, active: true, postable: true }
      });
      if (found.length !== 2) throw new Error("REGRA:Contas não encontradas ou inativas.");
      return tx.accountingRule.create({
        data: {
          eventType: body.eventType,
          version: body.version,
          debitAccountId: body.debitAccountId,
          creditAccountId: body.creditAccountId,
          validFrom: new Date(body.validFrom),
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
          active: false
        }
      });
      };
      const result=await createSetup();
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "ACCOUNTING_SETUP",
        entity: body.kind,
        entityId: result.id,
        summary: "Cadastro de estrutura contábil; não movimenta recursos."
      }
    });
      return result;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const x=apiCatch(e);return fail(x.message,x.status);
  }
}

export const POST=withMonitoring("/api/contabilidade/cadastros",POSTHandler);
