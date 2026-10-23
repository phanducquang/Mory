import "server-only";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../db/generated/client";
import type { AuthorizationService } from "../services/access";
import { setAuditActor } from "../db/audit";
import { PersistenceConflictError, ResourceNotFoundError } from "../db/errors";
type Tx = Prisma.TransactionClient;
const uuid = z.uuid();
async function lockUser(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string; deletionRequestedAt: Date | null }[]>`SELECT "id", "deletionRequestedAt" FROM "User" WHERE "id"=${id}::uuid FOR UPDATE`;
  if (!rows.length || rows[0].deletionRequestedAt) throw new ResourceNotFoundError();
}
async function lockFamily(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string; deletionRequestedAt: Date | null }[]>`SELECT "id", "deletionRequestedAt" FROM "Family" WHERE "id"=${id}::uuid FOR NO KEY UPDATE`;
  if (!rows.length) throw new ResourceNotFoundError();
  return rows[0];
}
async function owner(tx: Tx, userId: string, familyId: string) {
  const member = await tx.familyMember.findUnique({ where: { familyId_userId: { familyId, userId } } });
  if (member?.role !== "OWNER") throw new ResourceNotFoundError();
}
/** Tombstone and cleanup outbox commit together; physical deletion is a separate worker. */
async function tombstoneFamily(tx: Tx, familyId: string) {
  const family = await lockFamily(tx, familyId);
  if (family.deletionRequestedAt) return;
  await tx.family.update({ where: { id: familyId }, data: { deletionRequestedAt: new Date() } });
  await tx.$queryRaw`SELECT "id" FROM "Child" WHERE "familyId"=${familyId}::uuid ORDER BY "id" FOR UPDATE`;
  const assets = await tx.mediaAsset.findMany({ where: { familyId }, select: { objectKey: true, status: true, expiresAt: true } });
  if (assets.length) await tx.mediaCleanupJob.createMany({ data: assets.map((asset) => ({ familyId, objectKey: asset.objectKey,
    notBefore: asset.status === "PENDING_VERIFICATION" ? asset.expiresAt : undefined })) });
  await tx.child.updateMany({ where: { familyId }, data: { avatarAssetId: null, reminderEnabled: false } });
  await tx.mediaAsset.updateMany({ where: { familyId }, data: { status: "REJECTED" } });
  await tx.event.updateMany({ where: { familyId }, data: { reminder: false } });
  await tx.reminder.updateMany({ where: { familyId }, data: { enabled: false } });
  await tx.authMailJob.deleteMany({ where: { familyId, purpose: "REMINDER" } });
  await tx.deletionTombstone.upsert({ where: { kind_resourceId: { kind: "FAMILY", resourceId: familyId } }, create: { kind: "FAMILY", resourceId: familyId }, update: {} });
}
export function createPrivacyService(db: PrismaClient, authorization: AuthorizationService, userId: string) {
  uuid.parse(userId);
  const transaction = <T>(run: (tx: Tx) => Promise<T>) => db.$transaction(async (tx) => { await setAuditActor(tx, userId); await lockUser(tx, userId); return run(tx); }, { maxWait: 10_000, timeout: 60_000 });
  return {
    async accountSummary() {
      const user = await db.user.findFirst({ where: { id: userId, deletionRequestedAt: null }, select: { id: true } });
      if (!user) throw new ResourceNotFoundError();
      const memberships = await db.familyMember.findMany({ where: { userId, role: "OWNER", family: { deletionRequestedAt: null } },
        include: { family: { include: { _count: { select: { members: true } } } } }, take: 101 });
      if (memberships.length > 100) throw new PersistenceConflictError("Tài khoản có nhiều gia đình; cần xử lý theo tác vụ quản trị.");
      return memberships.map((m) => ({ id: m.familyId, name: m.family.name, members: m.family._count.members }));
    },
    async members(familyId: string) {
      uuid.parse(familyId); await authorization.requireFamilyAccess({ familyId, userId }, "write");
      const current = await db.familyMember.findUnique({ where: { familyId_userId: { familyId, userId } } });
      if (current?.role !== "OWNER") throw new ResourceNotFoundError();
      const rows = await db.familyMember.findMany({ where: { familyId, user: { deletionRequestedAt: null } }, include: { user: { select: { displayName: true } } }, orderBy: { userId: "asc" }, take: 100 });
      return rows.map((m) => ({ id: m.userId, name: m.user.displayName, role: m.role }));
    },
    async transferOwnership(familyId: string, recipientId: string) {
      uuid.parse(familyId); uuid.parse(recipientId);
      if (recipientId === userId) throw new PersistenceConflictError("Chọn một thành viên khác.");
      await authorization.requireFamilyAccess({ familyId, userId }, "write");
      await db.$transaction(async (tx) => {
        await setAuditActor(tx, userId);
        // All user locks precede family locks, including concurrent account deletion.
        for (const id of [userId, recipientId].sort()) await lockUser(tx, id);
        const family = await lockFamily(tx, familyId); if (family.deletionRequestedAt) throw new ResourceNotFoundError();
        await owner(tx, userId, familyId);
        if (!await tx.familyMember.findUnique({ where: { familyId_userId: { familyId, userId: recipientId } } })) throw new ResourceNotFoundError();
        await tx.familyMember.update({ where: { familyId_userId: { familyId, userId: recipientId } }, data: { role: "OWNER" } });
        await tx.familyMember.update({ where: { familyId_userId: { familyId, userId } }, data: { role: "PARENT" } });
      }, { maxWait: 10_000, timeout: 30_000 });
    },
    async deleteFamily(familyId: string) {
      uuid.parse(familyId); await authorization.requireFamilyAccess({ familyId, userId }, "write");
      await transaction(async (tx) => { await lockFamily(tx, familyId); await owner(tx, userId, familyId); await tombstoneFamily(tx, familyId); });
    },
    async deleteAccount(deleteSharedOwnedFamilies: boolean) {
      z.boolean().parse(deleteSharedOwnedFamilies);
      await transaction(async (tx) => {
        const owned = await tx.familyMember.findMany({ where: { userId, role: "OWNER" }, orderBy: { familyId: "asc" } });
        for (const member of owned) {
          const family = await lockFamily(tx, member.familyId);
          if (family.deletionRequestedAt) continue;
          const otherOwners = await tx.familyMember.count({ where: { familyId: member.familyId, role: "OWNER", userId: { not: userId }, user: { deletionRequestedAt: null } } });
          if (otherOwners) continue;
          const others = await tx.familyMember.count({ where: { familyId: member.familyId, userId: { not: userId }, user: { deletionRequestedAt: null } } });
          if (others && !deleteSharedOwnedFamilies) throw new PersistenceConflictError("Bạn là chủ duy nhất của gia đình có thành viên khác. Hãy chuyển quyền sở hữu hoặc xác nhận xóa cả dữ liệu gia đình.");
          await tombstoneFamily(tx, member.familyId);
        }
        await tx.user.update({ where: { id: userId }, data: { deletionRequestedAt: new Date() } });
        await tx.authSession.deleteMany({ where: { userId } }); await tx.authAccount.deleteMany({ where: { userId } });
        await tx.authVerification.deleteMany({ where: { value: userId } });
        await tx.authMailJob.deleteMany({ where: { OR: [{ subjectUserId: userId }, { recipientUserId: userId }] } });
        await tx.userPreference.upsert({ where: { userId }, create: { userId, notificationsEnabled: false }, update: { notificationsEnabled: false } });
        await tx.familyMember.deleteMany({ where: { userId, OR: [{ role: { not: "OWNER" } }, { family: { deletionRequestedAt: null } }] } });
        await tx.deletionTombstone.upsert({ where: { kind_resourceId: { kind: "USER", resourceId: userId } }, create: { kind: "USER", resourceId: userId }, update: {} });
        await tx.auditLog.updateMany({ where: { actorId: userId }, data: { actorId: null } });
      });
    },
  };
}
