ALTER TABLE "AuditLog" ADD COLUMN "requestId" TEXT;
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");
CREATE TABLE "OperationalNotification" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "signal" TEXT NOT NULL,
 "transition" TEXT NOT NULL,
 "observedCount" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseToken" TEXT,
 "leaseUntil" DATETIME,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "sentAt" DATETIME
);
CREATE INDEX "OperationalNotification_status_nextAttemptAt_idx" ON "OperationalNotification"("status", "nextAttemptAt");
CREATE INDEX "OperationalNotification_status_leaseUntil_idx" ON "OperationalNotification"("status", "leaseUntil");
