-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PRODUCER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "producerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Producer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "producerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "lastFour" TEXT,
    "balanceCents" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FinancialTitle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "dueDate" DATETIME,
    "settledAt" DATETIME,
    "producerId" TEXT,
    "eventId" TEXT,
    "bankAccountId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialTitle_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialTitle_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialTitle_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialTitle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "direction" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "titleId" TEXT,
    "payoutId" TEXT,
    "producerId" TEXT,
    "eventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "FinancialTitle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "PayoutRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" DATETIME
);

-- CreateTable
CREATE TABLE "Gateway" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CardBrand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MdrRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gatewayId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "rateBps" INTEGER NOT NULL,
    "fixedCents" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MdrRule_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MdrRule_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "CardBrand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventFeePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "producerPaysMdr" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventFeePolicy_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalReference" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "mdrRuleId" TEXT NOT NULL,
    "feePolicyId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" BIGINT NOT NULL,
    "grossCents" BIGINT NOT NULL,
    "feeModeAtSale" TEXT NOT NULL,
    "feeValueAtSale" BIGINT NOT NULL,
    "producerPaysMdrAtSale" BOOLEAN NOT NULL,
    "mdrRateBpsAtSale" INTEGER NOT NULL,
    "mdrFixedCentsAtSale" BIGINT NOT NULL,
    "feeCents" BIGINT NOT NULL,
    "mdrCents" BIGINT NOT NULL,
    "netSettlementCents" BIGINT NOT NULL,
    "producerNetCents" BIGINT NOT NULL,
    "diskNetCents" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_SETTLEMENT',
    "receivableTitleId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME,
    CONSTRAINT "FinancialSale_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialSale_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialSale_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialSale_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "CardBrand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialSale_mdrRuleId_fkey" FOREIGN KEY ("mdrRuleId") REFERENCES "MdrRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialSale_feePolicyId_fkey" FOREIGN KEY ("feePolicyId") REFERENCES "EventFeePolicy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialSale_receivableTitleId_fkey" FOREIGN KEY ("receivableTitleId") REFERENCES "FinancialTitle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "amountCents" BIGINT NOT NULL,
    "producerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "producerAcceptedById" TEXT,
    "financeSignedById" TEXT,
    "approvedAt" DATETIME,
    "producerAcceptedAt" DATETIME,
    "financeSignedAt" DATETIME,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "bankAccountId" TEXT,
    "settlementReference" TEXT,
    "settledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayoutRequest_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_producerAcceptedById_fkey" FOREIGN KEY ("producerAcceptedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_financeSignedById_fkey" FOREIGN KEY ("financeSignedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "postedAt" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ledgerEntryId" TEXT,
    "matchedById" TEXT,
    "matchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankStatementLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankStatementLine_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankStatementLine_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "exposureCents" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskCase_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "FinancialSale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RiskCase_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RiskCase_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RiskCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetLine_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BudgetLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "producerId" TEXT,
    "eventId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "terms" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialContract_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialContract_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "changedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPermissionOverride_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalAuthority" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "maxCents" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "changedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalAuthority_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalAuthority_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinanceSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "changedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinanceSetting_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertAcknowledgement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "postable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AccountingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" DATETIME NOT NULL,
    "validUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AccountingBusinessEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "eventId" TEXT,
    "producerId" TEXT,
    "amountCents" BIGINT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AccountingJournal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessEventId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingJournal_businessEventId_fkey" FOREIGN KEY ("businessEventId") REFERENCES "AccountingBusinessEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountingJournal_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingPosting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitCents" BIGINT NOT NULL DEFAULT 0,
    "creditCents" BIGINT NOT NULL DEFAULT 0,
    "eventId" TEXT,
    "producerId" TEXT,
    CONSTRAINT "AccountingPosting_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "AccountingJournal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountingPosting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventReserve" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    "releaseReason" TEXT,
    CONSTRAINT "EventReserve_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "producerId" TEXT NOT NULL,
    "originEventId" TEXT NOT NULL,
    "destinationEventId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "executedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "executedAt" DATETIME,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    CONSTRAINT "EventTransfer_originEventId_fkey" FOREIGN KEY ("originEventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventTransfer_destinationEventId_fkey" FOREIGN KEY ("destinationEventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProducerTransferPermission" (
    "producerId" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxPerTransferCents" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProducerTransferPermission_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Producer_document_key" ON "Producer"("document");

-- CreateIndex
CREATE INDEX "Event_producerId_idx" ON "Event"("producerId");

-- CreateIndex
CREATE INDEX "FinancialTitle_kind_status_createdAt_idx" ON "FinancialTitle"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTitle_producerId_eventId_idx" ON "FinancialTitle"("producerId", "eventId");

-- CreateIndex
CREATE INDEX "FinancialTitle_bankAccountId_idx" ON "FinancialTitle"("bankAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_titleId_key" ON "LedgerEntry"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_payoutId_key" ON "LedgerEntry"("payoutId");

-- CreateIndex
CREATE INDEX "LedgerEntry_bankAccountId_createdAt_idx" ON "LedgerEntry"("bankAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_producerId_eventId_idx" ON "LedgerEntry"("producerId", "eventId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "LoginAttempt_key_key" ON "LoginAttempt"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Gateway_name_key" ON "Gateway"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CardBrand_name_key" ON "CardBrand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MdrRule_gatewayId_brandId_installments_key" ON "MdrRule"("gatewayId", "brandId", "installments");

-- CreateIndex
CREATE UNIQUE INDEX "EventFeePolicy_eventId_key" ON "EventFeePolicy"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialSale_externalReference_key" ON "FinancialSale"("externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialSale_receivableTitleId_key" ON "FinancialSale"("receivableTitleId");

-- CreateIndex
CREATE INDEX "FinancialSale_producerId_eventId_status_idx" ON "FinancialSale"("producerId", "eventId", "status");

-- CreateIndex
CREATE INDEX "FinancialSale_createdAt_idx" ON "FinancialSale"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRequest_settlementReference_key" ON "PayoutRequest"("settlementReference");

-- CreateIndex
CREATE INDEX "PayoutRequest_producerId_eventId_status_idx" ON "PayoutRequest"("producerId", "eventId", "status");

-- CreateIndex
CREATE INDEX "PayoutRequest_createdAt_idx" ON "PayoutRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_ledgerEntryId_key" ON "BankStatementLine"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "BankStatementLine_bankAccountId_status_idx" ON "BankStatementLine"("bankAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_bankAccountId_externalId_key" ON "BankStatementLine"("bankAccountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskCase_externalId_key" ON "RiskCase"("externalId");

-- CreateIndex
CREATE INDEX "RiskCase_saleId_status_idx" ON "RiskCase"("saleId", "status");

-- CreateIndex
CREATE INDEX "RiskCase_eventId_status_idx" ON "RiskCase"("eventId", "status");

-- CreateIndex
CREATE INDEX "BudgetLine_eventId_kind_idx" ON "BudgetLine"("eventId", "kind");

-- CreateIndex
CREATE INDEX "FinancialContract_eventId_status_idx" ON "FinancialContract"("eventId", "status");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_permission_idx" ON "UserPermissionOverride"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionOverride_userId_permission_key" ON "UserPermissionOverride"("userId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalAuthority_userId_type_key" ON "ApprovalAuthority"("userId", "type");

-- CreateIndex
CREATE INDEX "AlertAcknowledgement_userId_createdAt_idx" ON "AlertAcknowledgement"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertAcknowledgement_key_userId_key" ON "AlertAcknowledgement"("key", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAccount_code_key" ON "AccountingAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_name_key" ON "AccountingPeriod"("name");

-- CreateIndex
CREATE INDEX "AccountingRule_eventType_active_idx" ON "AccountingRule"("eventType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingRule_eventType_version_key" ON "AccountingRule"("eventType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingBusinessEvent_externalKey_key" ON "AccountingBusinessEvent"("externalKey");

-- CreateIndex
CREATE INDEX "AccountingBusinessEvent_type_status_idx" ON "AccountingBusinessEvent"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingJournal_businessEventId_key" ON "AccountingJournal"("businessEventId");

-- CreateIndex
CREATE INDEX "AccountingJournal_periodId_occurredAt_idx" ON "AccountingJournal"("periodId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountingPosting_accountId_idx" ON "AccountingPosting"("accountId");

-- CreateIndex
CREATE INDEX "AccountingPosting_eventId_idx" ON "AccountingPosting"("eventId");

-- CreateIndex
CREATE INDEX "EventReserve_eventId_status_idx" ON "EventReserve"("eventId", "status");

-- CreateIndex
CREATE INDEX "EventTransfer_originEventId_status_idx" ON "EventTransfer"("originEventId", "status");

-- CreateIndex
CREATE INDEX "EventTransfer_producerId_createdAt_idx" ON "EventTransfer"("producerId", "createdAt");

