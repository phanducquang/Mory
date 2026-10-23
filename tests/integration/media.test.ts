import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import pg from "pg";
import { S3Client, CreateBucketCommand, PutBucketVersioningCommand, ListObjectVersionsCommand, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { BACKUP_LOCK } from "@/server/backup/lock";
vi.mock("server-only", () => ({}));
import { createDatabaseClient } from "@/server/db/client";
import { createDatabaseAuthorization } from "@/server/db/authorization";
import { createPostgresMediaRepository } from "@/server/repositories/postgres-media-repository";
import { createPostgresJourneyRepository } from "@/server/repositories/postgres-journey-repository";
import { createMediaService } from "@/server/services/media-service";
import { readStorageConfiguration } from "@/server/storage/config";
import { createS3Storage } from "@/server/storage/s3";
import { imageVerifier } from "@/server/storage/image-verifier";
import { maintainMedia } from "@/server/storage/maintenance";
import type { PrivateObjectStorage } from "@/server/storage/contracts";
if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use npm run test:media.");
const db = createDatabaseClient();
const media = createPostgresMediaRepository(db);
const authorization = createDatabaseAuthorization(db);
const repository = createPostgresJourneyRepository(db);
const families: string[] = []; const users: string[] = [];
const storage = () => createS3Storage(readStorageConfiguration());
async function fixture() {
  const family = await db.family.create({ data: { name: "Media family" } }); families.push(family.id);
  const user = await db.user.create({ data: { displayName: "Media parent" } }); users.push(user.id);
  await db.familyMember.create({ data: { familyId: family.id, userId: user.id, role: "OWNER" } });
  const child = await db.child.create({ data: { familyId: family.id, name: "Bé ảnh", lifecycle: "AFTER_BIRTH", birthDate: new Date("2024-02-10Z") } });
  const event = await db.event.create({ data: { familyId: family.id, childId: child.id, title: "Ảnh riêng tư", date: new Date("2024-03-01Z"), type: "memory" } });
  const session = { userId: user.id, familyId: family.id };
  const store = storage();
  const service = (override: Partial<PrivateObjectStorage> = {}) => createMediaService({ sessions: { requireSession: async () => session }, authorization, media, storage: { ...store, ...override }, verifier: imageVerifier });
  const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: "pink" } }).png().toBuffer();
  const upload = (purpose: "EVENT" | "AVATAR" = "EVENT", override: Partial<PrivateObjectStorage> = {}) => service(override).upload(purpose, purpose === "EVENT" ? event.id : child.id, "image/png", png.length, async () => png);
  return { family, user, child, event, session, store, service, png, upload };
}
afterAll(async () => {
  await db.child.updateMany({ where: { familyId: { in: families } }, data: { avatarAssetId: null } });
  await db.mediaCleanupJob.deleteMany({ where: { familyId: { in: families } } });
  await db.family.deleteMany({ where: { id: { in: families } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
describe.skipIf(process.env.MORY_MEDIA_ENABLED !== "true")("private MinIO media lifecycle", () => {
  it("defers physical deletion during a backup snapshot", async () => {
    const f=await fixture(); const uploaded=await f.upload(); const asset=await db.mediaAsset.findUniqueOrThrow({where:{id:uploaded.id}});
    await f.service().remove(uploaded.id);
    const snapshot=new pg.Client({connectionString:process.env.DATABASE_URL});await snapshot.connect();
    try { await snapshot.query("SELECT pg_advisory_lock_shared($1)",[BACKUP_LOCK]);
      await maintainMedia(db,f.store,"backup-lock-test");expect(await f.store.getObject(asset.objectKey)).toBeInstanceOf(Buffer);
      expect(await db.mediaCleanupJob.findFirst({where:{objectKey:asset.objectKey,completedAt:null}})).not.toBeNull();
    } finally {await snapshot.end();}
    await db.mediaCleanupJob.updateMany({where:{objectKey:asset.objectKey},data:{notBefore:new Date(0)}});
    await maintainMedia(db,f.store,"backup-lock-test");await expect(f.store.getObject(asset.objectKey)).rejects.toThrow();
  });
  it("physically removes all historical versions and delete markers", async () => {
    const cfg=readStorageConfiguration();const bucket=`mory-versions-${randomUUID()}`;
    const client=new S3Client({endpoint:cfg.endpoint,region:cfg.region,forcePathStyle:true,credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey}});
    const objectKey=`families/${randomUUID()}/children/${randomUUID()}/avatars/${randomUUID()}`;const store=createS3Storage({...cfg,bucket});
    try {await client.send(new CreateBucketCommand({Bucket:bucket}));await client.send(new PutBucketVersioningCommand({Bucket:bucket,VersioningConfiguration:{Status:"Enabled"}}));
      await store.putObject(objectKey,Buffer.from("private-version"));
      await expect(store.assertEmptyNamespace!()).rejects.toThrow();await store.deleteObject(objectKey);
      const versions=await client.send(new ListObjectVersionsCommand({Bucket:bucket}));expect(versions.Versions??[]).toHaveLength(0);expect(versions.DeleteMarkers??[]).toHaveLength(0);
      await store.assertEmptyNamespace!();
    }finally{await store.deleteObject(objectKey).catch(()=>{});await client.send(new DeleteBucketCommand({Bucket:bucket}));client.destroy();}
  });
  it("stores decoded WebP privately and scopes reads and writes to the current family and role", async () => {
    const a = await fixture(); const b = await fixture(); const result = await a.upload();
    const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: result.id } });
    expect(asset).toMatchObject({ status: "READY", contentType: "image/webp", width: 64, height: 48 });
    expect((await repository.findEvent(a.family.id, a.event.id))?.images).toEqual([result.url]);
    expect((await sharp(await a.service().read(result.id)).metadata()).format).toBe("webp");
    const anonymous = await fetch(`${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${asset.objectKey}`);
    expect(anonymous.status).toBe(403);
    await expect(b.service().read(result.id)).rejects.toThrow();
    await expect(b.service().remove(result.id)).rejects.toThrow();
    await db.familyMember.update({ where: { familyId_userId: a.session }, data: { role: "VIEWER" } });
    await expect(a.service().read(result.id)).resolves.toBeInstanceOf(Buffer);
    await expect(a.upload()).rejects.toThrow();
    await expect(a.service().remove(result.id)).rejects.toThrow();
    await db.familyMember.delete({ where: { familyId_userId: a.session } });
    await expect(a.service().read(result.id)).rejects.toThrow();
  });
  it("makes stored objects immutable and swaps avatars only after successful verification", async () => {
    const f = await fixture(); const first = await f.upload("AVATAR");
    const old = await db.mediaAsset.findUniqueOrThrow({ where: { id: first.id } });
    await expect(f.store.putObject(old.objectKey, f.png)).rejects.toThrow();
    const broken = Buffer.from("not a PNG");
    await expect(f.service().upload("AVATAR", f.child.id, "image/png", broken.length, async () => broken)).rejects.toThrow();
    expect((await db.child.findUniqueOrThrow({ where: { id: f.child.id } })).avatarAssetId).toBe(first.id);
    const second = await f.upload("AVATAR");
    expect((await repository.findChild(f.family.id, f.child.id))?.avatar).toBe(second.url);
    await expect(f.service().read(first.id)).rejects.toThrow();
    expect(await db.mediaCleanupJob.findFirst({ where: { objectKey: old.objectKey } })).not.toBeNull();
    // Profile lifecycle writes preserve the pointer and never serialize it as an arbitrary input URL.
    await repository.setTrackingState(f.family.id, f.child.id, "PAUSED");
    expect((await repository.findChild(f.family.id, f.child.id))?.avatar).toBe(second.url);
  });
  it("immediately revokes removed images and physically deletes them in a leased cleanup pass", async () => {
    const f = await fixture(); const result = await f.upload();
    const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: result.id } });
    await f.service().remove(result.id);
    await expect(f.service().read(result.id)).rejects.toThrow();
    await Promise.all([maintainMedia(db, f.store, "cleanup-test"), maintainMedia(db, f.store, "cleanup-test")]);
    await expect(f.store.getObject(asset.objectKey)).rejects.toThrow();
    expect(await db.mediaCleanupJob.findFirst({ where: { objectKey: asset.objectKey, completedAt: { not: null } } })).not.toBeNull();
  });
  it("expires abandoned reservations and retries deletion failures without losing outbox jobs", async () => {
    const f = await fixture(); const id = randomUUID(); const objectKey = `families/${f.family.id}/events/${f.event.id}/${id}`;
    await media.reservePending({ id, familyId: f.family.id, childId: f.child.id, eventId: f.event.id, purpose: "EVENT", objectKey, contentType: "image/png", byteLength: f.png.length, status: "PENDING_VERIFICATION", expiresAt: new Date() }, 12);
    await f.store.putObject(objectKey, (await imageVerifier.verify(f.png, "image/png", "EVENT")).bytes);
    await db.mediaAsset.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(media.markReady(f.family.id, id, { width: 64, height: 48, byteLength: f.png.length })).rejects.toThrow();
    const failed = await maintainMedia(db, { ...f.store, deleteObject: async () => { throw new Error("Storage down"); } }, "expiry-test");
    expect(failed.expired).toBeGreaterThanOrEqual(1); expect(failed.failed).toBeGreaterThanOrEqual(1);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id } })).status).toBe("REJECTED");
    const job = await db.mediaCleanupJob.findFirstOrThrow({ where: { objectKey, completedAt: null } });
    expect(job).toMatchObject({ attempts: 1, leaseToken: null, leaseUntil: null }); expect(job.notBefore.getTime()).toBeGreaterThan(Date.now());
    await db.mediaCleanupJob.update({ where: { id: job.id }, data: { notBefore: new Date(0) } });
    await maintainMedia(db, f.store, "expiry-test");
    await expect(f.store.getObject(objectKey)).rejects.toThrow();
  });
  it("cleans up a PUT that finishes after its event was deleted", async () => {
    const f = await fixture(); let key = "";
    await expect(f.upload("EVENT", { putObject: async (objectKey, bytes) => { key = objectKey; await repository.deleteEvent(f.family.id, f.event.id); await f.store.putObject(objectKey, bytes); } })).rejects.toThrow();
    expect(await db.mediaAsset.findUnique({ where: { objectKey: key } })).toBeNull();
    const job = await db.mediaCleanupJob.findFirstOrThrow({ where: { objectKey: key, completedAt: null } });
    expect(job.notBefore.getTime()).toBeGreaterThan(Date.now());
    await db.mediaCleanupJob.update({ where: { id: job.id }, data: { notBefore: new Date(0) } });
    await maintainMedia(db, f.store, "delete-race"); await expect(f.store.getObject(key)).rejects.toThrow();
  });
  it("reconciles old orphan keys with a persisted cursor and preserves READY and unknown keys", async () => {
    const f = await fixture(); const result = await f.upload();
    const ready = await db.mediaAsset.findUniqueOrThrow({ where: { id: result.id } });
    const orphan = `families/${f.family.id}/events/${f.event.id}/${randomUUID()}`;
    await f.store.putObject(orphan, (await imageVerifier.verify(f.png, "image/png", "EVENT")).bytes);
    const list = vi.fn().mockResolvedValueOnce({ objects: [{ key: ready.objectKey, modified: new Date(0) }, { key: orphan, modified: new Date(0) }, { key: `families/${f.family.id}/unrelated.txt`, modified: new Date(0) }], cursor: "page-two" }).mockResolvedValueOnce({ objects: [] });
    const store = { ...f.store, listObjects: list };
    const pass = await maintainMedia(db, store, "orphan-test"); expect(pass.queued).toBe(1);
    await expect(f.store.getObject(orphan)).rejects.toThrow(); await expect(f.service().read(result.id)).resolves.toBeInstanceOf(Buffer);
    await maintainMedia(db, store, "orphan-test"); expect(list).toHaveBeenLastCalledWith("page-two");
  });
  it("enforces the database upload budget across concurrent instances", async () => {
    const f = await fixture(); const results = await Promise.allSettled(Array.from({ length: 35 }, () => media.consumeBudget(f.user.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(30);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(5);
  });
});
