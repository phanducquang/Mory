"use server";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { requireAccount, requireIdentity } from "@/server/auth/session";
import { readAuthConfig } from "@/server/auth/config";
import { getServerRuntime } from "@/server/runtime";
import { createFamilySharingService } from "@/server/family/invitations";
import { PersistenceConflictError, ResourceNotFoundError } from "@/server/db/errors";

type Service = ReturnType<typeof createFamilySharingService>;
async function run<T>(work: (service: Service, userId: string) => Promise<T>) {
  const identity = await requireIdentity();
  try {
    if ((await headers()).get("origin") !== readAuthConfig().baseURL) throw new ResourceNotFoundError();
    return { ok: true as const, data: await work(createFamilySharingService(getServerRuntime().db, identity.user.id), identity.user.id) };
  } catch (error) {
    return { ok: false as const, error: error instanceof PersistenceConflictError ? error.message : error instanceof z.ZodError ? "Thông tin chưa hợp lệ. Kiểm tra mã mời và quyền đã chọn." : error instanceof ResourceNotFoundError ? "Bạn không có quyền thực hiện thao tác này hoặc gia đình không còn khả dụng." : "Chưa thực hiện được. Vui lòng thử lại." };
  }
}
async function choose(familyId: string) {
  const jar = await cookies();
  jar.set("mory-family", familyId, { httpOnly: true, secure: readAuthConfig().secure, sameSite: "lax", path: "/", maxAge: 30 * 86_400 });
  jar.delete("mory-child");
}
async function joinBudget(userId: string) {
  const key = `family-join:${userId}`;
  const rows = await getServerRuntime().db.$queryRaw<{ count: number }[]>`
    INSERT INTO "AuthRateLimit" ("id","key","count","lastRequest") VALUES (gen_random_uuid(),${key},1,(extract(epoch FROM clock_timestamp())*1000)::bigint)
    ON CONFLICT ("key") DO UPDATE SET
    "count"=CASE WHEN "AuthRateLimit"."lastRequest" < (extract(epoch FROM clock_timestamp())*1000)::bigint-60000 THEN 1 ELSE LEAST(21,"AuthRateLimit"."count"+1) END,
    "lastRequest"=CASE WHEN "AuthRateLimit"."lastRequest" < (extract(epoch FROM clock_timestamp())*1000)::bigint-60000 THEN (extract(epoch FROM clock_timestamp())*1000)::bigint ELSE "AuthRateLimit"."lastRequest" END RETURNING "count"`;
  if (rows[0].count > 20) throw new PersistenceConflictError("Bạn thử quá nhiều lần. Vui lòng chờ một phút.");
}
export async function readFamilySharing() {
  return run(async service => service.overview((await requireAccount()).familyId));
}
export async function createFamilyInvitation(role: unknown) {
  return run(async service => {
    const invite = await service.createInvitation((await requireAccount()).familyId, role);
    return { id: invite.id, expiresAt: invite.expiresAt, link: `${readAuthConfig().baseURL}/join#${invite.token}` };
  });
}
export async function revokeFamilyInvitation(id: string) {
  return run(async service => service.revokeInvitation((await requireAccount()).familyId, id));
}
export async function previewFamilyInvitation(token: string) {
  return run(async (service, userId) => { await joinBudget(userId); return service.previewInvitation(token); });
}
export async function acceptFamilyInvitation(token: string) {
  return run(async (service, userId) => { await joinBudget(userId); const id = await service.acceptInvitation(token); await choose(id); });
}
export async function changeFamilyMemberRole(userId: string, role: unknown) {
  return run(async service => service.changeRole((await requireAccount()).familyId, userId, role));
}
export async function removeFamilyMember(userId: string) {
  return run(async (service, actorId) => {
    await service.removeMember((await requireAccount()).familyId, userId);
    if (userId === actorId) { const jar = await cookies(); jar.delete("mory-family"); jar.delete("mory-child"); }
  });
}
export async function selectSharedFamily(familyId: string) {
  return run(async service => { await service.selectFamily(familyId); await choose(familyId); });
}
export async function renameSharedFamily(name: string) {
  return run(async service => service.renameFamily((await requireAccount()).familyId, name));
}
