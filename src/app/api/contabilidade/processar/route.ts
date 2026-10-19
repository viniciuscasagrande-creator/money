import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currencyCents, periodName, validatePostings } from "@/lib/accounting-core";

export const runtime = "nodejs";

const customPostingSchema = z.object({
  accountId: z.string().min(1),
  debitCents: z.string().regex(/^[0-9]+$/).default("0"),
  creditCents: z.string().regex(/^[0-9]+$/).default("0")
});

const schema = z
  .object({
    businessEventId: z.string().min(1),
    ruleId: z.string().min(1),
    customPostings: z.array(customPostingSchema).min(2).max(20).optional()
  })
  .strict();

export async function POST(req: NextRequest) {
  const { error, user } = await authorize(req, ["ADMIN"]);
  if (error || !user) return error!;
  try {
    const { businessEventId, ruleId, customPostings } = schema.parse(await req.json());
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.accountingBusinessEvent.findUnique({ where: { id: businessEventId } });
      if (!item) throw new Error("Evento contábil inexistente.");
      const old = await tx.accountingJournal.findUnique({ where: { businessEventId } });
      if (old) return { journalId: old.id, duplicate: true };
      if (item.status !== "PENDING") throw new Error("Evento não está pendente.");
      const rule = await tx.accountingRule.findUnique({ where: { id: ruleId } });
      if (
        !rule ||
        !rule.active ||
        rule.eventType !== item.type ||
        rule.validFrom > item.occurredAt ||
        (rule.validUntil && rule.validUntil < item.occurredAt)
      )
        throw new Error("Regra inválida, inativa ou fora da vigência.");
      const period = await tx.accountingPeriod.findUnique({ where: { name: periodName(item.occurredAt) } });
      if (!period || period.status !== "OPEN" || item.occurredAt < period.startAt || item.occurredAt >= period.endAt)
        throw new Error("Período contábil fechado ou inexistente.");

      const postingsToCreate =
        customPostings && customPostings.length >= 2
          ? customPostings.map((p) => ({
              accountId: p.accountId,
              debitCents: p.debitCents === "0" ? 0n : currencyCents(p.debitCents),
              creditCents: p.creditCents === "0" ? 0n : currencyCents(p.creditCents)
            }))
          : [
              { accountId: rule.debitAccountId, debitCents: item.amountCents, creditCents: 0n },
              { accountId: rule.creditAccountId, debitCents: 0n, creditCents: item.amountCents }
            ];

      const uniqueAccountIds = [...new Set(postingsToCreate.map((p) => p.accountId))];
      const accounts = await tx.accountingAccount.findMany({
        where: { id: { in: uniqueAccountIds }, active: true, postable: true }
      });
      if (accounts.length !== uniqueAccountIds.length || uniqueAccountIds.length < 2) {
        throw new Error("Contas inválidas.");
      }

      const totals = validatePostings(postingsToCreate);
      if (totals.debit !== item.amountCents) {
        throw new Error("Soma das partidas deve coincidir com o valor do evento de negócio.");
      }

      const journal = await tx.accountingJournal.create({
        data: {
          businessEventId: item.id,
          periodId: period.id,
          description: `${item.type} · ${item.source} · ${item.sourceId}`,
          ruleVersion: rule.version,
          occurredAt: item.occurredAt,
          postings: {
            create: postingsToCreate.map((p) => ({
              accountId: p.accountId,
              debitCents: p.debitCents,
              creditCents: p.creditCents,
              eventId: item.eventId,
              producerId: item.producerId
            }))
          }
        }
      });
      await tx.accountingBusinessEvent.update({ where: { id: item.id }, data: { status: "POSTED" } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "ACCOUNTING_POSTED",
          entity: "AccountingJournal",
          entityId: journal.id,
          summary: `Lançamento contábil balanceado de ${item.type} (${postingsToCreate.length} partidas); regra v${rule.version}.`
        }
      });
      return { journalId: journal.id, duplicate: false, postingsCount: postingsToCreate.length };
    });
    return NextResponse.json(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Falha de contabilização.", 400);
  }
}
