import { createEmailVerificationToken } from "better-auth/api";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDatabaseClient } from "@/server/db/client";
import { createAuthentication } from "@/server/auth/factory";
import { handleAuthenticationRequest } from "@/server/auth/handler";
import { openMail } from "@/server/mail/crypto";
import { readMailQueueConfig } from "@/server/mail/config";
import { createAuthMailer } from "@/server/mail/outbox";
import { maintainAuthMail, smtpSender } from "@/server/mail/maintenance";
if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use npm run test:email.");
const db = createDatabaseClient(); const origin = "http://127.0.0.1:3100";
const config = { baseURL: origin, secret: randomBytes(32).toString("hex"), secure: false, allowSignup: true, emailEnabled: true };
const users: string[] = []; const password = randomBytes(24).toString("hex");
const req = (path: string, body: unknown, cookie?: string) => new Request(`${origin}/api/auth/${path}`, { method: "POST", headers: { origin, "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const send = (auth: ReturnType<typeof createAuthentication>, path: string, body: unknown) => handleAuthenticationRequest(auth, origin, req(path, body), true, db);
async function fixture() {
  const auth = createAuthentication(db, config); const email = `${randomUUID()}@example.test`;
  const response = await send(auth, "sign-up/email", { name: "Mail parent", email, password });
  expect(response.status).toBe(200);
  const user = await db.user.findUniqueOrThrow({ where: { email } }); users.push(user.id);
  const job = await db.authMailJob.findFirstOrThrow({ where: { purpose: "VERIFY", status: "QUEUED" }, orderBy: { createdAt: "desc" } });
  const payload = openMail(job.payload!, readMailQueueConfig().key, "VERIFY");
  const link = payload.text.split("\n").find((line) => line.startsWith(origin))!;
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token")!;
  return { auth, email, user, response, token, job };
}
beforeEach(async () => { await db.authRateLimit.deleteMany(); await db.authMailBudget.deleteMany(); await db.authMailJob.deleteMany(); });
afterAll(async () => { await db.authMailJob.deleteMany(); await db.authMailBudget.deleteMany(); await db.authVerification.deleteMany({ where: { value: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect(); });
describe.skipIf(process.env.AUTH_EMAIL_ENABLED !== "true")("verified email and recovery lifecycle", () => {
  it("requires verification before creating a session and makes verification idempotent without auto-login", async () => {
    const f = await fixture(); expect(f.user.emailVerified).toBe(false);
    expect(f.response.headers.getSetCookie().some((c) => c.startsWith("mory.session_token="))).toBe(false);
    expect((await send(f.auth, "sign-in/email", { email: f.email, password })).status).toBe(403);
    expect((await send(f.auth, "verify-email", { token: f.token })).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).emailVerified).toBe(true);
    const replay = await send(f.auth, "verify-email", { token: f.token }); expect(replay.status).toBe(200);
    expect(replay.headers.getSetCookie()).toHaveLength(0);
    expect((await send(f.auth, "sign-in/email", { email: f.email, password })).status).toBe(200);
    const expired = await createEmailVerificationToken(config.secret, f.email, undefined, -60);
    expect((await send(f.auth, "verify-email", { token: expired })).status).toBe(401);
    expect((await send(f.auth, "verify-email", { token: f.token.slice(0, -10) + "invalid" })).status).toBe(401);
  });
  it("resets atomically once, hashes token identifiers and revokes every session", async () => {
    const f = await fixture(); await send(f.auth, "verify-email", { token: f.token });
    const signin = await send(f.auth, "sign-in/email", { email: f.email, password });
    const cookie = signin.headers.getSetCookie().find((c) => c.startsWith("mory.session_token="))!.split(";")[0];
    await send(f.auth, "request-password-reset", { email: f.email });
    const job = await db.authMailJob.findFirstOrThrow({ where: { purpose: "RESET" }, orderBy: { createdAt: "desc" } });
    const payload = openMail(job.payload!, readMailQueueConfig().key, "RESET");
    const token = new URLSearchParams(new URL(payload.text.split("\n").find((line) => line.startsWith(origin))!).hash.slice(1)).get("token")!;
    const value = await db.authVerification.findFirstOrThrow({ where: { value: f.user.id } });
    expect(value.identifier).not.toContain(token);
    const nextPassword = randomBytes(24).toString("hex");
    const results = await Promise.all([send(f.auth, "reset-password", { token, newPassword: nextPassword }), send(createAuthentication(db, config), "reset-password", { token, newPassword: nextPassword })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await f.auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    expect((await send(f.auth, "sign-in/email", { email: f.email, password })).status).toBe(401);
    expect((await send(f.auth, "sign-in/email", { email: f.email, password: nextPassword })).status).toBe(200);
    expect((await send(f.auth, "reset-password", { token, newPassword: nextPassword })).status).toBe(400);
  });
  it("keeps rejected passwords from consuming the reset token, then rejects expiry", async () => {
    const f = await fixture(); await send(f.auth, "request-password-reset", { email: f.email });
    const job = await db.authMailJob.findFirstOrThrow({ where: { purpose: "RESET" } });
    const text = openMail(job.payload!, readMailQueueConfig().key, "RESET").text;
    const token = new URLSearchParams(new URL(text.split("\n").find((l) => l.startsWith(origin))!).hash.slice(1)).get("token")!;
    expect((await send(f.auth, "reset-password", { token, newPassword: "short" })).status).toBe(400);
    expect(await db.authVerification.count({ where: { value: f.user.id } })).toBe(1);
    await db.authVerification.updateMany({ where: { value: f.user.id }, data: { expiresAt: new Date(0) } });
    expect((await send(f.auth, "reset-password", { token, newPassword: password })).status).toBe(400);
    expect(await db.authSession.count({ where: { userId: f.user.id } })).toBe(0);
  });
  it("returns indistinguishable reset/resend responses and applies shared endpoint throttling", async () => {
    const f = await fixture();
    const known = await send(f.auth, "request-password-reset", { email: f.email });
    const unknown = await send(f.auth, "request-password-reset", { email: `${randomUUID()}@example.test` });
    expect(known.status).toBe(unknown.status); expect(await known.json()).toEqual(await unknown.json());
    const resend = await send(f.auth, "send-verification-email", { email: f.email });
    const missing = await send(f.auth, "send-verification-email", { email: `${randomUUID()}@example.test` });
    expect(resend.status).toBe(missing.status); expect(await resend.json()).toEqual(await missing.json());
    expect(await db.authMailJob.count({ where: { purpose: "VERIFY" } })).toBe(1); // resend within one minute is coalesced
    const responses = await Promise.all(Array.from({ length: 6 }, () => send(createAuthentication(db, config), "request-password-reset", { email: f.email })));
    expect(responses.filter((r) => r.status === 429).length).toBeGreaterThan(0);
  });
  it("keeps email jobs encrypted, delivers through real SMTP once under concurrent workers, then wipes payloads", async () => {
    const f = await fixture(); const key = readMailQueueConfig().key;
    expect(f.job.payload).not.toContain(f.email); expect(f.job.payload).not.toContain(f.token);
    const smtp = smtpSender();
    try { await Promise.all([maintainAuthMail(db, key, (p, id) => smtp.send(p, id)), maintainAuthMail(db, key, (p, id) => smtp.send(p, id))]); }
    finally { smtp.close(); }
    const messages = await (await fetch(`${process.env.MORY_TEST_INBOX}/messages`)).json() as { id: number; recipients: string[] }[];
    expect(messages.filter((m) => m.recipients.some((to) => to.includes(f.email)))).toHaveLength(1);
    expect(await db.authMailJob.findUnique({ where: { id: f.job.id } })).toMatchObject({ status: "SENT", payload: null, leaseToken: null });
  });
  it("coalesces concurrent recipient requests and caps five messages per hour across instances", async () => {
    const f = await fixture();
    const mailers = [createAuthMailer(db, origin), createAuthMailer(db, origin)];
    await Promise.all(Array.from({ length: 12 }, (_, i) => mailers[i % 2].enqueue("RESET", { email: f.email, token: "local-budget-test", userId: f.user.id })));
    expect(await db.authMailJob.count({ where: { purpose: "RESET" } })).toBe(1);
    for (let i = 0; i < 6; i++) {
      await db.authMailBudget.updateMany({ data: { lastQueuedAt: new Date(0) } });
      await mailers[i % 2].enqueue("RESET", { email: f.email, token: "local-budget-test", userId: f.user.id });
    }
    expect(await db.authMailJob.count({ where: { purpose: "RESET" } })).toBe(5);
  });
  it("rejects a verification link belonging to a deleted identity after the email is registered again", async () => {
    const f = await fixture();
    await db.user.delete({ where: { id: f.user.id } }); await db.authMailBudget.deleteMany(); await db.authRateLimit.deleteMany();
    expect((await send(f.auth, "sign-up/email", { name: "New identity", email: f.email, password })).status).toBe(200);
    const next = await db.user.findUniqueOrThrow({ where: { email: f.email } }); users.push(next.id);
    expect((await send(f.auth, "verify-email", { token: f.token })).status).toBe(401);
    expect((await db.user.findUniqueOrThrow({ where: { id: next.id } })).emailVerified).toBe(false);
  });
  it("invalidates every outstanding password-reset capability atomically", async () => {
    const f = await fixture(); await send(f.auth, "verify-email", { token: f.token });
    const tokens: string[] = [];
    for (let i=0;i<2;i++) {
      await db.authMailBudget.deleteMany();
      await send(f.auth, "request-password-reset", { email: f.email });
      const job = await db.authMailJob.findFirstOrThrow({ where: { purpose: "RESET", subjectUserId: f.user.id }, orderBy: { createdAt: "desc" } });
      const text = openMail(job.payload!, readMailQueueConfig().key, "RESET").text;
      tokens.push(new URLSearchParams(new URL(text.split("\n").find((l) => l.startsWith(origin))!).hash.slice(1)).get("token")!);
    }
    expect(tokens[0] === tokens[1]).toBe(false);
    const nextPassword = randomBytes(24).toString("hex");
    expect((await send(f.auth, "reset-password", { token: tokens[0], newPassword: nextPassword })).status).toBe(200);
    expect((await send(f.auth, "reset-password", { token: tokens[1], newPassword: password })).status).toBe(400);
    expect(await db.authVerification.count({ where: { value: f.user.id } })).toBe(0);
  });
  it("retries SMTP errors, reclaims expired leases and never sends an expired link", async () => {
    const f = await fixture(); const key = readMailQueueConfig().key;
    const stats = await maintainAuthMail(db, key, async () => { throw new Error("SMTP down"); });
    expect(stats.retry).toBe(1);
    const job = await db.authMailJob.findUniqueOrThrow({ where: { id: f.job.id } });
    expect(job.notBefore.getTime()).toBeGreaterThan(Date.now()); expect(job.payload).not.toBeNull();
    await db.authMailJob.update({ where: { id: job.id }, data: { notBefore: new Date(0), leaseUntil: new Date(0), leaseToken: randomUUID() } });
    const sender = vi.fn().mockResolvedValue(undefined);
    expect((await maintainAuthMail(db, key, sender)).sent).toBe(1); expect(sender).toHaveBeenCalledOnce();
    await db.authMailBudget.deleteMany(); await createAuthMailer(db, origin).enqueue("RESET", { email: f.email, token: "expired-token" });
    await db.authMailJob.updateMany({ where: { status: "QUEUED" }, data: { expiresAt: new Date(0) } });
    sender.mockClear(); expect((await maintainAuthMail(db, key, sender)).expired).toBe(1); expect(sender).not.toHaveBeenCalled();
  });
});
