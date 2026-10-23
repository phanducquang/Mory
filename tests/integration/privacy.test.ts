import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDatabaseClient } from "@/server/db/client";
import { createDatabaseAuthorization } from "@/server/db/authorization";
import { createPrivacyService } from "@/server/privacy/service";
import { maintainPrivacy } from "@/server/privacy/maintenance";
import { createPostgresJourneyRepository } from "@/server/repositories/postgres-journey-repository";
import { createPostgresMediaRepository } from "@/server/repositories/postgres-media-repository";
import { readFamilyAudit } from "@/server/privacy/audit-service";
import { consumeReauthenticationBudget } from "@/server/privacy/reauthenticate";
import { setAuditActor } from "@/server/db/audit";
if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use disposable DB runner.");
const db = createDatabaseClient(); const authorization = createDatabaseAuthorization(db);
const familyIds: string[] = []; const userIds: string[] = [];
async function fixture() {
  const family = await db.family.create({ data: { name: "PRIVATE_FAMILY_NAME" } }); familyIds.push(family.id);
  const user = await db.user.create({ data: { displayName: "PRIVATE_USER", email: `${randomUUID()}@example.test`, emailVerified: true } }); userIds.push(user.id);
  await db.familyMember.create({ data: { familyId: family.id, userId: user.id, role: "OWNER" } });
  const child = await db.child.create({ data: { familyId: family.id, name: "PRIVATE_CHILD", lifecycle: "AFTER_BIRTH", birthDate: new Date("2024-01-01Z") } });
  const session = { familyId: family.id, userId: user.id };
  return { family, user, child, session, privacy: createPrivacyService(db, authorization, user.id), repo: createPostgresJourneyRepository(db, user.id) };
}
async function cleanup() {
  await db.child.updateMany({ where: { familyId: { in: familyIds } }, data: { avatarAssetId: null } });
  await db.family.deleteMany({ where: { id: { in: familyIds } } }); await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.mediaCleanupJob.deleteMany({ where: { familyId: { in: familyIds } } });
  await db.deletionTombstone.deleteMany({ where: { resourceId: { in: [...familyIds, ...userIds] } } });
  await db.authRateLimit.deleteMany({ where: { key: { in: userIds.map((id) => `reauth:${id}`) } } });
  await db.workerCheckpoint.deleteMany({ where: { key: "privacy-family-scan" } }); familyIds.length=0; userIds.length=0;
}
beforeEach(cleanup); afterAll(async () => { await cleanup(); await db.$disconnect(); });
describe("privacy and transactional audit", () => {
  it("audits committed operations with server actor, rolls back failed writes, and never copies private content", async () => {
    const f = await fixture(); await f.repo.updateChild(f.family.id, { id: f.child.id, name: "CHANGED_PRIVATE_NAME", lifecycle: "AFTER_BIRTH", birthDate: "2024-01-01" });
    const logs = await db.auditLog.findMany({ where: { familyId: f.family.id } });
    expect(logs.some((l) => l.resourceKind === "Child" && l.actorId === f.user.id && l.action === "UPDATE")).toBe(true);
    expect(JSON.stringify(logs)).not.toMatch(/PRIVATE|2024-01-01|example.test/);
    const count = logs.length;
    await expect(db.$transaction(async (tx) => { await setAuditActor(tx, f.user.id); await tx.child.update({ where: { id: f.child.id }, data: { name: "rollback" } }); throw new Error("rollback"); })).rejects.toThrow();
    expect(await db.auditLog.count({ where: { familyId: f.family.id } })).toBe(count);
  });
  it("paginates audit within family and denies viewers / foreign cursors", async () => {
    const a = await fixture(); const b = await fixture();
    for (let i=0;i<30;i++) await a.repo.updateChild(a.family.id, { id:a.child.id, name:`Child ${i}`, lifecycle:"AFTER_BIRTH", birthDate:"2024-01-01" });
    const page = await readFamilyAudit(db, authorization, a.session); expect(page.entries).toHaveLength(25); expect(page.nextCursor).toBeTruthy();
    const next = await readFamilyAudit(db, authorization, a.session, page.nextCursor); expect(next.entries.length).toBeGreaterThan(0); expect(next.entries.some((e) => page.entries.some((p) => p.id===e.id))).toBe(false);
    const foreign = await db.auditLog.findFirstOrThrow({ where: { familyId:b.family.id } });
    await expect(readFamilyAudit(db, authorization, a.session, foreign.id)).rejects.toThrow();
    await db.familyMember.update({ where:{familyId_userId:a.session},data:{role:"VIEWER"} });
    await expect(readFamilyAudit(db, authorization, a.session)).rejects.toThrow();
    await expect(a.privacy.deleteFamily(a.family.id)).rejects.toThrow();
    await expect(a.repo.updateChild(a.family.id,{id:a.child.id,name:"forbidden",lifecycle:"AFTER_BIRTH",birthDate:"2024-01-01"})).rejects.toThrow();
  });
  it("requires explicit shared-family deletion or ownership transfer, then preserves the remaining owner's family", async () => {
    const a=await fixture();const b=await fixture();
    await db.familyMember.create({data:{familyId:a.family.id,userId:b.user.id,role:"VIEWER"}});
    await expect(a.privacy.deleteAccount(false)).rejects.toThrow(/chủ duy nhất/);
    expect((await db.user.findUniqueOrThrow({where:{id:a.user.id}})).deletionRequestedAt).toBeNull();
    await a.privacy.transferOwnership(a.family.id,b.user.id);
    expect((await db.familyMember.findUniqueOrThrow({where:{familyId_userId:a.session}})).role).toBe("PARENT");
    await a.privacy.deleteAccount(false);
    expect((await db.family.findUniqueOrThrow({where:{id:a.family.id}})).deletionRequestedAt).toBeNull();
    expect(await db.familyMember.count({where:{userId:a.user.id}})).toBe(0);
    await maintainPrivacy(db); expect(await db.user.findUnique({where:{id:a.user.id}})).toBeNull();
  });
  it("closes access immediately, rejects stale writes/new sessions, queues media and waits for cleanup and grace", async () => {
    const f=await fixture();const assetId=randomUUID(); const objectKey=`families/${f.family.id}/children/${f.child.id}/avatars/${assetId}`;
    await db.mediaAsset.create({data:{id:assetId,familyId:f.family.id,childId:f.child.id,purpose:"AVATAR",objectKey,contentType:"image/webp",byteLength:10,status:"READY",width:1,height:1}});
    await db.child.update({where:{id:f.child.id},data:{avatarAssetId:assetId}});
    await db.authSession.create({data:{userId:f.user.id,token:randomUUID(),expiresAt:new Date(Date.now()+60_000)}});
    await f.privacy.deleteAccount(false);
    expect(await db.authSession.count({where:{userId:f.user.id}})).toBe(0);
    await expect(authorization.requireFamilyAccess(f.session,"read")).rejects.toThrow();
    await expect(f.repo.updateChild(f.family.id,{id:f.child.id,name:"stale",lifecycle:"AFTER_BIRTH",birthDate:"2024-01-01"})).rejects.toThrow();
    await expect(createPostgresMediaRepository(db,f.user.id).markReady(f.family.id,assetId,{width:1,height:1,byteLength:10})).rejects.toThrow();
    await expect(db.authSession.create({data:{userId:f.user.id,token:randomUUID(),expiresAt:new Date(Date.now()+60_000)}})).rejects.toThrow();
    const storage={ listObjects:vi.fn(async()=>({objects:[]})),putObject:vi.fn(),getObject:vi.fn(),deleteObject:vi.fn() };
    await maintainPrivacy(db,storage);expect(await db.family.findUnique({where:{id:f.family.id}})).not.toBeNull();
    await db.family.update({where:{id:f.family.id},data:{deletionRequestedAt:new Date(Date.now()-25*3_600_000)}});
    expect((await maintainPrivacy(db,storage)).blocked).toBeGreaterThan(0);
    await db.mediaCleanupJob.updateMany({where:{familyId:f.family.id},data:{completedAt:new Date()}});
    const result=await maintainPrivacy(db,storage); expect(result.families).toBe(1);expect(result.users).toBe(1);
    expect(await db.deletionTombstone.findUnique({where:{kind_resourceId:{kind:"FAMILY",resourceId:f.family.id}}})).toMatchObject({completedAt:expect.any(Date)});
    // Durable cleanup survives family deletion (late immutable PUT reconciliation).
    await createPostgresMediaRepository(db).queueCleanup(f.family.id,objectKey);
    expect(await db.mediaCleanupJob.count({where:{familyId:f.family.id,completedAt:null}})).toBe(1);
  });
  it("serializes in-flight child edits with family deletion and rejects subsequent writes", async () => {
    const f=await fixture();
    const results=await Promise.allSettled([
      f.repo.updateChild(f.family.id,{id:f.child.id,name:"Concurrent edit",lifecycle:"AFTER_BIRTH",birthDate:"2024-01-01"}),
      f.privacy.deleteFamily(f.family.id),
    ]);
    expect(results[1].status).toBe("fulfilled");
    expect((await db.family.findUniqueOrThrow({where:{id:f.family.id}})).deletionRequestedAt).not.toBeNull();
    await expect(f.repo.updateChild(f.family.id,{id:f.child.id,name:"After deletion",lifecycle:"AFTER_BIRTH",birthDate:"2024-01-01"})).rejects.toThrow();
    await expect(f.repo.createChild(f.family.id,{id:randomUUID(),name:"Late child",lifecycle:"AFTER_BIRTH",birthDate:"2024-01-01"})).rejects.toThrow();
  });
  it("limits password reauthentication atomically per account", async () => {
    const f=await fixture();const results=await Promise.allSettled(Array.from({length:8},()=>consumeReauthenticationBudget(db,f.user.id)));
    expect(results.filter((r)=>r.status==="fulfilled")).toHaveLength(5);
  });
  it("retains unresolved tombstones and purges bounded expired metadata", async () => {
    const f=await fixture();await db.auditLog.updateMany({where:{familyId:f.family.id},data:{createdAt:new Date(Date.now()-91*86_400_000)}});
    await db.deletionTombstone.create({data:{kind:"USER",resourceId:f.user.id,requestedAt:new Date(Date.now()-100*86_400_000)}});
    const result=await maintainPrivacy(db);expect(result.purged).toBeGreaterThan(0);expect(await db.auditLog.count({where:{familyId:f.family.id}})).toBe(0);
    expect(await db.deletionTombstone.findUnique({where:{kind_resourceId:{kind:"USER",resourceId:f.user.id}}})).not.toBeNull();
  });
});
