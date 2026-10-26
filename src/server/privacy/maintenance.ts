import "server-only";
import type { PrismaClient } from "../db/generated/client";
import type { PrivateObjectStorage } from "../storage/contracts";
import { createPostgresMediaRepository } from "../repositories/postgres-media-repository";
const DAY = 86_400_000;
export const FAMILY_DELETION_GRACE_MS = DAY;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const keyPattern = new RegExp(`^families/(${uuid})/(?:events/${uuid}/${uuid}|children/${uuid}/avatars/${uuid})$`, "i");
/** Bounded cleanup, no public endpoint. Tombstones are retained for restoration/deletion reconciliation. */
export async function maintainPrivacy(db: PrismaClient, storage?: PrivateObjectStorage, now = new Date()) {
  const stats = { families: 0, users: 0, blocked: 0, failed: 0, purged: 0 };
  const media = createPostgresMediaRepository(db);
  await db.$executeRaw`INSERT INTO "WorkerCheckpoint" ("key","updatedAt") VALUES ('privacy-family-scan',now()) ON CONFLICT ("key") DO NOTHING`;
  const checkpoint = await db.workerCheckpoint.findUniqueOrThrow({ where: { key: "privacy-family-scan" } });
  const families = await db.family.findMany({ where: { ...(checkpoint.cursor ? { id: { gt: checkpoint.cursor } } : {}), deletionRequestedAt: { lte: new Date(now.getTime() - FAMILY_DELETION_GRACE_MS) } }, orderBy: { id: "asc" }, take: 10 });
  for (const family of families) {
    try {
      if (await db.mediaCleanupJob.count({ where: { familyId: family.id, completedAt: null } })) { stats.blocked++; continue; }
      if (storage) {
        const page = await storage.listObjects(undefined, `families/${family.id}/`);
        if (page.objects.length) {
          for (const object of page.objects) if (keyPattern.exec(object.key)?.[1] === family.id) await media.queueCleanup(family.id, object.key);
          stats.blocked++; continue;
        }
      } else if (await db.mediaAsset.count({ where: { familyId: family.id } }) || await db.mediaCleanupJob.count({ where: { familyId: family.id } })) { stats.blocked++; continue; }
      const removed = await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Family" WHERE "id"=${family.id}::uuid AND "deletionRequestedAt" IS NOT NULL FOR NO KEY UPDATE SKIP LOCKED`;
        if (!rows.length || await tx.mediaCleanupJob.count({ where: { familyId: family.id, completedAt: null } })) return false;
        await tx.family.delete({ where: { id: family.id } });
        await tx.deletionTombstone.updateMany({ where: { kind: "FAMILY", resourceId: family.id }, data: { completedAt: now } });
        return true;
      }, { timeout: 30_000 });
      if (removed) stats.families++;
    } catch { stats.failed++; }
  }
  await db.workerCheckpoint.update({ where: { key: "privacy-family-scan" }, data: { cursor: families.length === 10 ? families.at(-1)!.id : null } });
  const users = await db.user.findMany({ where: { deletionRequestedAt: { not: null }, memberships: { none: { role: "OWNER" } } }, orderBy: [{ deletionRequestedAt: "asc" }, { id: "asc" }], take: 100 });
  for (const user of users) {
    try {
      const removed = await db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id"=${user.id}::uuid AND "deletionRequestedAt" IS NOT NULL FOR UPDATE SKIP LOCKED`;
        if (!locked.length || await tx.familyMember.count({ where: { userId: user.id, role: "OWNER" } })) return false;
        await tx.authVerification.deleteMany({ where: { value: user.id } });
        await tx.authMailJob.deleteMany({ where: { subjectUserId: user.id } });
        await tx.user.delete({ where: { id: user.id } });
        await tx.auditLog.updateMany({ where: { actorId: user.id }, data: { actorId: null } });
        await tx.deletionTombstone.updateMany({ where: { kind: "USER", resourceId: user.id }, data: { completedAt: now } });
        return true;
      });
      if (removed) stats.users++;
    } catch { stats.failed++; }
  }
  // Metadata only. Family content is removed by the explicit deletion flow, never by age inference.
  stats.purged += await db.$executeRaw`DELETE FROM "FamilyInvitation" WHERE "id" IN (SELECT "id" FROM "FamilyInvitation" WHERE "expiresAt"<${new Date(now.getTime()-30*DAY)} ORDER BY "expiresAt" LIMIT 1000)`;
  stats.purged += await db.$executeRaw`DELETE FROM "AuditLog" WHERE "id" IN (SELECT "id" FROM "AuditLog" WHERE "createdAt"<${new Date(now.getTime()-90*DAY)} ORDER BY "createdAt" LIMIT 1000)`;
  stats.purged += await db.$executeRaw`DELETE FROM "AuthMailJob" WHERE "id" IN (SELECT "id" FROM "AuthMailJob" WHERE "status"<>'QUEUED' AND "completedAt"<${new Date(now.getTime()-30*DAY)} ORDER BY "completedAt" LIMIT 1000)`;
  stats.purged += await db.$executeRaw`DELETE FROM "AuthMailBudget" WHERE "key" IN (SELECT "key" FROM "AuthMailBudget" WHERE "startedAt"<${new Date(now.getTime()-DAY)} LIMIT 1000)`;
  stats.purged += await db.$executeRaw`DELETE FROM "AuthSession" WHERE "id" IN (SELECT "id" FROM "AuthSession" WHERE "expiresAt"<${now} LIMIT 1000)`;
  stats.purged += await db.$executeRaw`DELETE FROM "AuthVerification" WHERE "id" IN (SELECT "id" FROM "AuthVerification" WHERE "expiresAt"<${now} LIMIT 1000)`;
  stats.purged += await db.$executeRaw`DELETE FROM "MediaCleanupJob" WHERE "id" IN (SELECT "id" FROM "MediaCleanupJob" WHERE "completedAt"<${new Date(now.getTime()-30*DAY)} LIMIT 1000)`;
  stats.purged += await db.$executeRaw`DELETE FROM "AuthRateLimit" WHERE "id" IN (SELECT "id" FROM "AuthRateLimit" WHERE "lastRequest"<${BigInt(now.getTime()-DAY)} LIMIT 1000)`;
  stats.purged += await db.$executeRaw`DELETE FROM "DeletionTombstone" WHERE "id" IN (SELECT "id" FROM "DeletionTombstone" WHERE "completedAt" IS NOT NULL AND "completedAt"<${new Date(now.getTime()-90*DAY)} LIMIT 1000)`;
  return stats;
}
