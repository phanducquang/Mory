-- CreateTable
CREATE TABLE "AuthMailJob" (
    "id" UUID NOT NULL,
    "purpose" VARCHAR(16) NOT NULL,
    "payload" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "notBefore" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AuthMailJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthMailBudget" (
    "key" VARCHAR(100) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastQueuedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AuthMailBudget_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AuthMailJob_status_notBefore_leaseUntil_idx" ON "AuthMailJob"("status", "notBefore", "leaseUntil");

ALTER TABLE "AuthMailJob" ADD CONSTRAINT "AuthMailJob_state_check" CHECK (
  "purpose" IN ('VERIFY','RESET') AND "attempts" >= 0 AND
  (("status" = 'QUEUED' AND "payload" IS NOT NULL) OR ("status" IN ('SENT','EXPIRED','FAILED') AND "payload" IS NULL))
);
ALTER TABLE "AuthMailBudget" ADD CONSTRAINT "AuthMailBudget_count_check" CHECK ("count" >= 0 AND "count" <= 5);
