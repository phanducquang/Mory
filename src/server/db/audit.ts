import "server-only";
import { z } from "zod";
import type { Prisma } from "./generated/client";
/** Transaction-local actor only; audit payloads are produced by DB triggers, never client bodies. */
export async function setAuditActor(tx: Prisma.TransactionClient, actorId?: string) {
  if (actorId) z.uuid().parse(actorId);
  await tx.$queryRaw`SELECT set_config('mory.actor_id', ${actorId ?? ""}, true)`;
}

/** Recheck after the resource lock; requests authorized before deletion/revocation must not revive data. */
export async function assertFamilyWrite(tx: Prisma.TransactionClient, familyId: string, actorId?: string) {
  const family = await tx.family.findFirst({ where: { id: familyId, deletionRequestedAt: null }, select: { id: true } });
  if (!family) throw new Error("Không còn quyền truy cập gia đình.");
  if (actorId) {
    const rows = await tx.$queryRaw<{ role: string; deletionRequestedAt: Date | null }[]>`
      SELECT m."role", u."deletionRequestedAt" FROM "FamilyMember" m JOIN "User" u ON u."id"=m."userId"
      WHERE m."familyId"=${familyId}::uuid AND m."userId"=${actorId}::uuid FOR SHARE OF m`;
    if (!rows.length || rows[0].deletionRequestedAt || !["OWNER", "PARENT"].includes(rows[0].role)) throw new Error("Không còn quyền chỉnh sửa gia đình.");
  }
}
