"use server";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { requireIdentity, requireAccount } from "@/server/auth/session";
import { readAuthConfig } from "@/server/auth/config";
import { getServerRuntime } from "@/server/runtime";
import { createPrivacyService } from "@/server/privacy/service";
import { ResourceNotFoundError, PersistenceConflictError } from "@/server/db/errors";
import { consumeReauthenticationBudget } from "@/server/privacy/reauthenticate";
class PrivacyActionError extends Error {}
function failure(error: unknown) {
  const message = error instanceof PrivacyActionError || error instanceof PersistenceConflictError ? error.message : error instanceof ResourceNotFoundError ? "Bạn không có quyền thực hiện thao tác này." : "Chưa thực hiện được. Vui lòng thử lại.";
  if (!(error instanceof PrivacyActionError) && !(error instanceof PersistenceConflictError) && !(error instanceof ResourceNotFoundError)) console.error("Privacy action failed internally.");
  return { ok: false as const, error: message };
}
async function ownPrivacy() {
  const identity = await requireIdentity(); const runtime = getServerRuntime();
  return { ...runtime, identity, privacy: createPrivacyService(runtime.db, runtime.authorization, identity.user.id) };
}
async function reauthenticate(password: string, userId: string) {
  const h = await headers();
  if (h.get("origin") !== readAuthConfig().baseURL) throw new PrivacyActionError("Yêu cầu không hợp lệ.");
  const { db, auth } = getServerRuntime();
  await consumeReauthenticationBudget(db, userId);
  try { await auth.api.verifyPassword({ headers: h, body: { password: z.string().min(12).max(128).parse(password) } }); }
  catch { throw new PrivacyActionError("Mật khẩu chưa đúng hoặc phiên đã hết hạn."); }
}
export async function privacySummary() {
  const { privacy } = await ownPrivacy(); return privacy.accountSummary();
}
export async function familyPrivacyMembers() {
  const account = await requireAccount(); const { privacy } = await ownPrivacy();
  return { members: await privacy.members(account.familyId), userId: account.userId };
}
export async function requestAccountDeletion(raw: unknown) {
  const input = z.object({ password: z.string(), confirmation: z.literal("XÓA TÀI KHOẢN"), deleteSharedOwnedFamilies: z.boolean() }).parse(raw);
  const { identity, privacy } = await ownPrivacy();
  try { await reauthenticate(input.password, identity.user.id);
  await privacy.deleteAccount(input.deleteSharedOwnedFamilies);
  const jar = await cookies();
  for (const cookie of jar.getAll()) if (/^(?:__Secure-)?mory[.-]/.test(cookie.name)) jar.set(cookie.name, "", { httpOnly: true, secure: readAuthConfig().secure, path: "/", maxAge: 0, sameSite: "lax" });
  return { ok: true as const };
  } catch (error) { return failure(error); }
}
export async function requestFamilyDeletion(raw: unknown) {
  const input = z.object({ password: z.string(), confirmation: z.literal("XÓA GIA ĐÌNH") }).parse(raw);
  const account = await requireAccount(); const { privacy } = await ownPrivacy();
  try { await reauthenticate(input.password, account.userId); await privacy.deleteFamily(account.familyId);
  const jar = await cookies(); jar.delete("mory-family"); jar.delete("mory-child"); return { ok: true as const };
  } catch (error) { return failure(error); }
}
export async function transferFamilyOwnership(raw: unknown) {
  const input = z.object({ password: z.string(), recipientId: z.uuid() }).parse(raw);
  const account = await requireAccount(); const { privacy } = await ownPrivacy();
  try { await reauthenticate(input.password, account.userId); await privacy.transferOwnership(account.familyId, input.recipientId);
  return { ok: true as const };
  } catch (error) { return failure(error); }
}
