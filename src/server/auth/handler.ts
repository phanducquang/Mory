import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient } from "../db/generated/client";
import { trustedEdgeHeaders } from "./edge";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import type { createAuthentication } from "./factory";
const allowed = new Set(["/sign-up/email", "/sign-in/email", "/sign-out", "/get-session", "/send-verification-email", "/request-password-reset", "/reset-password", "/verify-email"]);
const mailRequests = new Set(["/request-password-reset", "/send-verification-email"]);
const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
/** Exact-origin mutations, bounded body and a small explicit public auth surface. */
export async function handleAuthenticationRequest(auth: ReturnType<typeof createAuthentication>, origin: string, request: Request, emailEnabled = false, db?: PrismaClient) {
  const sanitizedHeaders = trustedEdgeHeaders(request.headers);
  request = new Request(request, { headers: sanitizedHeaders });
  const started = Date.now();
  const respond = (message: string, status: number) => Response.json({ message }, { status, headers: privateHeaders });
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  if (!allowed.has(path)) return respond("Không tìm thấy chức năng.", 404);
  if ((path === "/verify-email" || path === "/reset-password" || mailRequests.has(path)) && !emailEnabled) return respond("Email tài khoản chưa được bật.", 503);
  if (path !== "/get-session" && request.method !== "POST") return respond("Cần xác nhận thao tác.", 405);
  let body: Uint8Array | undefined;
  if (request.method === "POST") {
    if (request.headers.get("origin") !== origin) return respond("Nguồn yêu cầu không hợp lệ.", 403);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error()), 10_000); });
    try {
      if (reader) while (true) {
        const { done, value } = await Promise.race([reader.read(), expired]);
        if (done) break;
        length += value.byteLength;
        if (length > 16_384) return respond("Yêu cầu quá lớn.", 413);
        chunks.push(value);
      }
    } catch { return respond("Chưa đọc được yêu cầu.", 400); }
    finally { clearTimeout(timer); if (reader) void reader.cancel().catch(() => {}); }
    body = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  }
  try {
    if (mailRequests.has(path)) {
      const input = z.object({ email: z.email().max(320) }).parse(JSON.parse(Buffer.from(body ?? []).toString("utf8")));
      body = Buffer.from(JSON.stringify({ email: input.email.trim().toLowerCase() }));
    }
    if (path === "/verify-email") {
      const input = z.object({ token: z.string().min(1).max(2048) }).strict().parse(JSON.parse(Buffer.from(body ?? []).toString("utf8")));
      const proof = await db?.authMailJob.findUnique({ where: { verificationHash: createHash("sha256").update(input.token).digest("hex") }, select: { subjectUserId: true, expiresAt: true } });
      if (!proof?.subjectUserId || proof.expiresAt <= new Date() || !await db!.user.findFirst({ where: { id: proof.subjectUserId, deletionRequestedAt: null }, select: { id: true } })) return respond("Liên kết không hợp lệ hoặc đã hết hạn.", 401);
      // Function call only, no HTTP hop. The public GET endpoint is intentionally blocked.
      const url = new URL("/api/auth/verify-email", origin); url.searchParams.set("token", input.token);
      request = new Request(url, { headers: request.headers });
    } else if (request.method === "POST") {
      // Token-bearing reset requests may only use the JSON body, never URL query parameters.
      const url = new URL(request.url); url.search = "";
      request = new Request(url, { method: "POST", headers: request.headers, body: body ? new Uint8Array(body) : undefined });
    }
    const response = await auth.handler(request);
    if (mailRequests.has(path) && response.status !== 429) {
      // Durable enqueue avoids SMTP latency; a small floor reduces database timing differences.
      await delay(Math.max(0, 250 - (Date.now() - started)));
      return Response.json({ status: true }, { headers: privateHeaders });
    }
    const headers = new Headers(response.headers);
    Object.entries(privateHeaders).forEach(([key, value]) => headers.set(key, value));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    if (mailRequests.has(path) && !(error instanceof z.ZodError) && !(error instanceof SyntaxError)) {
      console.error("Auth email request could not be processed.");
      await delay(Math.max(0, 250 - (Date.now() - started)));
      return Response.json({ status: true }, { headers: privateHeaders });
    }
    return respond("Yêu cầu không hợp lệ hoặc dịch vụ chưa sẵn sàng.", error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503);
  }
}
