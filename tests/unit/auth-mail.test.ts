import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sealMail, openMail } from "@/server/mail/crypto";
import { readMailQueueConfig, readSmtpConfig } from "@/server/mail/config";
import { handleAuthenticationRequest } from "@/server/auth/handler";
import type { createAuthentication } from "@/server/auth/factory";
const origin = "http://localhost:3000";
const payload = { to: "parent@example.test", from: "mory@example.test", subject: "Xác minh", text: "private-token-value" };
const request = (path: string, body?: unknown) => new Request(`${origin}/api/auth/${path}`, { method: body ? "POST" : "GET", headers: { origin, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
describe("auth mail confidentiality and transport", () => {
  it("authenticates encrypted payloads and binds them to their purpose", () => {
    const key = randomBytes(32); const ciphertext = sealMail(payload, key, "VERIFY");
    expect(ciphertext).not.toContain(payload.to); expect(ciphertext).not.toContain(payload.text);
    expect(openMail(ciphertext, key, "VERIFY")).toEqual(payload);
    expect(sealMail(payload, key, "VERIFY")).not.toBe(ciphertext);
    expect(() => openMail(ciphertext, randomBytes(32), "VERIFY")).toThrow();
    expect(() => openMail(ciphertext, key, "RESET")).toThrow();
    expect(() => openMail(ciphertext.slice(0, -8) + "AAAA", key, "VERIFY")).toThrow();
  });
  it("requires an independent key/from and remote SMTP TLS", () => {
    expect(() => readMailQueueConfig({ AUTH_MAIL_KEY: "short" })).toThrow();
    const config = readMailQueueConfig({ AUTH_MAIL_KEY: randomBytes(32).toString("base64"), AUTH_MAIL_FROM: payload.from });
    expect(config.key).toHaveLength(32);
    expect(readSmtpConfig({ SMTP_HOST: "smtp.example.test" })).toMatchObject({ requireTLS: true, ignoreTLS: false, tls: { rejectUnauthorized: true } });
    expect(() => readSmtpConfig({ SMTP_HOST: "smtp.example.test", SMTP_ALLOW_INSECURE_LOCAL: "true" })).toThrow();
    expect(readSmtpConfig({ SMTP_HOST: "localhost", SMTP_ALLOW_INSECURE_LOCAL: "true" })).toMatchObject({ ignoreTLS: true });
    expect(() => readSmtpConfig({ SMTP_HOST: "localhost", SMTP_USER: "user" })).toThrow();
  });
  it("blocks token-bearing GETs and unknown auth endpoints", async () => {
    const handler = vi.fn(); const auth = { handler } as unknown as ReturnType<typeof createAuthentication>;
    expect((await handleAuthenticationRequest(auth, origin, request("verify-email?token=secret"), true)).status).toBe(405);
    expect((await handleAuthenticationRequest(auth, origin, request("reset-password/secret?callbackURL=/"), true)).status).toBe(404);
    expect((await handleAuthenticationRequest(auth, origin, request("update-user", {}), true)).status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });
  it("returns the same resend/reset envelope and strips caller redirects", async () => {
    const handler = vi.fn().mockResolvedValue(Response.json({ raw: "not exposed" }, { status: 500 }));
    const auth = { handler } as unknown as ReturnType<typeof createAuthentication>;
    const response = await handleAuthenticationRequest(auth, origin, request("request-password-reset", { email: payload.to, redirectTo: "https://other.invalid" }), true);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: true });
    expect(await (handler.mock.calls[0][0] as Request).json()).toEqual({ email: payload.to });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
