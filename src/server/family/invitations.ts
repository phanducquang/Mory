import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../db/generated/client";
import { setAuditActor } from "../db/audit";
import { PersistenceConflictError, ResourceNotFoundError } from "../db/errors";

type Tx = Prisma.TransactionClient;
export const invitationRole = z.enum(["PARENT", "VIEWER"]);
export const invitationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const INVITATION_TTL_MS = 7 * 86_400_000;
const LIMIT = 50;
const unavailable = () => new PersistenceConflictError("Lời mời không còn hiệu lực hoặc bạn không thể tham gia. Hãy nhờ chủ gia đình tạo lời mời mới.");
const hash = (token: string) => createHash("sha256").update(invitationToken.parse(token)).digest("hex");

async function lockUser(tx: Tx, userId: string) {
  const rows = await tx.$queryRaw<{ id: string; deletionRequestedAt: Date | null }[]>`SELECT "id", "deletionRequestedAt" FROM "User" WHERE "id"=${userId}::uuid FOR UPDATE`;
  if (!rows.length || rows[0].deletionRequestedAt) throw new ResourceNotFoundError();
}
async function lockFamily(tx: Tx, familyId: string) {
  const rows = await tx.$queryRaw<{ id: string; deletionRequestedAt: Date | null }[]>`SELECT "id", "deletionRequestedAt" FROM "Family" WHERE "id"=${familyId}::uuid FOR NO KEY UPDATE`;
  if (!rows.length || rows[0].deletionRequestedAt) throw new ResourceNotFoundError();
}
async function requireMember(tx: Tx, familyId: string, userId: string, owner = false) {
  const member = await tx.familyMember.findUnique({ where: { familyId_userId: { familyId, userId } }, include: { user: { select: { deletionRequestedAt: true } } } });
  if (!member || member.user.deletionRequestedAt || (owner && member.role !== "OWNER")) throw new ResourceNotFoundError();
  return member;
}

