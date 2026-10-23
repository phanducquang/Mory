import "server-only";
import { setAuditActor, assertFamilyWrite } from "../db/audit";
import { z } from "zod";
import type { PrismaClient, Prisma } from "../db/generated/client";
import { MAX_EVENT_IMAGES, MAX_IMAGE_BYTES, UploadLimitError, type MediaRepository, type MediaAssetRecord } from "../storage/contracts";
import { MediaQuotaError, PersistenceConflictError, ResourceNotFoundError } from "../db/errors";

type Tx = Prisma.TransactionClient;
const uuid = z.uuid();
const options = { maxWait: 10_000, timeout: 15_000 };
async function queue(tx: Tx, familyId: string, objectKey: string, notBefore?: Date) {
  if (!await tx.mediaCleanupJob.findFirst({ where: { familyId, objectKey, completedAt: null } }))
    await tx.mediaCleanupJob.create({ data: { familyId, objectKey, notBefore } });
}
async function lockedAsset(tx: Tx, familyId: string, id: string) {
  uuid.parse(familyId); uuid.parse(id);
  const first = await tx.mediaAsset.findFirst({ where: { familyId, id } });
  if (!first) throw new ResourceNotFoundError();
  await tx.$queryRaw`SELECT "id" FROM "Child" WHERE "familyId" = ${familyId}::uuid AND "id" = ${first.childId}::uuid FOR UPDATE`;
  if (first.eventId) await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "familyId" = ${familyId}::uuid AND "id" = ${first.eventId}::uuid FOR UPDATE`;
  const rows = await tx.$queryRaw<MediaAssetRecord[]>`SELECT * FROM "MediaAsset" WHERE "familyId" = ${familyId}::uuid AND "id" = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw new ResourceNotFoundError();
  return rows[0];
}
export function createPostgresMediaRepository(db: PrismaClient, actorId?: string): MediaRepository {
  const transact = <T>(callback: (tx: Tx) => Promise<T>, transactionOptions = options) =>
    db.$transaction(async (tx) => { await setAuditActor(tx, actorId); return callback(tx); }, transactionOptions);
  return {
    async consumeBudget(userId) {
      uuid.parse(userId);
      const rows = await db.$queryRaw<{ count: number }[]>`
        INSERT INTO "MediaUploadBudget" ("userId", "count", "startedAt") VALUES (${userId}::uuid, 1, now())
        ON CONFLICT ("userId") DO UPDATE SET
          "count" = CASE WHEN "MediaUploadBudget"."startedAt" <= now() - interval '1 minute' THEN 1 ELSE LEAST(31, "MediaUploadBudget"."count" + 1) END,
          "startedAt" = CASE WHEN "MediaUploadBudget"."startedAt" <= now() - interval '1 minute' THEN now() ELSE "MediaUploadBudget"."startedAt" END
        RETURNING "count"`;
      if (rows[0].count > 30) throw new UploadLimitError();
    },
    async reservePending(asset, maximumForEvent) {
      const input = z.object({ id: uuid, familyId: uuid, childId: uuid, eventId: uuid.nullable(), purpose: z.enum(["EVENT", "AVATAR"]),
        objectKey: z.string().max(1024), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
        byteLength: z.number().int().min(1).max(MAX_IMAGE_BYTES), status: z.literal("PENDING_VERIFICATION"), expiresAt: z.date() }).parse(asset);
      z.number().int().min(1).max(MAX_EVENT_IMAGES).parse(maximumForEvent);
      const key = input.purpose === "EVENT" && input.eventId
        ? `families/${input.familyId}/events/${input.eventId}/${input.id}`
        : input.purpose === "AVATAR" && !input.eventId ? `families/${input.familyId}/children/${input.childId}/avatars/${input.id}` : "";
      if (key !== input.objectKey) throw new Error("Object key không hợp lệ.");
      await transact(async (tx) => {
        const children = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Child" WHERE "familyId" = ${input.familyId}::uuid AND "id" = ${input.childId}::uuid FOR UPDATE`;
        if (!children.length) throw new ResourceNotFoundError();
        await assertFamilyWrite(tx, input.familyId, actorId);
        if (input.eventId) {
          const rows = await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "familyId" = ${input.familyId}::uuid AND "childId" = ${input.childId}::uuid AND "id" = ${input.eventId}::uuid FOR UPDATE`;
          if (!Array.isArray(rows) || !rows.length) throw new ResourceNotFoundError();
        }
        const count = await tx.mediaAsset.count({ where: { familyId: input.familyId, childId: input.childId, purpose: input.purpose,
          ...(input.eventId ? { eventId: input.eventId, status: { not: "REJECTED" } } : { status: "PENDING_VERIFICATION" }) } });
        if (count >= (input.purpose === "EVENT" ? maximumForEvent : 1)) throw new MediaQuotaError();
        // Expiry is server-owned; callers cannot reserve indefinitely.
        await tx.mediaAsset.create({ data: { ...input, expiresAt: new Date(Date.now() + 300_000) } });
      }, options);
    },
    async findById(familyId, id) {
      uuid.parse(familyId); uuid.parse(id);
      const asset = await db.mediaAsset.findFirst({ where: { familyId, id } });
      if (asset?.purpose === "AVATAR" && asset.status === "READY" &&
        !await db.child.findFirst({ where: { familyId, id: asset.childId, avatarAssetId: id }, select: { id: true } })) return null;
      return asset;
    },
    async markReady(familyId, id, verified) {
      const value = z.object({ width: z.number().int().positive(), height: z.number().int().positive(), byteLength: z.number().int().positive().max(MAX_IMAGE_BYTES) })
        .refine((v) => v.width * v.height <= 40_000_000).parse(verified);
      await transact(async (tx) => {
        const asset = await lockedAsset(tx, familyId, id);
        await assertFamilyWrite(tx, familyId, actorId);
        if (asset.status === "READY") return;
        if (asset.status !== "PENDING_VERIFICATION" || asset.expiresAt <= new Date()) throw new PersistenceConflictError();
        await tx.mediaAsset.update({ where: { id }, data: { ...value, contentType: "image/webp", status: "READY" } });
        if (asset.purpose === "AVATAR") {
          const child = await tx.child.findUniqueOrThrow({ where: { id: asset.childId } });
          await tx.child.update({ where: { id: child.id }, data: { avatarAssetId: id } });
          if (child.avatarAssetId && child.avatarAssetId !== id) {
            const old = await tx.mediaAsset.update({ where: { id: child.avatarAssetId }, data: { status: "REJECTED" } });
            await queue(tx, familyId, old.objectKey);
          }
        }
      }, options);
    },
    async markRejected(familyId, id) {
      try {
        return await transact(async (tx) => {
          const asset = await lockedAsset(tx, familyId, id);
          if (asset.status !== "PENDING_VERIFICATION") return false;
          await tx.mediaAsset.update({ where: { id }, data: { status: "REJECTED" } });
          await queue(tx, familyId, asset.objectKey, asset.expiresAt);
          return true;
        }, options);
      } catch (error) { if (error instanceof ResourceNotFoundError) return false; throw error; }
    },
    async remove(familyId, id) {
      await transact(async (tx) => {
        const asset = await lockedAsset(tx, familyId, id);
        await assertFamilyWrite(tx, familyId, actorId);
        await tx.child.updateMany({ where: { familyId, avatarAssetId: id }, data: { avatarAssetId: null } });
        await tx.mediaAsset.update({ where: { id }, data: { status: "REJECTED" } });
        await queue(tx, familyId, asset.objectKey, asset.status === "PENDING_VERIFICATION" ? asset.expiresAt : undefined);
      }, options);
    },
    async queueCleanup(familyId, objectKey, notBefore) { await transact((tx) => queue(tx, familyId, objectKey, notBefore)); },
  };
}
