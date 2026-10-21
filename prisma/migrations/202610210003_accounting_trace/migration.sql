-- AlterTable
ALTER TABLE "AccountingJournal" ADD COLUMN "postedById" TEXT;
ALTER TABLE "AccountingJournal" ADD COLUMN "ruleId" TEXT;
ALTER TABLE "AccountingJournal" ADD COLUMN "ruleSnapshotJson" TEXT;

-- Correct only known default chart entries previously seeded as EXPENSE.
UPDATE "AccountingAccount" SET "type"='DEDUCTION' WHERE "type"='EXPENSE' AND (("code"='3.2' AND "name"='Deduções da receita') OR ("code"='3.2.01' AND "name"='Impostos sobre receita e cancelamentos'));