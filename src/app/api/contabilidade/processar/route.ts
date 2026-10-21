import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { periodName, validatePostings } from "@/lib/accounting-core";
import { postAccounting } from "@/lib/accounting-posting";
import { apiCatch } from "@/lib/validation";

export const runtime = "nodejs";

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
    const body = await req.json().catch(() => null);

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
                ruleId: rule.id,
                postedById: user.id,
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

    return NextResponse.json(await postAccounting(prisma, body, user.id));
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
}
