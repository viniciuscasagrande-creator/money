-- CreateTable
CREATE TABLE "IntegrationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EventReserve" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OUTRAS_DESPESAS',
    "beneficiary" TEXT NOT NULL DEFAULT '',
    "documentRef" TEXT NOT NULL DEFAULT '',
    "ownerName" TEXT NOT NULL DEFAULT '',
    "dueDate" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountCents" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    "releaseReason" TEXT,
    CONSTRAINT "EventReserve_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EventReserve" ("amountCents", "createdAt", "createdById", "eventId", "id", "purpose", "releaseReason", "releasedAt", "status") SELECT "amountCents", "createdAt", "createdById", "eventId", "id", "purpose", "releaseReason", "releasedAt", "status" FROM "EventReserve";
DROP TABLE "EventReserve";
ALTER TABLE "new_EventReserve" RENAME TO "EventReserve";
CREATE INDEX "EventReserve_eventId_status_idx" ON "EventReserve"("eventId", "status");
CREATE TABLE "new_EventTransfer" (
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
    "producerAcceptedById" TEXT,
    "producerAcceptedAt" DATETIME,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "executedAt" DATETIME,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    CONSTRAINT "EventTransfer_originEventId_fkey" FOREIGN KEY ("originEventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventTransfer_destinationEventId_fkey" FOREIGN KEY ("destinationEventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EventTransfer" ("amountCents", "approvedAt", "approvedById", "createdAt", "destinationEventId", "executedAt", "executedById", "id", "originEventId", "producerId", "reason", "rejectedAt", "rejectionReason", "requestedById", "status") SELECT "amountCents", "approvedAt", "approvedById", "createdAt", "destinationEventId", "executedAt", "executedById", "id", "originEventId", "producerId", "reason", "rejectedAt", "rejectionReason", "requestedById", "status" FROM "EventTransfer";
DROP TABLE "EventTransfer";
ALTER TABLE "new_EventTransfer" RENAME TO "EventTransfer";
CREATE INDEX "EventTransfer_originEventId_status_idx" ON "EventTransfer"("originEventId", "status");
CREATE INDEX "EventTransfer_producerId_createdAt_idx" ON "EventTransfer"("producerId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationDelivery_titleId_key" ON "IntegrationDelivery"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationDelivery_provider_externalReference_key" ON "IntegrationDelivery"("provider", "externalReference");

