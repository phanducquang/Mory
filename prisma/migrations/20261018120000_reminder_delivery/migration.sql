-- Existing manual reminder duplicates are coalesced before enforcing occurrence uniqueness.
DELETE FROM "Reminder" a USING "Reminder" b WHERE a."familyId"=b."familyId" AND a."eventId"=b."eventId"
  AND a."scheduledAt"=b."scheduledAt" AND a."id">b."id";
-- AlterTable
ALTER TABLE "AuthMailJob" ADD COLUMN     "familyId" UUID,
ADD COLUMN     "recipientUserId" UUID,
ADD COLUMN     "reminderId" UUID,
ADD COLUMN     "subjectUserId" UUID;

-- CreateTable
CREATE TABLE "WorkerCheckpoint" (
    "key" VARCHAR(100) NOT NULL,
    "cursor" TEXT,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkerCheckpoint_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_familyId_id_key" ON "Reminder"("familyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_familyId_eventId_scheduledAt_key" ON "Reminder"("familyId", "eventId", "scheduledAt");

-- CreateIndex
CREATE INDEX "AuthMailJob_subjectUserId_idx" ON "AuthMailJob"("subjectUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthMailJob_reminderId_recipientUserId_key" ON "AuthMailJob"("reminderId", "recipientUserId");

-- AddForeignKey
ALTER TABLE "AuthMailJob" ADD CONSTRAINT "AuthMailJob_familyId_recipientUserId_fkey" FOREIGN KEY ("familyId", "recipientUserId") REFERENCES "FamilyMember"("familyId", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AuthMailJob" ADD CONSTRAINT "AuthMailJob_familyId_reminderId_fkey" FOREIGN KEY ("familyId", "reminderId") REFERENCES "Reminder"("familyId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;


CREATE INDEX "Event_reminder_date_id_idx" ON "Event"("reminder", "date", "id");
ALTER TABLE "AuthMailJob" DROP CONSTRAINT "AuthMailJob_state_check";
ALTER TABLE "AuthMailJob" ADD CONSTRAINT "AuthMailJob_state_check" CHECK (
  "attempts" >= 0 AND
  (("purpose" IN ('VERIFY','RESET') AND "reminderId" IS NULL AND "recipientUserId" IS NULL AND "familyId" IS NULL)
    OR ("purpose"='REMINDER' AND "reminderId" IS NOT NULL AND "recipientUserId" IS NOT NULL AND "familyId" IS NOT NULL)) AND
  (("status"='QUEUED' AND "payload" IS NOT NULL) OR ("status" IN ('SENT','EXPIRED','FAILED','CANCELLED') AND "payload" IS NULL))
);