/** Family row locks serialize invitation capacity, acceptance, revocation and role changes. */
export function createFamilySharingService(db: PrismaClient, userId: string) {
  z.uuid().parse(userId);
  const transaction = <T>(familyId: string, run: (tx: Tx) => Promise<T>, targetId?: string) => {
    z.uuid().parse(familyId); if (targetId) z.uuid().parse(targetId);
    return db.$transaction(async tx => {
      await setAuditActor(tx, userId);
      for (const id of [...new Set([userId, ...(targetId ? [targetId] : [])])].sort()) await lockUser(tx, id);
      await lockFamily(tx, familyId);
      return run(tx);
    }, { maxWait: 10_000, timeout: 30_000 });
  };
  async function validInvitation(tx: Tx, tokenHash: string, now: Date) {
    const invite = await tx.familyInvitation.findUnique({ where: { tokenHash }, include: { family: { select: { name: true, deletionRequestedAt: true } }, createdBy: { select: { displayName: true, deletionRequestedAt: true } } } });
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= now || invite.family.deletionRequestedAt || invite.createdBy.deletionRequestedAt) throw unavailable();
    const creator = await tx.familyMember.findUnique({ where: { familyId_userId: { familyId: invite.familyId, userId: invite.createdById } } });
    if (creator?.role !== "OWNER") throw unavailable();
    return invite;
  }
  return {
    async renameFamily(familyId: string, rawName: string) {
      const name = z.string().trim().min(1).max(120).parse(rawName);
      return transaction(familyId, async tx => { await requireMember(tx, familyId, userId, true); await tx.family.update({ where: { id: familyId }, data: { name } }); });
    },
    async overview(familyId: string) {
      return transaction(familyId, async tx => {
        const member = await requireMember(tx, familyId, userId);
        const family = await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: { id: true, name: true } });
        const members = await tx.familyMember.findMany({ where: { familyId, user: { deletionRequestedAt: null } }, select: { userId: true, role: true, user: { select: { displayName: true } } }, orderBy: { userId: "asc" }, take: LIMIT });
        const invitations = member.role === "OWNER" ? await tx.familyInvitation.findMany({ where: { familyId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, role: true, expiresAt: true }, orderBy: { createdAt: "desc" }, take: 20 }) : [];
        const families = await tx.familyMember.findMany({ where: { userId, family: { deletionRequestedAt: null } }, select: { family: { select: { id: true, name: true } } }, orderBy: { familyId: "asc" }, take: LIMIT });
        return { family, userId, role: member.role, members: members.map(m => ({ userId: m.userId, name: m.user.displayName, role: m.role })), invitations: invitations.map(i => ({ ...i, expiresAt: i.expiresAt.toISOString() })), families: families.map(m => m.family) };
      });
    },
    async createInvitation(familyId: string, rawRole: unknown) {
      const role = invitationRole.parse(rawRole);
      const token = randomBytes(32).toString("base64url");
      return transaction(familyId, async tx => {
        await requireMember(tx, familyId, userId, true);
        const now = new Date();
        const recent = await tx.familyInvitation.count({ where: { familyId, createdAt: { gte: new Date(now.getTime() - 86_400_000) } } });
        const pending = await tx.familyInvitation.count({ where: { familyId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } });
        if (recent >= LIMIT || pending >= 20) throw new PersistenceConflictError("Gia đình đã tạo nhiều lời mời. Hãy thu hồi lời mời cũ hoặc thử lại vào ngày mai.");
        if (await tx.familyMember.count({ where: { familyId } }) >= LIMIT) throw new PersistenceConflictError("Gia đình đã đủ 50 thành viên.");
        const invite = await tx.familyInvitation.create({ data: { familyId, createdById: userId, tokenHash: hash(token), role, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) } });
        return { id: invite.id, token, expiresAt: invite.expiresAt.toISOString() };
      });
    },
    async revokeInvitation(familyId: string, invitationId: string) {
      z.uuid().parse(invitationId);
      return transaction(familyId, async tx => {
        await requireMember(tx, familyId, userId, true);
        const result = await tx.familyInvitation.updateMany({ where: { id: invitationId, familyId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
        if (!result.count) throw unavailable();
      });
    },
    async previewInvitation(token: string) {
      const tokenHash = hash(token);
      const found = await db.familyInvitation.findUnique({ where: { tokenHash }, select: { familyId: true } });
      if (!found) throw unavailable();
      return transaction(found.familyId, async tx => {
        const invite = await validInvitation(tx, tokenHash, new Date());
        return { familyName: invite.family.name, inviterName: invite.createdBy.displayName, role: invite.role, expiresAt: invite.expiresAt.toISOString() };
      });
    },
    async acceptInvitation(token: string) {
      const tokenHash = hash(token);
      const found = await db.familyInvitation.findUnique({ where: { tokenHash }, select: { familyId: true } });
      if (!found) throw unavailable();
      return transaction(found.familyId, async tx => {
        const invite = await validInvitation(tx, tokenHash, new Date());
        if (await tx.familyMember.findUnique({ where: { familyId_userId: { familyId: invite.familyId, userId } } })) throw new PersistenceConflictError("Bạn đã là thành viên gia đình này. Hãy mở gia đình từ trang Thành viên gia đình.");
        if (await tx.familyMember.count({ where: { familyId: invite.familyId } }) >= LIMIT || await tx.familyMember.count({ where: { userId } }) >= LIMIT) throw unavailable();
        await tx.familyMember.create({ data: { familyId: invite.familyId, userId, role: invite.role } });
        await tx.familyInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), acceptedById: userId } });
        return invite.familyId;
      });
    },
    async changeRole(familyId: string, targetId: string, rawRole: unknown) {
      const role = invitationRole.parse(rawRole);
      return transaction(familyId, async tx => {
        await requireMember(tx, familyId, userId, true);
        const target = await requireMember(tx, familyId, targetId);
        if (target.role === "OWNER" || targetId === userId) throw new PersistenceConflictError("Chuyển quyền chủ gia đình trong mục Quyền sở hữu gia đình.");
        await tx.familyMember.update({ where: { familyId_userId: { familyId, userId: targetId } }, data: { role } });
      }, targetId);
    },
    async removeMember(familyId: string, targetId: string) {
      return transaction(familyId, async tx => {
        const actor = await requireMember(tx, familyId, userId);
        if (targetId !== userId && actor.role !== "OWNER") throw new ResourceNotFoundError();
        const target = await requireMember(tx, familyId, targetId);
        if (target.role === "OWNER") throw new PersistenceConflictError("Chủ gia đình cần chuyển quyền sở hữu trước khi rời gia đình.");
        await tx.familyMember.delete({ where: { familyId_userId: { familyId, userId: targetId } } });
      }, targetId);
    },
    async selectFamily(familyId: string) {
      return transaction(familyId, tx => requireMember(tx, familyId, userId).then(() => familyId));
    },
  };
}
export type FamilySharingOverview = Awaited<ReturnType<ReturnType<typeof createFamilySharingService>["overview"]>>;
