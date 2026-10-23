-- DropForeignKey
ALTER TABLE "MediaCleanupJob" DROP CONSTRAINT "MediaCleanupJob_familyId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletionRequestedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "deletionRequestedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "actorId" UUID,
    "resourceKind" VARCHAR(32) NOT NULL,
    "resourceId" VARCHAR(200) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionTombstone" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "resourceId" UUID NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeletionTombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_familyId_createdAt_id_idx" ON "AuditLog"("familyId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "DeletionTombstone_completedAt_requestedAt_idx" ON "DeletionTombstone"("completedAt", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeletionTombstone_kind_resourceId_key" ON "DeletionTombstone"("kind", "resourceId");

-- CreateIndex
CREATE INDEX "AuthMailJob_familyId_recipientUserId_idx" ON "AuthMailJob"("familyId", "recipientUserId");

-- CreateIndex
CREATE INDEX "AuthMailJob_familyId_reminderId_idx" ON "AuthMailJob"("familyId", "reminderId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "DeletionTombstone" ADD CONSTRAINT "DeletionTombstone_kind_check" CHECK ("kind" IN ('FAMILY','USER'));

-- Audit stores identifiers and operation only, never row values or auth secrets.
CREATE FUNCTION mory_record_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb; family_uuid uuid; actor_uuid uuid; resource text;
BEGIN
  IF TG_OP='DELETE' THEN item=to_jsonb(OLD); ELSE item=to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME='Family' THEN family_uuid=(item->>'id')::uuid;
  ELSE family_uuid=(item->>'familyId')::uuid; END IF;
  -- Cascading hard-delete of a family removes its audit history as well.
  IF NOT EXISTS (SELECT 1 FROM "Family" WHERE "id"=family_uuid) THEN RETURN NULL; END IF;
  actor_uuid=NULLIF(current_setting('mory.actor_id',true),'')::uuid;
  resource=CASE WHEN TG_TABLE_NAME='FamilyMember' THEN family_uuid::text ELSE item->>'id' END;
  INSERT INTO "AuditLog" ("id","familyId","actorId","resourceKind","resourceId","action")
    VALUES (gen_random_uuid(),family_uuid,actor_uuid,TG_TABLE_NAME,resource,TG_OP);
  RETURN NULL;
END $$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['Family','FamilyMember','Child','Event','ChildMilestone','MediaAsset'] LOOP
    EXECUTE format('CREATE TRIGGER mory_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION mory_record_audit()',table_name);
  END LOOP;
END $$;

-- Serialize session creation with account deletion, inside the auth transaction.
CREATE FUNCTION mory_require_active_session_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE requested timestamptz;
BEGIN
  SELECT "deletionRequestedAt" INTO requested FROM "User" WHERE "id"=NEW."userId" FOR SHARE;
  IF requested IS NOT NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mory_active_session_user BEFORE INSERT ON "AuthSession" FOR EACH ROW EXECUTE FUNCTION mory_require_active_session_user();
