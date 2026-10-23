import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDatabaseClient } from "@/server/db/client";
import { createAuthentication } from "@/server/auth/factory";
import { queryFamilyEvents } from "@/server/repositories/postgres-event-query";
import { handleAuthenticationRequest } from "@/server/auth/handler";
import { filterTimeline } from "@/features/timeline/domain";

if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use npm run test:db.");
const db = createDatabaseClient();
const origin = "http://127.0.0.1:3100";
const config = { baseURL: origin, secret: randomBytes(32).toString("hex"), secure: false, allowSignup: true };
const auth = createAuthentication(db, config);
const userIds: string[] = [];
const familyIds: string[] = [];
const credential = randomBytes(24).toString("hex");
function request(path: string, body?: unknown, cookie?: string, requestOrigin = origin) {
  return new Request(`${origin}/api/auth/${path}`, { method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", origin: requestOrigin, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
async function register() {
  const email = `${randomUUID()}@example.test`;
  const response = await auth.handler(request("sign-up/email", { name: "Test parent", email, password: credential }));
  expect(response.status).toBe(200);
  const payload = await response.json();
  userIds.push(payload.user.id);
  const cookie = response.headers.getSetCookie().find((v) => v.startsWith("mory.session_token="))!.split(";")[0];
  return { email, cookie, userId: payload.user.id as string, response };
}
beforeEach(async () => { await db.authRateLimit.deleteMany(); });
afterAll(async () => {
  await db.family.deleteMany({ where: { id: { in: familyIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("real database authentication", () => {
  it("hashes passwords, sets HttpOnly cookies and verifies sessions using a fresh auth instance", async () => {
    const account = await register();
    const cookies = account.response.headers.getSetCookie().join(";");
    expect(cookies).toMatch(/HttpOnly/i); expect(cookies).toMatch(/SameSite=Lax/i);
    const stored = await db.authAccount.findFirstOrThrow({ where: { userId: account.userId } });
    expect(stored.password).not.toContain(credential); expect(stored.password!.length).toBeGreaterThan(64);
    const fresh = createAuthentication(db, config);
    expect((await fresh.api.getSession({ headers: new Headers({ cookie: account.cookie }) }))?.user.id).toBe(account.userId);
    expect(await fresh.api.getSession({ headers: new Headers({ cookie: "mory.session_token=forged" }) })).toBeNull();
    const invalid = await auth.handler(request("sign-in/email", { email: account.email, password: `${credential}wrong` }));
    expect(invalid.status).toBe(401);
  });
  it("revokes on logout and rejects expired sessions immediately", async () => {
    const account = await register();
    const logout = await auth.handler(request("sign-out", {}, account.cookie));
    expect(logout.status).toBe(200);
    expect(await auth.api.getSession({ headers: new Headers({ cookie: account.cookie }) })).toBeNull();
    const login = await auth.handler(request("sign-in/email", { email: account.email, password: credential }));
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().find((v) => v.startsWith("mory.session_token="))!.split(";")[0];
    await db.authSession.updateMany({ where: { userId: account.userId }, data: { expiresAt: new Date(0) } });
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });
  it("rejects foreign origins, disables signup by default configuration and uses Secure on HTTPS", async () => {
    const foreign = await handleAuthenticationRequest(auth, origin, request("sign-up/email", { name: "No", email: `${randomUUID()}@example.test`, password: credential }, undefined, "https://attacker.invalid"));
    expect(foreign.status).toBe(403);
    expect((await handleAuthenticationRequest(auth, origin, request("sign-up/email", { payload: "a".repeat(17_000) }))).status).toBe(413);
    const closed = createAuthentication(db, { ...config, allowSignup: false });
    expect((await closed.handler(request("sign-up/email", { name: "No", email: `${randomUUID()}@example.test`, password: credential }))).ok).toBe(false);
    const secureOrigin = "https://mory.example";
    const secure = createAuthentication(db, { ...config, baseURL: secureOrigin, secure: true });
    const response = await secure.handler(new Request(`${secureOrigin}/api/auth/sign-up/email`, { method: "POST", headers: { "Content-Type": "application/json", origin: secureOrigin },
      body: JSON.stringify({ name: "Secure parent", email: `${randomUUID()}@example.test`, password: credential }) }));
    expect(response.status).toBe(200);
    userIds.push((await response.json()).user.id);
    expect(response.headers.getSetCookie().join(";")).toMatch(/; Secure/i);
  });
  it("shares atomic login throttling across auth instances without trusting spoofed IP headers", async () => {
    const other = createAuthentication(db, config);
    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? other : auth).handler(new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST", headers: { "Content-Type": "application/json", origin, "x-forwarded-for": `192.0.2.${i}` },
      body: JSON.stringify({ email: "absent@example.test", password: credential }),
    }))));
    expect(responses.filter((r) => r.status === 429)).toHaveLength(5);
    expect(responses.filter((r) => r.status === 401)).toHaveLength(5);
    expect(await db.authRateLimit.count()).toBeGreaterThan(0);
  });
  it("searches all rows with Vietnamese normalization and bounded scoped pagination", async () => {
    const a = await db.family.create({ data: { name: "Search A" } }); familyIds.push(a.id);
    const b = await db.family.create({ data: { name: "Search B" } }); familyIds.push(b.id);
    const child = await db.child.create({ data: { familyId: a.id, name: "Bé An", lifecycle: "AFTER_BIRTH", birthDate: new Date("2024-01-01Z") } });
    const other = await db.child.create({ data: { familyId: b.id, name: "Bé Bình", lifecycle: "AFTER_BIRTH", birthDate: new Date("2024-01-01Z") } });
    await db.event.createMany({ data: Array.from({ length: 60 }, (_, i) => ({ familyId: a.id, childId: child.id, title: i < 50 ? "Bước đầu tiên" : "100% yêu thương", description: "Đồng hành cùng con", date: new Date("2024-03-01Z"), type: "memory" as const })) });
    await db.event.create({ data: { familyId: b.id, childId: other.id, title: "Bước đầu tiên bí mật", date: new Date("2024-03-01Z"), type: "memory" } });
    const first = await queryFamilyEvents(db, a.id, child.id, { search: "BUOC DAU" });
    const second = await queryFamilyEvents(db, a.id, child.id, { search: "buoc dau" }, first.nextCursor);
    expect(first.events).toHaveLength(25); expect(second.events).toHaveLength(25); expect(second.nextCursor).toBeUndefined();
    expect(first.events[0].date).toBe("2024-03-01");
    const combined = [...first.events, ...second.events];
    expect(filterTimeline(combined).map((e) => e.id)).toEqual(combined.map((e) => e.id));
    expect(new Set([...first.events, ...second.events].map((e) => e.id)).size).toBe(50);
    expect((await queryFamilyEvents(db, a.id, child.id, { search: "%" })).events).toHaveLength(10);
    expect((await queryFamilyEvents(db, b.id, child.id, {})).events).toHaveLength(0);
    await expect(queryFamilyEvents(db, b.id, other.id, {}, first.events[0].id)).rejects.toThrow();
    expect((await queryFamilyEvents(db, a.id, child.id, { period: "upcoming" })).events).toHaveLength(0);
  });
  it("separates authenticated edge IP budgets and ignores spoofed forwarding headers", async () => {
    const previous = process.env.AUTH_TRUSTED_EDGE_SECRET; const edgeSecret = randomBytes(32).toString("hex"); process.env.AUTH_TRUSTED_EDGE_SECRET = edgeSecret;
    try {
      await db.authRateLimit.deleteMany(); const auth = createAuthentication(db, config);
      const login = (ip: string, trusted: boolean) => {
        const r = request("sign-in/email", { email: `${randomUUID()}@example.test`, password: credential });
        r.headers.set("x-mory-verified-ip", ip); r.headers.set("x-forwarded-for", ip); r.headers.set("x-mory-client-ip", ip);
        if (trusted) r.headers.set("x-mory-edge-secret", edgeSecret);
        return handleAuthenticationRequest(auth, origin, r);
      };
      for (let i=0;i<5;i++) expect((await login("192.0.2.1", true)).status).toBe(401);
      expect((await login("192.0.2.1", true)).status).toBe(429);
      expect((await login("192.0.2.2", true)).status).toBe(401);
      await db.authRateLimit.deleteMany();
      for (let i=1;i<=5;i++) expect((await login(`192.0.2.${i}`, false)).status).toBe(401);
      expect((await login("192.0.2.100", false)).status).toBe(429);
    } finally { if (previous === undefined) delete process.env.AUTH_TRUSTED_EDGE_SECRET; else process.env.AUTH_TRUSTED_EDGE_SECRET = previous; }
  });

  it("verifies the real current password through the server-only API", async () => {
    const f=await register(); const h=new Headers({cookie:f.cookie,origin,"content-type":"text/plain;charset=UTF-8"});
    expect(await auth.api.verifyPassword({headers:h,body:{password:credential}})).toMatchObject({status:true});
    await expect(auth.api.verifyPassword({headers:h,body:{password:"incorrect-local-password"}})).rejects.toThrow();
  });

});
