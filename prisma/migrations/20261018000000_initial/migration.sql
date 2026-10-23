BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- This migration is applied transactionally, including the constraints below.

-- CreateEnum
CREATE TYPE "FamilyRole" AS ENUM ('OWNER', 'PARENT', 'VIEWER');

-- CreateEnum
CREATE TYPE "ChildLifecycle" AS ENUM ('EXPECTING', 'AFTER_BIRTH', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('female', 'male', 'other', 'unspecified');

-- CreateEnum
CREATE TYPE "CalendarRule" AS ENUM ('SAME_DAY', 'MINUS_ONE', 'MINUS_TWO');

-- CreateEnum
CREATE TYPE "LeapMonthRule" AS ENUM ('REGULAR_MONTH', 'LEAP_MONTH', 'NEXT_AVAILABLE');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('memory', 'milestone', 'health', 'activity');

-- CreateEnum
CREATE TYPE "MilestoneKind" AS ENUM ('due', 'full-month', 'first-birthday', 'birthday', 'development', 'custom');

-- CreateEnum
CREATE TYPE "MilestoneState" AS ENUM ('SUGGESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING_VERIFICATION', 'READY', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Family" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "familyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "FamilyRole" NOT NULL,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("familyId","userId")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nickname" VARCHAR(40),
    "lifecycle" "ChildLifecycle" NOT NULL,
    "dueDate" DATE,
    "birthDate" DATE,
    "birthTime" VARCHAR(5),
    "gender" "Gender",
    "calendarRule" "CalendarRule" NOT NULL DEFAULT 'SAME_DAY',
    "leapMonthRule" "LeapMonthRule" NOT NULL DEFAULT 'REGULAR_MONTH',
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trackingUntilAge" INTEGER NOT NULL DEFAULT 18,
    "dueReminderSnoozedUntil" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(5) NOT NULL DEFAULT '',
    "type" "EventType" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "reminder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneDefinition" (
    "key" VARCHAR(120) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "kind" "MilestoneKind" NOT NULL,
    "calendar" VARCHAR(24) NOT NULL,

    CONSTRAINT "MilestoneDefinition_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ChildMilestone" (
    "id" VARCHAR(200) NOT NULL,
    "familyId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "definitionKey" VARCHAR(120),
    "eventId" UUID,
    "title" VARCHAR(120) NOT NULL,
    "kind" "MilestoneKind" NOT NULL,
    "state" "MilestoneState" NOT NULL,
    "suggestedDate" DATE,
    "confirmedDate" DATE,
    "ceremonyDate" DATE,
    "needsDateConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL DEFAULT '',
    "age" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChildMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyEntry" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "eventId" UUID,
    "body" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "objectKey" VARCHAR(1024) NOT NULL,
    "contentType" VARCHAR(64) NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "eventId" UUID,
    "milestoneId" VARCHAR(200),
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaCleanupJob" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "objectKey" VARCHAR(1024) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MediaCleanupJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" UUID NOT NULL,
    "locale" VARCHAR(16) NOT NULL DEFAULT 'vi-VN',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "FamilyMember_userId_idx" ON "FamilyMember"("userId");

-- CreateIndex
CREATE INDEX "Child_familyId_createdAt_id_idx" ON "Child"("familyId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Child_familyId_id_key" ON "Child"("familyId", "id");

-- CreateIndex
CREATE INDEX "Event_familyId_childId_date_time_id_idx" ON "Event"("familyId", "childId", "date" DESC, "time" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Event_familyId_childId_id_key" ON "Event"("familyId", "childId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ChildMilestone_familyId_childId_key_key" ON "ChildMilestone"("familyId", "childId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ChildMilestone_familyId_childId_eventId_key" ON "ChildMilestone"("familyId", "childId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ChildMilestone_familyId_childId_id_key" ON "ChildMilestone"("familyId", "childId", "id");

-- CreateIndex
CREATE INDEX "JourneyEntry_familyId_childId_date_idx" ON "JourneyEntry"("familyId", "childId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_objectKey_key" ON "MediaAsset"("objectKey");

-- CreateIndex
CREATE INDEX "MediaAsset_familyId_eventId_status_idx" ON "MediaAsset"("familyId", "eventId", "status");

-- CreateIndex
CREATE INDEX "Reminder_familyId_childId_idx" ON "Reminder"("familyId", "childId");

-- CreateIndex
CREATE INDEX "Reminder_enabled_scheduledAt_idx" ON "Reminder"("enabled", "scheduledAt");

-- CreateIndex
CREATE INDEX "MediaCleanupJob_completedAt_createdAt_idx" ON "MediaCleanupJob"("completedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_familyId_childId_fkey" FOREIGN KEY ("familyId", "childId") REFERENCES "Child"("familyId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ChildMilestone" ADD CONSTRAINT "ChildMilestone_familyId_childId_fkey" FOREIGN KEY ("familyId", "childId") REFERENCES "Child"("familyId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ChildMilestone" ADD CONSTRAINT "ChildMilestone_definitionKey_fkey" FOREIGN KEY ("definitionKey") REFERENCES "MilestoneDefinition"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildMilestone" ADD CONSTRAINT "ChildMilestone_familyId_childId_eventId_fkey" FOREIGN KEY ("familyId", "childId", "eventId") REFERENCES "Event"("familyId", "childId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "JourneyEntry" ADD CONSTRAINT "JourneyEntry_familyId_childId_fkey" FOREIGN KEY ("familyId", "childId") REFERENCES "Child"("familyId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "JourneyEntry" ADD CONSTRAINT "JourneyEntry_familyId_childId_eventId_fkey" FOREIGN KEY ("familyId", "childId", "eventId") REFERENCES "Event"("familyId", "childId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_familyId_childId_eventId_fkey" FOREIGN KEY ("familyId", "childId", "eventId") REFERENCES "Event"("familyId", "childId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_familyId_childId_fkey" FOREIGN KEY ("familyId", "childId") REFERENCES "Child"("familyId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_familyId_childId_eventId_fkey" FOREIGN KEY ("familyId", "childId", "eventId") REFERENCES "Event"("familyId", "childId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_familyId_childId_milestoneId_fkey" FOREIGN KEY ("familyId", "childId", "milestoneId") REFERENCES "ChildMilestone"("familyId", "childId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MediaCleanupJob" ADD CONSTRAINT "MediaCleanupJob_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Domain invariants also apply to SQL clients outside the application.
ALTER TABLE "Child" ADD CONSTRAINT "Child_lifecycle_dates_check" CHECK (
  ("lifecycle" <> 'EXPECTING' OR ("dueDate" IS NOT NULL AND "birthDate" IS NULL)) AND
  ("lifecycle" <> 'AFTER_BIRTH' OR ("birthDate" IS NOT NULL AND length(trim("name")) > 0)) AND
  ("birthDate" IS NOT NULL OR "dueDate" IS NOT NULL)
);
ALTER TABLE "Child" ADD CONSTRAINT "Child_settings_check" CHECK (
  "trackingUntilAge" BETWEEN 2 AND 100 AND
  ("birthTime" IS NULL OR "birthTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND
  ("birthDate" IS NULL OR "birthDate" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AND
  ("lifecycle" NOT IN ('PAUSED', 'ENDED') OR NOT "reminderEnabled")
);
ALTER TABLE "Event" ADD CONSTRAINT "Event_content_check" CHECK (
  length(trim("title")) BETWEEN 2 AND 120 AND length("description") <= 5000 AND
  ("time" = '' OR "time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND "updatedAt" >= "createdAt"
);
ALTER TABLE "ChildMilestone" ADD CONSTRAINT "ChildMilestone_content_check" CHECK (
  length(trim("title")) BETWEEN 1 AND 120 AND length("description") <= 5000 AND
  ("age" IS NULL OR "age" BETWEEN 0 AND 100) AND
  ("state" NOT IN ('CONFIRMED','COMPLETED') OR "confirmedDate" IS NOT NULL OR "ceremonyDate" IS NOT NULL)
);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_metadata_check" CHECK (
  "contentType" IN ('image/jpeg','image/png','image/webp','image/avif') AND
  "byteLength" BETWEEN 1 AND 8388608 AND
  ("status" <> 'READY' OR ("width" IS NOT NULL AND "height" IS NOT NULL AND
    "width" > 0 AND "height" > 0 AND "width"::bigint * "height"::bigint <= 40000000))
);
COMMIT;
