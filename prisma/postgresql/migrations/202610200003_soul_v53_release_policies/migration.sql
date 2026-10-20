-- CreateTable
CREATE TABLE "EventReleasePolicy" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "capacityTickets" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventReleasePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReleaseTier" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "minSoldBps" INTEGER NOT NULL,
    "releaseBps" INTEGER NOT NULL,

    CONSTRAINT "EventReleaseTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventReleasePolicy_eventId_key" ON "EventReleasePolicy"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReleaseTier_policyId_minSoldBps_key" ON "EventReleaseTier"("policyId", "minSoldBps");

-- AddForeignKey
ALTER TABLE "EventReleasePolicy" ADD CONSTRAINT "EventReleasePolicy_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReleaseTier" ADD CONSTRAINT "EventReleaseTier_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "EventReleasePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
