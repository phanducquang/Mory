"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { accountServices, loadAccountSnapshot } from "@/server/services/account-journey";
import { queryFamilyEvents } from "@/server/repositories/postgres-event-query";
import { ResourceNotFoundError, PersistenceConflictError } from "@/server/db/errors";
import { readAuthConfig } from "@/server/auth/config";

const operationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("createChild"), input: z.unknown() }),
  z.object({ kind: z.literal("updateChild"), childId: z.uuid(), input: z.unknown() }),
  z.object({ kind: z.literal("birth"), childId: z.uuid(), input: z.unknown() }),
  z.object({ kind: z.literal("tracking"), childId: z.uuid(), state: z.enum(["PAUSED", "ENDED", "RESUME"]) }),
  z.object({ kind: z.literal("snooze"), childId: z.uuid(), days: z.number().int().min(1).max(30) }),
  z.object({ kind: z.literal("createEvent"), childId: z.uuid(), input: z.unknown() }),
  z.object({ kind: z.literal("updateEvent"), eventId: z.uuid(), input: z.unknown() }),
  z.object({ kind: z.literal("deleteEvent"), eventId: z.uuid() }),
  z.object({ kind: z.literal("custom"), childId: z.uuid(), input: z.unknown() }),
  z.object({ kind: z.literal("confirm"), childId: z.uuid(), key: z.string().min(1).max(160), date: z.string().max(10) }),
  z.object({ kind: z.literal("milestoneState"), childId: z.uuid(), key: z.string().min(1).max(160), state: z.enum(["COMPLETED", "SKIPPED"]) }),
]);
function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.";
  if (error instanceof ResourceNotFoundError || error instanceof PersistenceConflictError) return error.message;
  return "Chưa thể lưu thay đổi. Vui lòng tải lại và thử lại.";
}
export async function mutateJourney(raw: unknown) {
  const { family, journey } = await accountServices(); // Verified session on every invocation, outside error handling of redirects.
  try {
    const op = operationSchema.parse(raw);
    let createdEventId: string | undefined;
    switch (op.kind) {
      case "createChild": { const child = await family.createChild(op.input); await selectChild(child.id); return { ok: true as const, snapshot: await loadAccountSnapshot(child.id) }; }
      case "updateChild": await family.updateChild(op.childId, op.input); break;
      case "birth": await family.confirmBirth(op.childId, op.input); break;
      case "tracking": await family.setTrackingState(op.childId, op.state); break;
      case "snooze": await family.snoozeBirthConfirmation(op.childId, op.days); break;
      case "createEvent": createdEventId = (await journey.createEvent(op.childId, op.input)).id; break;
      case "updateEvent": await journey.updateEvent(op.eventId, op.input); break;
      case "deleteEvent": await journey.deleteEvent(op.eventId); break;
      case "custom": await family.createCustomMilestone(op.childId, op.input); break;
      case "confirm": await family.confirmMilestone(op.childId, op.key, op.date); break;
      case "milestoneState": await family.setMilestoneState(op.childId, op.key, op.state); break;
    }
    return { ok: true as const, snapshot: await loadAccountSnapshot(), createdEventId };
  } catch (error) { return { ok: false as const, error: errorMessage(error) }; }
}
export async function selectChild(childId: string) {
  const { account, authorization } = await accountServices();
  await authorization.requireChildAccess(account, z.uuid().parse(childId), "read");
  (await cookies()).set("mory-child", childId, { httpOnly: true, sameSite: "lax", secure: readAuthConfig().secure, path: "/", maxAge: 60 * 60 * 24 * 30 });
  return loadAccountSnapshot(childId);
}
export async function readTimeline(childId: string, query: unknown, cursor?: string) {
  const { account, authorization, db } = await accountServices();
  await authorization.requireChildAccess(account, z.uuid().parse(childId), "read");
  return queryFamilyEvents(db, account.familyId, childId, query, cursor);
}
export async function exportFamilyData() {
  const { account, journey, repository, authorization, db } = await accountServices();
  await authorization.requireFamilyAccess(account, "read");
  const children = await journey.listChildren();
  // Export is explicit and separate from page payloads; large exports need a streaming job in production.
  const count = await db.event.count({ where: { familyId: account.familyId } });
  if (count > 5000) return { ok: false as const, error: "Gia đình có nhiều dữ liệu; cần xuất theo tác vụ riêng." };
  const events = [];
  const milestones = [];
  for (const child of children) {
    let cursor: string | undefined;
    do { const page = await repository.listEvents(account.familyId, child.id, cursor); events.push(...page.events); cursor = page.nextCursor; } while (cursor);
    milestones.push(...await repository.listMilestones(account.familyId, child.id));
  }
  return { ok: true as const, data: { children, events, milestones } };
}

export async function refreshAccountMedia(eventId?: string) {
  const snapshot = await loadAccountSnapshot();
  if (eventId) {
    const { journey } = await accountServices();
    const event = await journey.getEvent(z.uuid().parse(eventId));
    if (event && event.childId === snapshot.data.activeChildId) snapshot.data.events = [...snapshot.data.events.filter((e) => e.id !== event.id), event];
  }
  return snapshot;
}
