-- CreateTable
CREATE TABLE "ReconciliationAllocation" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationIssue" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "actorId" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialClose" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "openingBalanceCents" BIGINT NOT NULL,
    "closingBalanceCents" BIGINT NOT NULL,
    "declaredBalanceCents" BIGINT NOT NULL,
    "creditCents" BIGINT NOT NULL,
    "debitCents" BIGINT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationAllocation_requestKey_key" ON "ReconciliationAllocation"("requestKey");

-- CreateIndex
CREATE INDEX "ReconciliationAllocation_statementId_idx" ON "ReconciliationAllocation"("statementId");

-- CreateIndex
CREATE INDEX "ReconciliationAllocation_ledgerEntryId_idx" ON "ReconciliationAllocation"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "ReconciliationIssue_statementId_status_idx" ON "ReconciliationIssue"("statementId", "status");

-- CreateIndex
CREATE INDEX "FinancialClose_bankAccountId_endAt_idx" ON "FinancialClose"("bankAccountId", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialClose_bankAccountId_month_key" ON "FinancialClose"("bankAccountId", "month");

-- CreateIndex
CREATE INDEX "BankStatementLine_bankAccountId_postedAt_idx" ON "BankStatementLine"("bankAccountId", "postedAt");

-- AddForeignKey
ALTER TABLE "ReconciliationAllocation" ADD CONSTRAINT "ReconciliationAllocation_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationAllocation" ADD CONSTRAINT "ReconciliationAllocation_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationAllocation" ADD CONSTRAINT "ReconciliationAllocation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationIssue" ADD CONSTRAINT "ReconciliationIssue_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationIssue" ADD CONSTRAINT "ReconciliationIssue_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationIssue" ADD CONSTRAINT "ReconciliationIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialClose" ADD CONSTRAINT "FinancialClose_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialClose" ADD CONSTRAINT "FinancialClose_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve exact reconciliations registered before partial allocations.
INSERT INTO "ReconciliationAllocation" ("id","requestKey","statementId","ledgerEntryId","amountCents","actorId","createdAt")
SELECT 'legacy_' || s."id", 'legacy:' || s."id", s."id", s."ledgerEntryId", s."amountCents", s."matchedById", COALESCE(s."matchedAt",s."createdAt")
FROM "BankStatementLine" s WHERE s."status" = 'MATCHED' AND s."ledgerEntryId" IS NOT NULL;