-- CreateTable
CREATE TABLE "IntegrationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'ticketing',
    "externalReference" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" DATETIME,
    "lastErrorCode" TEXT,
    "titleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    CONSTRAINT "IntegrationJob_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "IntegrationJob_status_nextAttemptAt_idx" ON "IntegrationJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "IntegrationJob_status_leaseUntil_idx" ON "IntegrationJob"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationJob_provider_externalReference_key" ON "IntegrationJob"("provider", "externalReference");
