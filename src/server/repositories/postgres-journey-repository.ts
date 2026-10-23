import "server-only";

import { setAuditActor, assertFamilyWrite } from "../db/audit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../db/generated/client";
import type { Child, ChildMilestone, DemoData, Event } from "@/types/domain";
import type { FamilyJourneyRepository } from "./journey-repository";
import { persistedChildSchema, eventSchema } from "@/lib/validation";
import { confirmBirth, changeTrackingState, resumeTracking, snoozeBirthConfirmation } from "@/features/children/domain";
import { generateMilestones, confirmMilestoneEvent, createCustomMilestone } from "@/features/milestones";
import { mapChild, mapEvent, mapMilestone, toDate } from "../db/mappers";
import { PersistenceConflictError, ResourceNotFoundError } from "../db/errors";
import { todayVN } from "@/lib/dates";

type Tx = Prisma.TransactionClient;
const uuid = z.uuid();
const eventInput = eventSchema.omit({ images: true }).extend({ images: z.array(z.never()).max(0) });
const childInput = persistedChildSchema.safeExtend({ id: uuid, avatar: z.never().optional() });
const transactionOptions = { maxWait: 10_000, timeout: 15_000 };

/** All journey writes lock the child first. Concurrent confirmations cannot create duplicate events. */
async function lockChild(tx: Tx, familyId: string, childId: string, actorId?: string) {
  uuid.parse(familyId); uuid.parse(childId);
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Child" WHERE "familyId" = ${familyId}::uuid AND "id" = ${childId}::uuid FOR UPDATE`;
  if (!rows.length) throw new ResourceNotFoundError();
  await assertFamilyWrite(tx, familyId, actorId);
  return mapChild(await tx.child.findUniqueOrThrow({ where: { familyId_id: { familyId, id: childId } } }));
}
function childValues(child: Child) {
  const value = childInput.parse({ ...child, avatar: undefined, birthDate: child.birthDate || undefined, dueDate: child.dueDate || undefined, birthTime: child.birthTime || undefined });
  return {
    name: value.name, nickname: value.nickname || null, lifecycle: value.lifecycle,
    dueDate: toDate(value.dueDate), birthDate: toDate(value.birthDate), birthTime: value.birthTime || null,
    gender: value.gender ?? null, calendarRule: value.calendarRule ?? "SAME_DAY",
    leapMonthRule: value.leapMonthRule ?? "REGULAR_MONTH", reminderEnabled: value.reminderEnabled ?? true,
    trackingUntilAge: value.trackingUntilAge ?? 18, dueReminderSnoozedUntil: toDate(value.dueReminderSnoozedUntil),
  };
}
function eventValues(event: Event) {
  const value = eventInput.parse({ ...event, images: [] });
  return { title: value.title, date: toDate(value.date)!, time: value.time || "", type: value.type,
    description: value.description, reminder: value.reminder };
}
function milestoneValues(m: ChildMilestone) {
  return {
    title: m.title, kind: m.kind === "full-month" ? "full_month" as const : m.kind === "first-birthday" ? "first_birthday" as const : m.kind,
    state: m.state, suggestedDate: toDate(m.suggestedDate), confirmedDate: toDate(m.confirmedDate),
    ceremonyDate: toDate(m.ceremonyDate), needsDateConfirmation: m.needsDateConfirmation,
    description: m.description, age: m.age ?? null, eventId: m.eventId ?? null,
  };
}
async function milestoneSnapshot(tx: Tx, familyId: string, child: Child): Promise<DemoData> {
  const saved = (await tx.childMilestone.findMany({ where: { familyId, childId: child.id } })).map(mapMilestone);
  return { children: [child], activeChildId: child.id, milestones: generateMilestones(child, saved),
    events: (await tx.event.findMany({ where: { familyId, childId: child.id, milestone: { isNot: null } } })).map(mapEvent) };
}
async function saveMilestoneChange(tx: Tx, familyId: string, next: DemoData, key: string) {
  const milestone = next.milestones!.find((m) => m.key === key)!;
  const event = next.events.find((e) => e.id === milestone.eventId);
  if (event) {
    const previous = await tx.event.findFirst({ where: { familyId, childId: event.childId, id: event.id } });
    if (previous && (previous.date.toISOString().slice(0, 10) !== event.date || previous.time !== (event.time || "")))
      await tx.reminder.updateMany({ where: { familyId, eventId: event.id }, data: { enabled: false } });
    await tx.event.upsert({
      where: { familyId_childId_id: { familyId, childId: event.childId, id: event.id } },
      create: { ...eventValues(event), id: event.id, childId: event.childId, familyId },
      update: eventValues(event),
    });
  }
  const row = await tx.childMilestone.upsert({
    where: { familyId_childId_key: { familyId, childId: milestone.childId, key } },
    create: { ...milestoneValues(milestone), id: milestone.id, familyId, childId: milestone.childId, key },
    update: milestoneValues(milestone),
  });
  return mapMilestone(row);
}

