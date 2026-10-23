import "server-only";
import { BACKUP_LOCK } from "../backup/lock";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "../db/generated/client";
import type { PrivateObjectStorage } from "./contracts";
import { createPostgresMediaRepository } from "../repositories/postgres-media-repository";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ownedKey = new RegExp(`^families/(${uuid})/(?:events/${uuid}/${uuid}|children/${uuid}/avatars/${uuid})$`, "i");
/** One bounded pass, safe to invoke concurrently. Run repeatedly via an operator-owned scheduler. */
export async function maintainMedia(db: PrismaClient, storage: PrivateObjectStorage, namespace: string) {
  const media = createPostgresMediaRepository(db);
  const stats = { expired: 0, deleted: 0, failed: 0, scanned: 0, queued: 0 };
  const expired = await db.mediaAsset.findMany({ where: { status: "PENDING_VERIFICATION", expiresAt: { lte: new Date() } },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: 100 });
  for (const asset of expired) if (await media.markRejected(asset.familyId, asset.id)) stats.expired++;
  const stateKey = `s3-scan:${createHash("sha256").update(namespace).digest("hex")}`;
  // Lease the scan cursor across workers, without holding a DB transaction over object-storage I/O.
  const scanToken = randomUUID();
  await db.$executeRaw`INSERT INTO "MediaMaintenanceState" ("key", "updatedAt") VALUES (${stateKey}, now()) ON CONFLICT ("key") DO NOTHING`;
  const claim = await db.mediaMaintenanceState.updateMany({ where: { key: stateKey, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
    data: { leaseToken: scanToken, leaseUntil: new Date(Date.now() + 300_000) } });
  if (claim.count) {
    try {
      const state = await db.mediaMaintenanceState.findUniqueOrThrow({ where: { key: stateKey } });
      const page = await storage.listObjects(state.cursor ?? undefined);
      for (const object of page.objects) {
        stats.scanned++;
        const familyId = ownedKey.exec(object.key)?.[1];
        if (!familyId || object.modified.getTime() > Date.now() - 3_600_000) continue;
        const asset = await db.mediaAsset.findUnique({ where: { objectKey: object.key } });
        if (asset && (asset.status === "READY" || asset.status === "PENDING_VERIFICATION")) continue;
        if (!await db.family.findUnique({ where: { id: familyId }, select: { id: true } }) && !await db.deletionTombstone.findUnique({ where: { kind_resourceId: { kind: "FAMILY", resourceId: familyId } } })) continue;
        await media.queueCleanup(familyId, object.key); stats.queued++;
      }
      await db.mediaMaintenanceState.updateMany({ where: { key: stateKey, leaseToken: scanToken }, data: { cursor: page.cursor ?? null, leaseToken: null, leaseUntil: null } });
    } catch {
      // Restart a stale/invalid S3 continuation token next pass; no deletions are inferred from list failure.
      await db.mediaMaintenanceState.updateMany({ where: { key: stateKey, leaseToken: scanToken }, data: { cursor: null, leaseToken: null, leaseUntil: null } });
      stats.failed++;
    }
  }
  const token = randomUUID();
  const jobs = await db.$queryRaw<{ id: string; objectKey: string; attempts: number }[]>`
    UPDATE "MediaCleanupJob" SET "leaseToken" = ${token}::uuid, "leaseUntil" = now() + interval '5 minutes', "attempts" = "attempts" + 1
    WHERE "id" IN (SELECT "id" FROM "MediaCleanupJob" WHERE "completedAt" IS NULL AND "notBefore" <= now()
      AND ("leaseUntil" IS NULL OR "leaseUntil" < now()) ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 20)
    RETURNING "id", "objectKey", "attempts"`;
  for (const job of jobs) {
    try {
      if (!ownedKey.test(job.objectKey)) throw new Error("Unknown object namespace.");
      const active = await db.mediaAsset.findUnique({ where: { objectKey: job.objectKey } });
      if (active?.status === "PENDING_VERIFICATION") {
        await db.mediaCleanupJob.updateMany({ where: { id: job.id, leaseToken: token }, data: { notBefore: new Date(Math.max(active.expiresAt.getTime(), Date.now() + 60_000)), leaseToken: null, leaseUntil: null } });
        continue;
      }
      if (active?.status !== "READY") {
        const deleted = await db.$transaction(async (tx) => {
          const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${BACKUP_LOCK}) AS locked`;
          if (!lock.locked) return false;
          await storage.deleteObject(job.objectKey); return true;
        }, { timeout: 120_000 });
        if (!deleted) {
          await db.mediaCleanupJob.updateMany({ where: { id: job.id, leaseToken: token }, data: { notBefore: new Date(Date.now()+60_000), leaseToken: null, leaseUntil: null } });
          continue;
        }
        stats.deleted++;
      }
      await db.mediaCleanupJob.updateMany({ where: { id: job.id, leaseToken: token }, data: { completedAt: new Date(), leaseToken: null, leaseUntil: null } });
    } catch {
      stats.failed++;
      await db.mediaCleanupJob.updateMany({ where: { id: job.id, leaseToken: token }, data: {
        notBefore: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.min(job.attempts, 7))), leaseToken: null, leaseUntil: null } });
    }
  }
  return stats;
}
