ALTER TABLE "AuthMailJob" ADD COLUMN "verificationHash" VARCHAR(64);
CREATE UNIQUE INDEX "AuthMailJob_verificationHash_key" ON "AuthMailJob"("verificationHash");
-- A password change invalidates every outstanding reset capability in the same transaction.
CREATE FUNCTION mory_invalidate_password_capabilities() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."password" IS DISTINCT FROM NEW."password" THEN
    DELETE FROM "AuthVerification" WHERE "value"=NEW."userId"::text;
    UPDATE "AuthMailJob" SET "status"='CANCELLED',"payload"=NULL,"completedAt"=now(),"leaseToken"=NULL,"leaseUntil"=NULL
      WHERE "purpose"='RESET' AND "subjectUserId"=NEW."userId" AND "status"='QUEUED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mory_password_capabilities BEFORE UPDATE OF "password" ON "AuthAccount" FOR EACH ROW EXECUTE FUNCTION mory_invalidate_password_capabilities();
