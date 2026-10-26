import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDatabaseClient } from "@/server/db/client";
import { createDatabaseAuthorization } from "@/server/db/authorization";
import { createFamilySharingService, INVITATION_TTL_MS } from "@/server/family/invitations";
import { createPrivacyService } from "@/server/privacy/service";
import { createPostgresJourneyRepository } from "@/server/repositories/postgres-journey-repository";
if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use disposable DB runner.");
const db = createDatabaseClient(); const authorization = createDatabaseAuthorization(db);
const familyIds: string[] = [], userIds: string[] = [];
async function person(name = "Người thân") {
  const user = await db.user.create({ data: { displayName: name, email: `${randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(user.id); return { user, service: createFamilySharingService(db, user.id) };
}
async function family() {
  const owner = await person("Chủ gia đình");
  const f = await db.family.create({ data: { name: "Gia đình kiểm thử", members: { create: { userId: owner.user.id, role: "OWNER" } } } });
  familyIds.push(f.id); return { ...owner, family: f };
}
async function cleanup() {
  await db.family.deleteMany({ where: { id: { in: familyIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  familyIds.length = 0; userIds.length = 0;
}
beforeEach(cleanup); afterAll(async () => { await cleanup(); await db.$disconnect(); });

describe("family sharing", () => {
  it("stores a hash, exposes no code in listings/audit, and accepts a parent without changing another family", async () => {
    const a = await family(), b = await family();
    const invite = await a.service.createInvitation(a.family.id, "PARENT");
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const record = await db.familyInvitation.findUniqueOrThrow({ where: { id: invite.id } });
    expect(record.tokenHash).toMatch(/^[a-f0-9]{64}$/); expect(record.tokenHash).not.toBe(invite.token);
    expect(record.expiresAt.getTime() - record.createdAt.getTime()).toBeGreaterThan(INVITATION_TTL_MS - 2000);
    expect(await b.service.previewInvitation(invite.token)).toMatchObject({ familyName: a.family.name, role: "PARENT" });
    expect(await b.service.acceptInvitation(invite.token)).toBe(a.family.id);
    await expect(authorization.requireFamilyAccess({ userId: b.user.id, familyId: a.family.id }, "write")).resolves.toBeUndefined();
    expect(await db.familyMember.count({ where: { userId: b.user.id } })).toBe(2);
    expect((await db.familyMember.findUniqueOrThrow({ where: { familyId_userId: { familyId: b.family.id, userId: b.user.id } } })).role).toBe("OWNER");
    const audit = await db.auditLog.findMany({ where: { familyId: a.family.id } });
    expect(audit.some(row => row.resourceKind === "FamilyInvitation" && row.actorId === b.user.id)).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(invite.token); expect(JSON.stringify(audit)).not.toContain(record.tokenHash);
    expect(JSON.stringify(await a.service.overview(a.family.id))).not.toContain(record.tokenHash);
  });
  it("does not grant viewer write access and supports the full role/remove/leave flow", async () => {
    const a = await family(), b = await person();
    const invite = await a.service.createInvitation(a.family.id, "VIEWER"); await b.service.acceptInvitation(invite.token);
    const session = { familyId: a.family.id, userId: b.user.id };
    await authorization.requireFamilyAccess(session, "read"); await expect(authorization.requireFamilyAccess(session, "write")).rejects.toThrow();
    await a.service.changeRole(a.family.id, b.user.id, "PARENT"); await authorization.requireFamilyAccess(session, "write");
    await b.service.removeMember(a.family.id, b.user.id);
    await expect(authorization.requireFamilyAccess(session, "read")).rejects.toThrow();
    const again = await a.service.createInvitation(a.family.id, "PARENT"); await b.service.acceptInvitation(again.token);
    await a.service.removeMember(a.family.id, b.user.id); await expect(authorization.requireFamilyAccess(session, "read")).rejects.toThrow();
    expect(await db.family.count({ where: { id: a.family.id } })).toBe(1);
  });
  it("allows only owners to invite/revoke/change roles or remove others", async () => {
    const a = await family(), b = await person(), c = await person();
    const invite = await a.service.createInvitation(a.family.id, "PARENT"); await b.service.acceptInvitation(invite.token);
    const pending = await a.service.createInvitation(a.family.id, "VIEWER");
    for (const service of [b.service, c.service]) {
      await expect(service.createInvitation(a.family.id, "PARENT")).rejects.toThrow();
      await expect(service.revokeInvitation(a.family.id, pending.id)).rejects.toThrow();
      await expect(service.changeRole(a.family.id, a.user.id, "VIEWER")).rejects.toThrow();
      await expect(service.removeMember(a.family.id, a.user.id)).rejects.toThrow();
      await expect(service.renameFamily(a.family.id, "Chiếm quyền")).rejects.toThrow();
    }
    expect((await b.service.overview(a.family.id)).invitations).toEqual([]);
  });
  it("never grants OWNER through invitations or role edits, and never removes an owner", async () => {
    const a = await family();
    await expect(a.service.createInvitation(a.family.id, "OWNER")).rejects.toThrow();
    await expect(a.service.changeRole(a.family.id, a.user.id, "VIEWER")).rejects.toThrow();
    await expect(a.service.removeMember(a.family.id, a.user.id)).rejects.toThrow();
    expect(await db.familyMember.count({ where: { familyId: a.family.id, role: "OWNER" } })).toBe(1);
  });
  it("rejects expired, revoked, malformed and replayed codes", async () => {
    const a = await family(), b = await person(), c = await person();
    const expired = await a.service.createInvitation(a.family.id, "PARENT");
    await db.familyInvitation.update({ where: { id: expired.id }, data: { createdAt: new Date(Date.now() - 2 * INVITATION_TTL_MS), expiresAt: new Date(Date.now() - 1000) } });
    await expect(b.service.previewInvitation(expired.token)).rejects.toThrow(); await expect(b.service.acceptInvitation(expired.token)).rejects.toThrow();
    const revoked = await a.service.createInvitation(a.family.id, "PARENT"); await a.service.revokeInvitation(a.family.id, revoked.id);
    await expect(b.service.acceptInvitation(revoked.token)).rejects.toThrow();
    await expect(b.service.acceptInvitation("invalid")).rejects.toThrow(); await expect(b.service.acceptInvitation("A".repeat(43))).rejects.toThrow();
    const once = await a.service.createInvitation(a.family.id, "VIEWER"); await b.service.acceptInvitation(once.token);
    await expect(c.service.acceptInvitation(once.token)).rejects.toThrow(); await expect(b.service.acceptInvitation(once.token)).rejects.toThrow();
  });
  it("serializes two acceptors of the same link into exactly one membership", async () => {
    const a = await family(), b = await person(), c = await person();
    const invite = await a.service.createInvitation(a.family.id, "PARENT");
    const results = await Promise.allSettled([b.service.acceptInvitation(invite.token), c.service.acceptInvitation(invite.token)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.familyMember.count({ where: { familyId: a.family.id } })).toBe(2);
  });
  it("serializes revocation versus acceptance, leaving a single terminal state", async () => {
    const a = await family(), b = await person();
    const invite = await a.service.createInvitation(a.family.id, "PARENT");
    const results = await Promise.allSettled([a.service.revokeInvitation(a.family.id, invite.id), b.service.acceptInvitation(invite.token)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const row = await db.familyInvitation.findUniqueOrThrow({ where: { id: invite.id } });
    expect(!!row.acceptedAt !== !!row.revokedAt).toBe(true);
  });
  it("keeps an existing member's role and does not consume a link for them", async () => {
    const a = await family(), b = await person();
    const invite = await a.service.createInvitation(a.family.id, "VIEWER");
    await expect(a.service.acceptInvitation(invite.token)).rejects.toThrow(/đã là thành viên/);
    await b.service.acceptInvitation(invite.token);
    expect((await db.familyMember.findUniqueOrThrow({ where: { familyId_userId: { familyId: a.family.id, userId: a.user.id } } })).role).toBe("OWNER");
  });
  it("rejects revoked membership selection and cross-family invitation IDs", async () => {
    const a = await family(), b = await family();
    const invite = await a.service.createInvitation(a.family.id, "VIEWER");
    await expect(b.service.selectFamily(a.family.id)).rejects.toThrow();
    await expect(b.service.revokeInvitation(b.family.id, invite.id)).rejects.toThrow();
    await b.service.acceptInvitation(invite.token); await b.service.selectFamily(a.family.id);
    await a.service.removeMember(a.family.id, b.user.id); await expect(b.service.selectFamily(a.family.id)).rejects.toThrow();
  });
  it("does not accept links created by an owner who has since transferred ownership", async () => {
    const a = await family(), b = await person(), c = await person();
    const memberInvite = await a.service.createInvitation(a.family.id, "PARENT"); await b.service.acceptInvitation(memberInvite.token);
    const pending = await a.service.createInvitation(a.family.id, "VIEWER");
    await createPrivacyService(db, authorization, a.user.id).transferOwnership(a.family.id, b.user.id);
    await expect(c.service.acceptInvitation(pending.token)).rejects.toThrow();
  });
  it("rejects deleted families/users and enforces the pending invitation cap", async () => {
    const a = await family(), b = await person();
    const invites = await Promise.all(Array.from({ length: 20 }, () => a.service.createInvitation(a.family.id, "PARENT")));
    await expect(a.service.createInvitation(a.family.id, "PARENT")).rejects.toThrow(/nhiều lời mời/);
    await db.family.update({ where: { id: a.family.id }, data: { deletionRequestedAt: new Date() } });
    await expect(b.service.acceptInvitation(invites[0].token)).rejects.toThrow();
    await db.family.update({ where: { id: a.family.id }, data: { deletionRequestedAt: null } });
    await db.user.update({ where: { id: b.user.id }, data: { deletionRequestedAt: new Date() } });
    await expect(b.service.acceptInvitation(invites[0].token)).rejects.toThrow();
  });
  it("enforces a daily creation cap even when invitations are revoked", async () => {
    const a = await family();
    await db.familyInvitation.createMany({ data: Array.from({ length: 50 }, () => ({ familyId: a.family.id, createdById: a.user.id, tokenHash: randomUUID().replaceAll("-", "").repeat(2), role: "PARENT" as const, revokedAt: new Date(), expiresAt: new Date(Date.now() + INVITATION_TTL_MS) })) });
    await expect(a.service.createInvitation(a.family.id, "VIEWER")).rejects.toThrow(/nhiều lời mời/);
  });
  it("does not lose shared events when a parent leaves, and denies their subsequent writes", async () => {
    const a = await family(), b = await person();
    const invite = await a.service.createInvitation(a.family.id, "PARENT"); await b.service.acceptInvitation(invite.token);
    const child = await db.child.create({ data: { familyId: a.family.id, name: "Bé chung", lifecycle: "AFTER_BIRTH", birthDate: new Date("2024-01-01Z") } });
    const event = await db.event.create({ data: { familyId: a.family.id, childId: child.id, title: "Kỷ niệm chung", date: new Date("2024-01-02Z"), type: "memory" } });
    await a.service.removeMember(a.family.id, b.user.id);
    expect(await db.event.findUnique({ where: { id: event.id } })).not.toBeNull();
    await expect(createPostgresJourneyRepository(db, b.user.id).updateChild(a.family.id, { id: child.id, name: "Không được sửa", lifecycle: "AFTER_BIRTH", birthDate: "2024-01-01" })).rejects.toThrow();
  });
  it("serializes two invitations competing for the final member slot", async () => {
    const a = await family(), b = await person(), c = await person();
    const first = await a.service.createInvitation(a.family.id, "PARENT"), second = await a.service.createInvitation(a.family.id, "VIEWER");
    const ids = Array.from({ length: 48 }, () => randomUUID()); userIds.push(...ids);
    await db.user.createMany({ data: ids.map(id => ({ id, displayName: "Thành viên thử" })) });
    await db.familyMember.createMany({ data: ids.map(userId => ({ familyId: a.family.id, userId, role: "VIEWER" as const })) });
    const results = await Promise.allSettled([b.service.acceptInvitation(first.token), c.service.acceptInvitation(second.token)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.familyMember.count({ where: { familyId: a.family.id } })).toBe(50);
  });
});
