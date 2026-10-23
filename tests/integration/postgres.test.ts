import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDatabaseClient } from "@/server/db/client";
import { createDatabaseAuthorization } from "@/server/db/authorization";
import { createPostgresJourneyRepository } from "@/server/repositories/postgres-journey-repository";
import { createPostgresMediaRepository } from "@/server/repositories/postgres-media-repository";
import { createJourneyService } from "@/server/services/journey-service";
import { createFamilyJourneyService } from "@/server/services/family-journey-service";
import type { Child, Event } from "@/types/domain";

if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker")
  throw new Error("Use npm run test:db; integration tests require their own disposable database.");

const db = createDatabaseClient();
const repository = createPostgresJourneyRepository(db);
const media = createPostgresMediaRepository(db);
const authorization = createDatabaseAuthorization(db);
const families: string[] = [];
const users: string[] = [];

async function fixture(lifecycle: Child["lifecycle"] = "AFTER_BIRTH") {
  const family = await db.family.create({ data: { name: "Test family" } });
  families.push(family.id);
  const user = await db.user.create({ data: { displayName: "Test parent" } });
  users.push(user.id);
  await db.familyMember.create({ data: { familyId: family.id, userId: user.id, role: "OWNER" } });
  const child = await repository.createChild(family.id, {
    id: randomUUID(), familyId: family.id, name: "Bé An", lifecycle,
    dueDate: "2024-02-20", birthDate: lifecycle === "AFTER_BIRTH" ? "2024-02-10" : undefined,
    birthTime: lifecycle === "AFTER_BIRTH" ? "00:05" : undefined,
  });
  const session = { userId: user.id, familyId: family.id };
  const dependencies = { sessions: { requireSession: async () => session }, authorization, repository };
  return { familyId: family.id, child, session, journey: createJourneyService(dependencies), family: createFamilyJourneyService(dependencies) };
}
function eventFor(child: Child, extra: Partial<Event> = {}): Event {
  return { id: randomUUID(), childId: child.id, title: "Kỷ niệm đầu tiên", date: "2020-01-01", time: "23:59",
    type: "memory", description: "Ghi chú gia đình", images: [], reminder: false,
    createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z", ...extra };
}
function assetFor(familyId: string, eventId: string, childId: string) {
  const id = randomUUID();
  return { id, familyId, eventId, childId, purpose: "EVENT" as const, expiresAt: new Date(Date.now() + 300_000), objectKey: `families/${familyId}/events/${eventId}/${id}`,
    contentType: "image/jpeg" as const, byteLength: 100, status: "PENDING_VERIFICATION" as const };
}

afterAll(async () => {
  await db.mediaCleanupJob.deleteMany({ where: { familyId: { in: families } } });
  await db.family.deleteMany({ where: { id: { in: families } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

describe("PostgreSQL persistence and family isolation", () => {
  it("persists calendar dates and audit timestamps across fresh connections", async () => {
    const { familyId, child } = await fixture();
    const created = await repository.createEvent(familyId, eventFor(child, { date: "2024-02-29" }));
    expect(created.createdAt).not.toBe("2020-01-01T00:00:00.000Z");
    const edited = await repository.updateEvent(familyId, { ...created, date: "2024-03-01", title: "Kỷ niệm đã sửa", createdAt: "1999-01-01T00:00:00.000Z" });
    expect(edited.createdAt).toBe(created.createdAt);
    const fresh = createDatabaseClient();
    try {
      const found = await createPostgresJourneyRepository(fresh).findEvent(familyId, created.id);
      expect(found).toMatchObject({ date: "2024-03-01", time: "23:59", createdAt: created.createdAt, title: "Kỷ niệm đã sửa" });
      expect(await createPostgresJourneyRepository(fresh).findChild(familyId, child.id)).toMatchObject({ birthDate: "2024-02-10", birthTime: "00:05" });
    } finally { await fresh.$disconnect(); }
  });

  it("blocks cross-family reads, mutations, cursors and service access", async () => {
    const a = await fixture(); const b = await fixture();
    const event = await repository.createEvent(a.familyId, eventFor(a.child));
    expect(await repository.findEvent(b.familyId, event.id)).toBeNull();
    expect(await repository.findChild(b.familyId, a.child.id)).toBeNull();
    await expect(repository.updateEvent(b.familyId, event)).rejects.toThrow();
    await expect(repository.deleteEvent(b.familyId, event.id)).rejects.toThrow();
    await expect(repository.createEvent(b.familyId, eventFor(a.child))).rejects.toThrow();
    await expect(repository.listEvents(b.familyId, b.child.id, event.id)).rejects.toThrow();
    await expect(b.journey.getEvent(event.id)).rejects.toThrow();
    await expect(b.family.confirmBirth(a.child.id, { birthDate: "2024-02-10" })).rejects.toThrow();
    expect(await repository.findEvent(a.familyId, event.id)).not.toBeNull();
  });

  it("enforces tenant/child ownership through database foreign keys too", async () => {
    const a = await fixture(); const b = await fixture();
    await expect(db.event.create({ data: { id: randomUUID(), familyId: b.familyId, childId: a.child.id,
      title: "Cross family", date: new Date("2024-01-01Z"), type: "memory" } })).rejects.toThrow();
    const event = await repository.createEvent(a.familyId, eventFor(a.child));
    await expect(db.childMilestone.create({ data: { id: randomUUID(), familyId: b.familyId, childId: b.child.id,
      key: "bad-link", title: "Bad link", kind: "custom", state: "SUGGESTED", eventId: event.id } })).rejects.toThrow();
  });

  it("allows viewer reads, denies writes and immediately observes membership revocation", async () => {
    const f = await fixture();
    await db.familyMember.update({ where: { familyId_userId: f.session }, data: { role: "VIEWER" } });
    expect(await f.journey.listChildren()).toHaveLength(1);
    await expect(f.journey.createEvent(f.child.id, { title: "Cannot write", date: "2024-01-01", type: "memory", description: "" })).rejects.toThrow();
    await expect(f.family.createChild({ name: "Bé mới", lifecycle: "EXPECTING", dueDate: "2027-01-01" })).rejects.toThrow();
    await db.familyMember.delete({ where: { familyId_userId: f.session } });
    await expect(f.journey.listChildren()).rejects.toThrow();
  });

  it("pages equal-date/time events deterministically without duplicates", async () => {
    const { familyId, child } = await fixture();
    await db.event.createMany({ data: Array.from({ length: 57 }, (_, i) => ({
      id: randomUUID(), familyId, childId: child.id, title: `Event ${i}`, type: "memory" as const,
      date: new Date(i % 2 ? "2024-02-29Z" : "2024-03-01Z"), time: i % 3 ? "12:00" : "",
    })) });
    const pages: Event[] = []; let cursor: string | undefined;
    do { const page = await repository.listEvents(familyId, child.id, cursor); pages.push(...page.events); cursor = page.nextCursor; } while (cursor);
    expect(pages).toHaveLength(57);
    expect(new Set(pages.map((e) => e.id)).size).toBe(57);
    const expected = [...pages].sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? "") || b.id.localeCompare(a.id));
    expect(pages.map((e) => e.id)).toEqual(expected.map((e) => e.id));
  });

  it("confirms birth explicitly once and retains due date and history", async () => {
    const f = await fixture("EXPECTING");
    const event = await repository.createEvent(f.familyId, eventFor(f.child));
    expect((await repository.findChild(f.familyId, f.child.id))?.lifecycle).toBe("EXPECTING");
    expect(await f.family.snoozeBirthConfirmation(f.child.id, 2)).toMatchObject({ lifecycle: "EXPECTING", dueDate: "2024-02-20" });
    await expect(repository.updateChild(f.familyId, { ...f.child, lifecycle: "AFTER_BIRTH", birthDate: "2024-02-10" })).rejects.toThrow();
    const results = await Promise.allSettled([repository.confirmBirth(f.familyId, f.child.id, "2024-02-10", "00:05"), repository.confirmBirth(f.familyId, f.child.id, "2024-02-11")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await repository.findChild(f.familyId, f.child.id)).toMatchObject({ lifecycle: "AFTER_BIRTH", dueDate: "2024-02-20" });
    expect(await repository.findEvent(f.familyId, event.id)).not.toBeNull();
    await expect(repository.updateChild(f.familyId, { ...f.child, lifecycle: "AFTER_BIRTH", birthDate: "2024-02-10" })).resolves.toBeDefined();
  });

  it("disables existing reminders atomically on pause and resumes explicitly", async () => {
    const f = await fixture();
    const event = await repository.createEvent(f.familyId, eventFor(f.child, { reminder: true }));
    await db.reminder.create({ data: { familyId: f.familyId, childId: f.child.id, eventId: event.id, scheduledAt: new Date() } });
    expect(await repository.setTrackingState(f.familyId, f.child.id, "PAUSED")).toMatchObject({ lifecycle: "PAUSED", reminderEnabled: false });
    expect(await db.reminder.count({ where: { familyId: f.familyId, enabled: true } })).toBe(0);
    expect((await repository.findEvent(f.familyId, event.id))?.reminder).toBe(false);
    expect(await f.family.updateChild(f.child.id, { name: "Bé đổi tên", lifecycle: "PAUSED", birthDate: "2024-02-10", birthTime: "", dueDate: "" })).toMatchObject({ lifecycle: "PAUSED", reminderEnabled: false, name: "Bé đổi tên" });
    await expect(repository.createEvent(f.familyId, eventFor(f.child, { reminder: true }))).rejects.toThrow();
    expect((await repository.setTrackingState(f.familyId, f.child.id, "RESUME")).lifecycle).toBe("AFTER_BIRTH");
    expect(await db.reminder.count({ where: { familyId: f.familyId, enabled: true } })).toBe(0);
  });

  it("serializes milestone confirmations into one event and preserves chosen dates", async () => {
    const f = await fixture();
    const results = await Promise.all([repository.confirmMilestone(f.familyId, f.child.id, "full-month", "2024-03-20"), repository.confirmMilestone(f.familyId, f.child.id, "full-month", "2024-03-21")]);
    expect(results[0].eventId).toBe(results[1].eventId);
    expect(await db.event.count({ where: { familyId: f.familyId } })).toBe(1);
    const original = await repository.findEvent(f.familyId, results[0].eventId!);
    await repository.updateChild(f.familyId, { ...f.child, birthDate: "2024-02-11", calendarRule: "MINUS_TWO" });
    const milestone = (await repository.listMilestones(f.familyId, f.child.id)).find((m) => m.key === "full-month")!;
    expect(milestone.ceremonyDate).toBe(original!.date);
    await repository.confirmMilestone(f.familyId, f.child.id, "full-month", "2024-03-22");
    expect(await repository.findEvent(f.familyId, original!.id)).toMatchObject({ date: "2024-03-22", createdAt: original!.createdAt });
  });

  it("rolls back the event if its linked milestone cannot be saved", async () => {
    const f = await fixture(); const other = await fixture();
    await db.childMilestone.create({ data: { id: `${f.child.id}:full-month`, familyId: other.familyId, childId: other.child.id,
      key: "collision", title: "Collision", kind: "custom", state: "SUGGESTED" } });
    await expect(repository.confirmMilestone(f.familyId, f.child.id, "full-month", "2024-03-20")).rejects.toThrow();
    expect(await db.event.count({ where: { familyId: f.familyId } })).toBe(0);
    expect(await db.childMilestone.count({ where: { familyId: f.familyId } })).toBe(0);
  });

  it("stores undated custom milestones without events and creates dated ones atomically", async () => {
    const f = await fixture();
    const undated = await f.family.createCustomMilestone(f.child.id, { title: "Bước đầu tiên", description: "Theo nhịp của con", date: "" });
    expect(undated).toMatchObject({ state: "SUGGESTED", eventId: undefined });
    expect(await db.event.count({ where: { familyId: f.familyId } })).toBe(0);
    const confirmed = await f.family.confirmMilestone(f.child.id, undated.key, "2024-06-01");
    expect(await repository.findEvent(f.familyId, confirmed.eventId!)).toMatchObject({ description: "Theo nhịp của con", date: "2024-06-01" });
    const dated = await f.family.createCustomMilestone(f.child.id, { title: "Ngày đặc biệt", description: "Ghi nhớ", date: "2024-07-01" });
    expect(dated.eventId).toBeDefined();
    const event = await repository.findEvent(f.familyId, dated.eventId!);
    await repository.updateEvent(f.familyId, { ...event!, date: "2024-07-02", title: "Ngày đã sửa" });
    expect((await repository.listMilestones(f.familyId, f.child.id)).find((m) => m.id === dated.id)).toMatchObject({ confirmedDate: "2024-07-02", title: "Ngày đã sửa" });
  });

  it("enforces a 12-image quota under concurrent reservations", async () => {
    const f = await fixture(); const event = await repository.createEvent(f.familyId, eventFor(f.child));
    const assets = Array.from({ length: 18 }, () => assetFor(f.familyId, event.id, f.child.id));
    const results = await Promise.allSettled(assets.map((asset) => media.reservePending(asset, 12)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(12);
    expect(await db.mediaAsset.count({ where: { familyId: f.familyId, eventId: event.id } })).toBe(12);
    const accepted = assets[results.findIndex((r) => r.status === "fulfilled")];
    expect(await media.markRejected(f.familyId, accepted.id)).toBe(true);
    expect(await media.markRejected(f.familyId, accepted.id)).toBe(false);
    await expect(media.reservePending(assetFor(f.familyId, event.id, f.child.id), 12)).resolves.toBeUndefined();
  });

  it("keeps milestone state transitions explicit and date validated", async () => {
    const f = await fixture();
    await expect(f.family.setMilestoneState(f.child.id, "full-month", "COMPLETED")).rejects.toThrow();
    const skipped = await f.family.setMilestoneState(f.child.id, "full-month", "SKIPPED");
    expect(skipped.state).toBe("SKIPPED");
    const confirmed = await f.family.confirmMilestone(f.child.id, "full-month", "2024-03-20");
    await expect(f.family.setMilestoneState(f.child.id, "full-month", "SKIPPED")).rejects.toThrow();
    expect((await f.family.setMilestoneState(f.child.id, "full-month", "COMPLETED")).state).toBe("COMPLETED");
    const event = await repository.findEvent(f.familyId, confirmed.eventId!);
    await db.reminder.create({ data: { familyId: f.familyId, childId: f.child.id, eventId: event!.id, scheduledAt: new Date() } });
    await repository.updateEvent(f.familyId, { ...event!, date: "2199-03-20", reminder: true });
    expect((await repository.listMilestones(f.familyId, f.child.id)).find((m) => m.id === confirmed.id)?.state).toBe("CONFIRMED");
    expect(await db.reminder.count({ where: { familyId: f.familyId, enabled: true } })).toBe(0);
    await expect(f.family.setMilestoneState(f.child.id, "full-month", "COMPLETED")).rejects.toThrow();
    expect(await repository.findEvent(f.familyId, event!.id)).toMatchObject({ createdAt: event!.createdAt, date: "2199-03-20" });
    await db.reminder.create({ data: { familyId: f.familyId, childId: f.child.id, eventId: event!.id, scheduledAt: new Date() } });
    await f.family.confirmMilestone(f.child.id, "full-month", "2198-03-20");
    expect(await db.reminder.count({ where: { familyId: f.familyId, enabled: true } })).toBe(0);
  });

  it("creates child profiles using server IDs and the verified session family", async () => {
    const f = await fixture();
    const child = await f.family.createChild({ id: "untrusted", familyId: randomUUID(), name: "", lifecycle: "EXPECTING", dueDate: "2027-01-01", birthDate: "", birthTime: "" });
    expect(child).toMatchObject({ familyId: f.familyId, lifecycle: "EXPECTING", dueDate: "2027-01-01" });
    expect(child.id).not.toBe("untrusted");
  });

  it("scopes media access and never rejects a verified image in a finalization race", async () => {
    const a = await fixture(); const b = await fixture();
    const event = await repository.createEvent(a.familyId, eventFor(a.child));
    const asset = assetFor(a.familyId, event.id, a.child.id);
    await media.reservePending(asset, 12);
    expect(await media.findById(b.familyId, asset.id)).toBeNull();
    await expect(media.markReady(b.familyId, asset.id, { width: 10, height: 10, byteLength: 100 })).rejects.toThrow();
    expect(await media.markRejected(b.familyId, asset.id)).toBe(false);
    await media.markReady(a.familyId, asset.id, { width: 10, height: 10, byteLength: 100 });
    expect(await media.markRejected(a.familyId, asset.id)).toBe(false);
    expect((await media.findById(a.familyId, asset.id))?.status).toBe("READY");
  });

  it("deletes events and reminders, preserves journals and queues every private object", async () => {
    const f = await fixture();
    const milestone = await repository.confirmMilestone(f.familyId, f.child.id, "full-month", "2024-03-20");
    const eventId = milestone.eventId!; const asset = assetFor(f.familyId, eventId, f.child.id);
    await media.reservePending(asset, 12);
    const entry = await db.journeyEntry.create({ data: { familyId: f.familyId, childId: f.child.id, eventId, body: "Nhật ký thai kỳ còn nguyên", date: new Date("2024-01-01Z") } });
    await db.reminder.create({ data: { familyId: f.familyId, childId: f.child.id, eventId, scheduledAt: new Date() } });
    await repository.deleteEvent(f.familyId, eventId);
    expect(await repository.findEvent(f.familyId, eventId)).toBeNull();
    expect(await db.mediaAsset.count({ where: { familyId: f.familyId } })).toBe(0);
    expect(await db.reminder.count({ where: { familyId: f.familyId } })).toBe(0);
    expect(await db.journeyEntry.findUnique({ where: { id: entry.id } })).toMatchObject({ eventId: null, body: "Nhật ký thai kỳ còn nguyên" });
    expect(await db.mediaCleanupJob.findFirst({ where: { familyId: f.familyId } })).toMatchObject({ objectKey: asset.objectKey, completedAt: null });
    expect((await repository.listMilestones(f.familyId, f.child.id)).find((m) => m.id === milestone.id)).toMatchObject({ eventId: undefined, ceremonyDate: "2024-03-20" });
  });

  it("rejects invalid database lifecycle, date and media metadata", async () => {
    const f = await fixture();
    await expect(db.child.update({ where: { id: f.child.id }, data: { lifecycle: "EXPECTING" } })).rejects.toThrow();
    await expect(db.child.update({ where: { id: f.child.id }, data: { birthDate: new Date("2200-01-01Z") } })).rejects.toThrow();
    await expect(repository.createEvent(f.familyId, eventFor(f.child, { images: ["https://public.invalid/private.jpg"] }))).rejects.toThrow();
    await expect(repository.createEvent(f.familyId, eventFor(f.child, { date: "2024-02-30" }))).rejects.toThrow();
    const event = await repository.createEvent(f.familyId, eventFor(f.child));
    await expect(db.mediaAsset.create({ data: { ...assetFor(f.familyId, event.id, f.child.id), childId: f.child.id,
      status: "READY", width: 100_000, height: 100_000 } })).rejects.toThrow();
  });
});
