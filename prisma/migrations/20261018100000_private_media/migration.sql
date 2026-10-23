-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('EVENT', 'AVATAR');

-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "avatarAssetId" UUID;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "expiresAt" TIMESTAMPTZ(3) NOT NULL DEFAULT (now() + '00:05:00'::interval),
ADD COLUMN     "purpose" "MediaPurpose" NOT NULL DEFAULT 'EVENT',
ALTER COLUMN "eventId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MediaCleanupJob" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leaseToken" UUID,
ADD COLUMN     "leaseUntil" TIMESTAMPTZ(3),
ADD COLUMN     "notBefore" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "MediaUploadBudget" (
    "userId" UUID NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaUploadBudget_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MediaMaintenanceState" (
    "key" VARCHAR(100) NOT NULL,
    "cursor" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaMaintenanceState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Child_avatarAssetId_key" ON "Child"("avatarAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Child_familyId_id_avatarAssetId_key" ON "Child"("familyId", "id", "avatarAssetId");

-- CreateIndex
CREATE INDEX "MediaAsset_familyId_childId_purpose_status_idx" ON "MediaAsset"("familyId", "childId", "purpose", "status");

-- CreateIndex
CREATE INDEX "MediaAsset_status_expiresAt_idx" ON "MediaAsset"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_familyId_childId_id_key" ON "MediaAsset"("familyId", "childId", "id");

-- CreateIndex
CREATE INDEX "MediaCleanupJob_completedAt_notBefore_leaseUntil_idx" ON "MediaCleanupJob"("completedAt", "notBefore", "leaseUntil");

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_familyId_id_avatarAssetId_fkey" FOREIGN KEY ("familyId", "id", "avatarAssetId") REFERENCES "MediaAsset"("familyId", "childId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_familyId_childId_fkey" FOREIGN KEY ("familyId", "childId") REFERENCES "Child"("familyId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MediaUploadBudget" ADD CONSTRAINT "MediaUploadBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Media cannot be attached to both an event and an avatar.
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_purpose_target_check"
  CHECK (("purpose" = 'EVENT' AND "eventId" IS NOT NULL) OR ("purpose" = 'AVATAR' AND "eventId" IS NULL));
ALTER TABLE "MediaCleanupJob" ADD CONSTRAINT "MediaCleanupJob_attempts_check" CHECK ("attempts" >= 0);

ALTER TABLE "MediaMaintenanceState" ADD COLUMN "leaseUntil" TIMESTAMPTZ(3), ADD COLUMN "leaseToken" UUID;
