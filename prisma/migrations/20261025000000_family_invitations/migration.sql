CREATE TABLE "FamilyInvitation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "familyId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "role" "FamilyRole" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "acceptedAt" TIMESTAMPTZ(3),
  "acceptedById" UUID,
  CONSTRAINT "FamilyInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FamilyInvitation_role_check" CHECK ("role" IN ('PARENT', 'VIEWER')),
  CONSTRAINT "FamilyInvitation_expiry_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "FamilyInvitation_hash_check" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "FamilyInvitation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FamilyInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FamilyInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FamilyInvitation_tokenHash_key" ON "FamilyInvitation"("tokenHash");
CREATE INDEX "FamilyInvitation_familyId_createdAt_idx" ON "FamilyInvitation"("familyId", "createdAt");
CREATE INDEX "FamilyInvitation_expiresAt_idx" ON "FamilyInvitation"("expiresAt");
-- The existing audit function records identifiers only, never the token/hash/row payload.
CREATE TRIGGER mory_audit AFTER INSERT OR UPDATE OR DELETE ON "FamilyInvitation" FOR EACH ROW EXECUTE FUNCTION mory_record_audit();
