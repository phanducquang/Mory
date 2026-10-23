import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDatabaseClient } from "@/server/db/client";
import { scheduleReminders } from "@/server/reminders/scheduler";
import { readMailQueueConfig } from "@/server/mail/config";
import { maintainAuthMail, smtpSender } from "@/server/mail/maintenance";
import { openMail } from "@/server/mail/crypto";
import { createPostgresJourneyRepository } from "@/server/repositories/postgres-journey-repository";
import { todayVN } from "@/lib/dates";
if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use the disposable database runner.");
const db = createDatabaseClient(); const families: string[] = []; const users: string[] = [];
const origin = "http://127.0.0.1:3100";
async function fixture() {
  const family = await db.family.create({ data: { name: "Reminder family" } }); families.push(family.id);
  const user = await db.user.create({ data: { email: `${randomUUID()}@example.test`, displayName: "Reminder parent", emailVerified: true, preference: { create: { notificationsEnabled: true } } } }); users.push(user.id);
  await db.familyMember.create({ data: { familyId: family.id, userId: user.id, role: "OWNER" } });
  const child = await db.child.create({ data: { familyId: family.id, name: "PRIVATE_CHILD_NAME", lifecycle: "AFTER_BIRTH", birthDate: new Date("2024-02-10Z") } });
  const future = new Date(Date.now() + 3 * 3_600_000);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(future);
  const event = await db.event.create({ data: { familyId: family.id, childId: child.id, title: "PRIVATE_EVENT_TITLE", date: new Date(`${todayVN(future)}T00:00:00Z`), time, type: "memory", reminder: true } });
  return { family, user, child, event };
}
beforeEach(async () => { await db.family.deleteMany({ where: { id: { in: families } } }); await db.user.deleteMany({ where: { id: { in: users } } }); families.length = 0; users.length = 0; await db.workerCheckpoint.deleteMany(); });
afterAll(async () => { await db.family.deleteMany({ where: { id: { in: families } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect(); });
describe.skipIf(process.env.AUTH_EMAIL_ENABLED !== "true")("opt-in reminder delivery", () => {
  it("schedules one private email per occurrence/recipient across concurrent planners and sends through SMTP", async () => {
    const f = await fixture(); const config = readMailQueueConfig();
    await Promise.all([scheduleReminders(db, origin), scheduleReminders(db, origin)]);
    const jobs = await db.authMailJob.findMany({ where: { familyId: f.family.id } }); expect(jobs).toHaveLength(1);
    const message = openMail(jobs[0].payload!, config.key, "REMINDER");
    expect(message.text).not.toContain(f.child.name); expect(message.text).not.toContain(f.event.title); expect(message.text).toContain(`/events/${f.event.id}`);
    const smtp = smtpSender();
    try { await maintainAuthMail(db, config.key, (p, id) => smtp.send(p, id), true); } finally { smtp.close(); }
    expect(await db.authMailJob.findUnique({ where: { id: jobs[0].id } })).toMatchObject({ status: "SENT", payload: null });
    const inbox = await (await fetch(`${process.env.MORY_TEST_INBOX}/messages`)).json() as { recipients: string[] }[];
    expect(inbox.filter((m) => m.recipients.some((to) => to.includes(f.user.email!)))).toHaveLength(1);
    await scheduleReminders(db, origin); expect(await db.authMailJob.count({ where: { familyId: f.family.id } })).toBe(1);
  });
  it("does not enqueue for non-opted-in, unverified or paused recipients/profiles", async () => {
    const f = await fixture(); await db.userPreference.update({ where: { userId: f.user.id }, data: { notificationsEnabled: false } });
    await scheduleReminders(db, origin); expect(await db.authMailJob.count({ where: { familyId: f.family.id } })).toBe(0);
    await db.userPreference.update({ where: { userId: f.user.id }, data: { notificationsEnabled: true } });
    await db.user.update({ where: { id: f.user.id }, data: { emailVerified: false } });
    await scheduleReminders(db, origin); expect(await db.authMailJob.count({ where: { familyId: f.family.id } })).toBe(0);
    await db.user.update({ where: { id: f.user.id }, data: { emailVerified: true } });
    await createPostgresJourneyRepository(db).setTrackingState(f.family.id, f.child.id, "PAUSED");
    await scheduleReminders(db, origin); expect(await db.authMailJob.count({ where: { familyId: f.family.id } })).toBe(0);
  });
  it.each(["optout", "pause", "edit", "disable", "revoke", "delete"] as const)("rechecks %s before SMTP and wipes/cascades queued mail", async (change) => {
    const f = await fixture(); await scheduleReminders(db, origin);
    const job = await db.authMailJob.findFirstOrThrow({ where: { familyId: f.family.id } });
    if (change === "optout") await db.userPreference.update({ where: { userId: f.user.id }, data: { notificationsEnabled: false } });
    if (change === "pause") await createPostgresJourneyRepository(db).setTrackingState(f.family.id, f.child.id, "PAUSED");
    if (change === "edit") await db.event.update({ where: { id: f.event.id }, data: { time: f.event.time === "10:00" ? "11:00" : "10:00" } });
    if (change === "disable") await db.event.update({ where: { id: f.event.id }, data: { reminder: false } });
    if (change === "revoke") await db.familyMember.delete({ where: { familyId_userId: { familyId: f.family.id, userId: f.user.id } } });
    if (change === "delete") await createPostgresJourneyRepository(db).deleteEvent(f.family.id, f.event.id);
    const send = vi.fn(); await maintainAuthMail(db, readMailQueueConfig().key, send, true);
    expect(send).not.toHaveBeenCalled();
    const current = await db.authMailJob.findUnique({ where: { id: job.id } });
    if (current) expect(current).toMatchObject({ status: "CANCELLED", payload: null });
  });
  it("resumes a bounded fanout scan after 100 recipients without duplicates", async () => {
    const f = await fixture();
    const ids = Array.from({ length: 101 }, () => randomUUID()); users.push(...ids);
    await db.user.createMany({ data: ids.map((id) => ({ id, email: `${id}@example.test`, displayName: "Fanout test", emailVerified: true })) });
    await db.userPreference.createMany({ data: ids.map((userId) => ({ userId, notificationsEnabled: true })) });
    await db.familyMember.createMany({ data: ids.map((userId) => ({ familyId: f.family.id, userId, role: "VIEWER" as const })) });
    const first = await scheduleReminders(db, origin); expect(first.scanned).toBe(100); expect(first.queued).toBe(100);
    expect((await db.workerCheckpoint.findUniqueOrThrow({ where: { key: "event-email-reminders" } })).cursor).not.toBeNull();
    const second = await scheduleReminders(db, origin); expect(second.queued).toBe(2);
    expect(await db.authMailJob.count({ where: { familyId: f.family.id } })).toBe(102);
    expect((await db.workerCheckpoint.findUniqueOrThrow({ where: { key: "event-email-reminders" } })).cursor).toBeNull();
  });
  it("lets viewers opt into their own mail and never crosses a family membership", async () => {
    const a = await fixture(); const b = await fixture();
    await db.familyMember.update({ where: { familyId_userId: { familyId: a.family.id, userId: a.user.id } }, data: { role: "VIEWER" } });
    await scheduleReminders(db, origin);
    expect((await db.authMailJob.findMany({ where: { familyId: a.family.id } })).map((j) => j.recipientUserId)).toEqual([a.user.id]);
    expect((await db.authMailJob.findMany({ where: { familyId: b.family.id } })).map((j) => j.recipientUserId)).toEqual([b.user.id]);
  });
});
