import { Prisma } from "@prisma/client";
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

const singleSchema = z
  .object({
    businessEventId: z.string().min(1),
    ruleId: z.string().min(1),
    customPostings: z.array(customPostingSchema).min(2).max(20).optional()
  })
  .strict();

const batchSchema = z
  .object({
    mode: z.literal("AUTO_BY_APPROVED_RULES"),
    eventId: z.string().min(1).optional(),
    periodName: z.string().regex(/^\d{4}-\d{2}$/).optional()
  })
  .strict();

export async function GET(req: NextRequest) {
  const { error, user } = await authorize(req, ["ADMIN", "FINANCE_DISK"]);
  if (error || !user) return error!;
  const [pendingEvents, activeRules, periods] = await Promise.all([
    prisma.accountingBusinessEvent.findMany({
      where: { status: { in: ["PENDING", "ERROR"] } },
      orderBy: { occurredAt: "asc" },
      take: 200
    }),
    prisma.accountingRule.findMany({
      where: { active: true },
      orderBy: [{ eventType: "asc" }, { version: "desc" }]
    }),
    prisma.accountingPeriod.findMany({
      orderBy: { name: "desc" }
    })
  ]);

  const periodMap = new Map(periods.map((p) => [p.name, p]));
  let readyToAutoPost = 0;
  let missingRule = 0;
  let missingOrClosedPeriod = 0;

  const diagnosed = pendingEvents.map((evt) => {
    const pName = periodName(evt.occurredAt);
    const period = periodMap.get(pName);
    const periodOpen = Boolean(
      period && period.status === "OPEN" && evt.occurredAt >= period.startAt && evt.occurredAt < period.endAt
    );
    const matchedRule = activeRules.find(
      (r) =>
        r.eventType === evt.type &&
        r.validFrom <= evt.occurredAt &&
        (!r.validUntil || r.validUntil >= evt.occurredAt)
    );
    let diagnosis: "READY_FOR_RULE" | "MISSING_ACTIVE_RULE" | "PERIOD_NOT_OPEN" = "READY_FOR_RULE";
    if (!periodOpen) {
      diagnosis = "PERIOD_NOT_OPEN";
      missingOrClosedPeriod++;
    } else if (!matchedRule) {
      diagnosis = "MISSING_ACTIVE_RULE";
      missingRule++;
    } else {
      readyToAutoPost++;
    }
    return {
      id: evt.id,
      externalKey: evt.externalKey,
      type: evt.type,
      source: evt.source,
      sourceId: evt.sourceId,
      eventId: evt.eventId,
      producerId: evt.producerId,
      amountCents: evt.amountCents.toString(),
      occurredAt: evt.occurredAt.toISOString(),
      periodName: pName,
      status: evt.status,
      diagnosis,
      matchedRuleId: matchedRule?.id ?? null,
      matchedRuleVersion: matchedRule?.version ?? null
    };
  });

  return NextResponse.json({
    summary: {
      totalPending: pendingEvents.length,
      readyToAutoPost,
      missingRule,
      missingOrClosedPeriod
    },
    items: diagnosed
  });
}

export async function POST(req: NextRequest) {
  const { error, user } = await authorize(req, ["ADMIN"]);
  if (error || !user) return error!;
  try {
    const body = await req.json();

    if (body && typeof body === "object" && "mode" in body && body.mode === "AUTO_BY_APPROVED_RULES") {
      const batchInput = batchSchema.parse(body);
      const batchResult = await prisma.$transaction(
        async (tx) => {
          const pending = await tx.accountingBusinessEvent.findMany({
            where: {
              status: "PENDING",
              ...(batchInput.eventId ? { eventId: batchInput.eventId } : {})
            },
            orderBy: { occurredAt: "asc" },
            take: 100
          });
          const rules = await tx.accountingRule.findMany({
            where: { active: true },
            orderBy: [{ eventType: "asc" }, { version: "desc" }]
          });
          const periods = await tx.accountingPeriod.findMany({ where: { status: "OPEN" } });
          const periodMap = new Map(periods.map((p) => [p.name, p]));

          const postedJournalIds: string[] = [];
          const skipped: Array<{ businessEventId: string; type: string; reason: string }> = [];

          for (const item of pending) {
            const pName = periodName(item.occurredAt);
            if (batchInput.periodName && pName !== batchInput.periodName) continue;
            const existingJournal = await tx.accountingJournal.findUnique({ where: { businessEventId: item.id } });
            if (existingJournal) {
              await tx.accountingBusinessEvent.update({ where: { id: item.id }, data: { status: "POSTED" } });
              continue;
            }
            const period = periodMap.get(pName);
            if (!period || period.status !== "OPEN" || item.occurredAt < period.startAt || item.occurredAt >= period.endAt) {
              skipped.push({ businessEventId: item.id, type: item.type, reason: `Período contábil ${pName} fechado ou inexistente.` });
              continue;
            }
            const rule = rules.find(
              (r) =>
                r.eventType === item.type &&
                r.validFrom <= item.occurredAt &&
                (!r.validUntil || r.validUntil >= item.occurredAt)
            );
            if (!rule) {
              skipped.push({ businessEventId: item.id, type: item.type, reason: `Nenhuma regra ativa aprovada para ${item.type}.` });
              continue;
            }
            const accounts = await tx.accountingAccount.findMany({
              where: { id: { in: [rule.debitAccountId, rule.creditAccountId] }, active: true, postable: true }
            });
            if (accounts.length < 2) {
              skipped.push({ businessEventId: item.id, type: item.type, reason: "Contas da regra inativas ou sintéticas." });
              continue;
            }
            const postingsToCreate = [
              { accountId: rule.debitAccountId, debitCents: item.amountCents, creditCents: 0n },
              { accountId: rule.creditAccountId, debitCents: 0n, creditCents: item.amountCents }
            ];
            validatePostings(postingsToCreate);

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
                action: "ACCOUNTING_AUTO_POSTED",
                entity: "AccountingJournal",
                entityId: journal.id,
                summary: `Contabilização automática por regra aprovada v${rule.version} para ${item.type} (${item.externalKey}).`
              }
            });
            postedJournalIds.push(journal.id);
          }

          return {
            mode: "AUTO_BY_APPROVED_RULES",
            postedCount: postedJournalIds.length,
            skippedCount: skipped.length,
            postedJournalIds,
            skipped
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      return NextResponse.json(batchResult);
    }

    const { businessEventId, ruleId, customPostings } = singleSchema.parse(body);
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

      const locked = await tx.accountingPeriod.updateMany({ where: { id: period.id, status: "OPEN" }, data: { status: "OPEN" } });
      if (locked.count !== 1) throw new Error("Período contábil fechado durante processamento.");
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Falha de contabilização.", 400);
  }
}
