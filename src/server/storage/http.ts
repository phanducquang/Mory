import "server-only";
import { z } from "zod";
import { serverDataEnabled, readAuthConfig } from "../auth/config";
import { getServerRuntime } from "../runtime";
import { ResourceNotFoundError, PersistenceConflictError, MediaQuotaError } from "../db/errors";
import { ServerNotConfiguredError } from "../services/access";
import { InvalidImageError, UploadLimitError, MAX_IMAGE_BYTES, type MediaPurpose } from "./contracts";
import { accountMediaService } from "./runtime";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie", "Cross-Origin-Resource-Policy": "same-origin" };
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function identity(request: Request, mutation: boolean) {
  if (!serverDataEnabled()) throw new HttpError(404, "Không tìm thấy ảnh.");
  if (mutation && request.headers.get("origin") !== readAuthConfig().baseURL) throw new HttpError(403, "Nguồn yêu cầu không hợp lệ.");
  const { auth, db } = getServerRuntime();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session && !await db.user.findFirst({ where: { id: session.user.id, deletionRequestedAt: null }, select: { id: true } })) throw new HttpError(401, "Tài khoản không còn hoạt động.");
  if (!session) throw new HttpError(401, "Vui lòng đăng nhập lại.");
  if (readAuthConfig().emailEnabled && !session.user.emailVerified) throw new HttpError(403, "Vui lòng xác minh email trước khi mở ảnh gia đình.");
  const members = await db.familyMember.findMany({ where: { userId: session.user.id, family: { deletionRequestedAt: null } }, orderBy: { familyId: "asc" } });
  const requested = request.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith("mory-family="))?.slice(12);
  const member = members.find((m) => m.familyId === requested) ?? members[0];
  if (!member) throw new ResourceNotFoundError();
  if (mutation && member.role === "VIEWER") throw new HttpError(403, "Bạn chỉ có quyền xem ảnh.");
  return { userId: session.user.id, familyId: member.familyId };
}
function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : error instanceof ResourceNotFoundError || error instanceof z.ZodError ? 404
    : error instanceof InvalidImageError ? 400 : error instanceof MediaQuotaError || error instanceof PersistenceConflictError ? 409
    : error instanceof UploadLimitError ? 429 : error instanceof ServerNotConfiguredError ? 503 : 503;
  const message = error instanceof HttpError || error instanceof InvalidImageError || error instanceof UploadLimitError || error instanceof MediaQuotaError || error instanceof PersistenceConflictError
    ? error.message : status === 404 ? "Không tìm thấy ảnh." : "Chưa thể xử lý ảnh. Vui lòng thử lại sau.";
  return Response.json({ error: message }, { status, headers: { ...privateHeaders, ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}
// Bounded per-process work. No pending queue holds raw image bodies in memory.
const capacity = globalThis as typeof globalThis & { moryUploadCapacity?: { active: number } };
const uploads = capacity.moryUploadCapacity ??= { active: 0 };
async function boundedBody(request: Request) {
  if (!request.body) throw new InvalidImageError();
  const reader = request.body.getReader();
  const chunks: Buffer[] = []; let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new InvalidImageError()), 15_000); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) break;
      size += value.length;
      if (size > MAX_IMAGE_BYTES) throw new InvalidImageError();
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
export async function uploadImage(request: Request, purpose: MediaPurpose, targetId: string) {
  let acquired = false;
  try {
    const account = await identity(request, true);
    if (uploads.active >= 2) throw new UploadLimitError();
    uploads.active++; acquired = true;
    const length = request.headers.get("content-length");
    const bytes = length && /^\d+$/.test(length) ? Number(length) : NaN;
    const result = await accountMediaService(account).upload(purpose, targetId, request.headers.get("content-type") ?? "", bytes, () => boundedBody(request));
    return Response.json(result, { status: 201, headers: privateHeaders });
  } catch (error) { return errorResponse(error); }
  finally { if (acquired) uploads.active--; }
}
export async function readImage(request: Request, id: string) {
  try {
    const bytes = await accountMediaService(await identity(request, false)).read(id);
    return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": "image/webp", "Content-Length": String(bytes.length), "Content-Disposition": 'inline; filename="memory.webp"' } });
  } catch (error) { return errorResponse(error); }
}
export async function deleteImage(request: Request, id: string) {
  try {
    await accountMediaService(await identity(request, true)).remove(id);
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch (error) { return errorResponse(error); }
}
