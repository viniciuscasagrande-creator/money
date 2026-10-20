-- AlterEnum
ALTER TYPE "ReserveStatus" ADD VALUE 'CANCELED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransferStatus" ADD VALUE 'PRODUCER_ACCEPTED';
ALTER TYPE "TransferStatus" ADD VALUE 'REVERSED';

-- AlterTable
ALTER TABLE "EventReserve" ADD COLUMN     "beneficiary" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OUTRAS_DESPESAS',
ADD COLUMN     "documentRef" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "ownerName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "EventTransfer" ADD COLUMN     "producerAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "producerAcceptedById" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "IntegrationDelivery" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationDelivery_titleId_key" ON "IntegrationDelivery"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationDelivery_provider_externalReference_key" ON "IntegrationDelivery"("provider", "externalReference");