/** Internal persistence adapter. Call through authenticated services, never from client code. */
export function createPostgresJourneyRepository(db: PrismaClient, actorId?: string): FamilyJourneyRepository {
  const transact = <T>(callback: (tx: Tx) => Promise<T>, options = transactionOptions) =>
    db.$transaction(async (tx) => { await setAuditActor(tx, actorId); return callback(tx); }, options);
  const scopedEvent = (familyId: string, id: string) => db.event.findFirst({ where: { familyId, id }, include: { media: { where: { status: "READY", purpose: "EVENT" }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
  return {
    async listChildren(familyId) {
      return (await db.child.findMany({ where: { familyId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(mapChild);
    },
    async findChild(familyId, id) {
      const row = await db.child.findFirst({ where: { familyId, id } });
      return row ? mapChild(row) : null;
    },
    async createChild(familyId, child) {
      z.never().optional().parse(child.avatar);
      if (child.familyId && child.familyId !== familyId) throw new ResourceNotFoundError();
      return transact(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id"=${familyId}::uuid FOR NO KEY UPDATE`;
        await assertFamilyWrite(tx, familyId, actorId);
        return mapChild(await tx.child.create({ data: { ...childValues(child), familyId, id: child.id } }));
      });
    },
    async updateChild(familyId, child) {
      return transact(async (tx) => {
        const existing = await lockChild(tx, familyId, child.id, actorId);
        if (child.familyId && child.familyId !== familyId) throw new ResourceNotFoundError();
        if (existing.lifecycle !== child.lifecycle) throw new PersistenceConflictError("Vui lòng dùng thao tác chuyển giai đoạn riêng.");
        const values = childValues({ ...child,
          reminderEnabled: child.reminderEnabled ?? existing.reminderEnabled,
          trackingUntilAge: child.trackingUntilAge ?? existing.trackingUntilAge,
          calendarRule: child.calendarRule ?? existing.calendarRule,
          leapMonthRule: child.leapMonthRule ?? existing.leapMonthRule,
          dueReminderSnoozedUntil: existing.dueReminderSnoozedUntil,
        });
        return mapChild(await tx.child.update({ where: { familyId_id: { familyId, id: child.id } }, data: values }));
      }, transactionOptions);
    },
    async confirmBirth(familyId, childId, date, time) {
      return transact(async (tx) => {
        const child = confirmBirth(await lockChild(tx, familyId, childId, actorId), date, time);
        return mapChild(await tx.child.update({ where: { familyId_id: { familyId, id: childId } }, data: childValues(child) }));
      }, transactionOptions);
    },
    async setTrackingState(familyId, childId, state) {
      return transact(async (tx) => {
        const existing = await lockChild(tx, familyId, childId, actorId);
        if (state === "RESUME" && !["PAUSED", "ENDED"].includes(existing.lifecycle)) throw new PersistenceConflictError();
        const child = state === "RESUME" ? resumeTracking(existing) : changeTrackingState(existing, state);
        if (state !== "RESUME") {
          await tx.reminder.updateMany({ where: { familyId, childId }, data: { enabled: false } });
          await tx.event.updateMany({ where: { familyId, childId, reminder: true }, data: { reminder: false } });
        }
        return mapChild(await tx.child.update({ where: { familyId_id: { familyId, id: childId } }, data: childValues(child) }));
      }, transactionOptions);
    },
    async snoozeBirthConfirmation(familyId, childId, days) {
      z.number().int().min(1).max(30).parse(days);
      return transact(async (tx) => {
        const existing = await lockChild(tx, familyId, childId, actorId);
        if (existing.lifecycle !== "EXPECTING") throw new PersistenceConflictError();
        const child = snoozeBirthConfirmation(existing, todayVN(), days);
        return mapChild(await tx.child.update({ where: { familyId_id: { familyId, id: childId } }, data: childValues(child) }));
      }, transactionOptions);
    },
    async listEvents(familyId, childId, cursor) {
      const boundary = cursor ? await db.event.findFirst({ where: { familyId, childId, id: uuid.parse(cursor) } }) : null;
      if (cursor && !boundary) throw new ResourceNotFoundError();
      const rows = await db.event.findMany({
        where: { familyId, childId, ...(boundary ? { OR: [
          { date: { lt: boundary.date } },
          { date: boundary.date, time: { lt: boundary.time } },
          { date: boundary.date, time: boundary.time, id: { lt: boundary.id } },
        ] } : {}) },
        orderBy: [{ date: "desc" }, { time: "desc" }, { id: "desc" }], take: 26,
        include: { media: { where: { status: "READY", purpose: "EVENT" }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      });
      const page = rows.slice(0, 25);
      return { events: page.map(mapEvent), nextCursor: rows.length > 25 ? page.at(-1)!.id : undefined };
    },
    async findEvent(familyId, id) {
      const row = await scopedEvent(familyId, id);
      return row ? mapEvent(row) : null;
    },
    async createEvent(familyId, event) {
      eventInput.parse(event);
      return transact(async (tx) => {
        const child = await lockChild(tx, familyId, event.childId, actorId);
        if (event.reminder && ["PAUSED", "ENDED"].includes(child.lifecycle)) throw new PersistenceConflictError();
        return mapEvent(await tx.event.create({ data: { ...eventValues(event), id: uuid.parse(event.id), childId: event.childId, familyId } }));
      }, transactionOptions);
    },
    async updateEvent(familyId, event) {
      return transact(async (tx) => {
        const child = await lockChild(tx, familyId, event.childId, actorId);
        const existing = await tx.event.findFirst({ where: { familyId, childId: event.childId, id: event.id } });
        if (!existing) throw new ResourceNotFoundError();
        if (event.reminder && ["PAUSED", "ENDED"].includes(child.lifecycle)) throw new PersistenceConflictError();
        if (!event.reminder || existing.date.toISOString().slice(0, 10) !== event.date || existing.time !== (event.time || ""))
          await tx.reminder.updateMany({ where: { familyId, eventId: event.id }, data: { enabled: false } });
        const linked = await tx.childMilestone.findFirst({ where: { familyId, childId: event.childId, eventId: event.id } });
        if (linked) await tx.childMilestone.update({
          where: { familyId_childId_id: { familyId, childId: event.childId, id: linked.id } },
          data: event.type !== "milestone" ? { eventId: null } : {
            confirmedDate: toDate(event.date), ceremonyDate: ["full_month", "first_birthday"].includes(linked.kind) ? toDate(event.date) : linked.ceremonyDate,
            ...(linked.state === "COMPLETED" && event.date > todayVN() ? { state: "CONFIRMED" } : {}),
            ...(linked.kind === "custom" ? { title: event.title, description: event.description } : {}),
          },
        });
        return mapEvent(await tx.event.update({ where: { familyId_childId_id: { familyId, childId: event.childId, id: event.id } }, data: eventValues(event) }));
      }, transactionOptions);
    },
    async deleteEvent(familyId, eventId) {
      const event = await scopedEvent(familyId, eventId);
      if (!event) throw new ResourceNotFoundError();
      await transact(async (tx) => {
        await lockChild(tx, familyId, event.childId, actorId);
        // The same lock used by media reservations makes the cleanup list complete.
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Event" WHERE "familyId" = ${familyId}::uuid AND "id" = ${eventId}::uuid FOR UPDATE`;
        if (!rows.length) throw new ResourceNotFoundError();
        const assets = await tx.mediaAsset.findMany({ where: { familyId, eventId }, select: { objectKey: true, status: true, expiresAt: true } });
        if (assets.length) await tx.mediaCleanupJob.createMany({ data: assets.map((asset) => ({ familyId, objectKey: asset.objectKey, notBefore: asset.status === "PENDING_VERIFICATION" ? asset.expiresAt : undefined })) });
        await tx.reminder.deleteMany({ where: { familyId, eventId } });
        await tx.childMilestone.updateMany({ where: { familyId, eventId }, data: { eventId: null } });
        await tx.journeyEntry.updateMany({ where: { familyId, eventId }, data: { eventId: null } });
        await tx.event.delete({ where: { familyId_childId_id: { familyId, childId: event.childId, id: eventId } } });
      }, transactionOptions);
    },
    async listMilestones(familyId, childId) {
      const row = await db.child.findFirst({ where: { familyId, id: childId } });
      if (!row) throw new ResourceNotFoundError();
      const saved = (await db.childMilestone.findMany({ where: { familyId, childId } })).map(mapMilestone);
      return generateMilestones(mapChild(row), saved);
    },
    async confirmMilestone(familyId, childId, key, date) {
      return transact(async (tx) => {
        const child = await lockChild(tx, familyId, childId, actorId);
        const data = await milestoneSnapshot(tx, familyId, child);
        const milestone = data.milestones!.find((m) => m.key === key);
        if (!milestone) throw new ResourceNotFoundError();
        const next = confirmMilestoneEvent(data, milestone, date, { eventId: randomUUID(), timestamp: new Date().toISOString() });
        return saveMilestoneChange(tx, familyId, next, key);
      }, transactionOptions);
    },
    async createCustomMilestone(familyId, childId, input) {
      return transact(async (tx) => {
        const child = await lockChild(tx, familyId, childId, actorId);
        const data = await milestoneSnapshot(tx, familyId, child);
        const id = randomUUID();
        const next = createCustomMilestone(data, input, { id, eventId: randomUUID(), timestamp: new Date().toISOString() });
        return saveMilestoneChange(tx, familyId, next, `custom:${id}`);
      }, transactionOptions);
    },
    async setMilestoneState(familyId, childId, key, state) {
      z.enum(["COMPLETED", "SKIPPED"]).parse(state);
      return transact(async (tx) => {
        const child = await lockChild(tx, familyId, childId, actorId);
        if (["PAUSED", "ENDED"].includes(child.lifecycle)) throw new PersistenceConflictError();
        const data = await milestoneSnapshot(tx, familyId, child);
        const milestone = data.milestones!.find((m) => m.key === key);
        if (!milestone || milestone.kind === "due") throw new ResourceNotFoundError();
        const date = milestone.ceremonyDate ?? milestone.confirmedDate;
        if ((state === "COMPLETED" && (!date || date > todayVN())) || (state === "SKIPPED" && date))
          throw new PersistenceConflictError("Trạng thái không phù hợp với ngày đã xác nhận.");
        const values = milestoneValues({ ...milestone, state });
        const row = await tx.childMilestone.upsert({
          where: { familyId_childId_key: { familyId, childId, key } },
          create: { ...values, id: milestone.id, familyId, childId, key }, update: values,
        });
        await tx.reminder.updateMany({ where: { familyId, childId, OR: [
          { milestoneId: milestone.id }, ...(milestone.eventId ? [{ eventId: milestone.eventId }] : []),
        ] }, data: { enabled: false } });
        if (milestone.eventId) await tx.event.updateMany({ where: { familyId, childId, id: milestone.eventId, reminder: true }, data: { reminder: false } });
        return mapMilestone(row);
      }, transactionOptions);
    },
  };
}
