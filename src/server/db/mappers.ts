import "server-only";

import type { Child as ChildRow, Event as EventRow, ChildMilestone as MilestoneRow } from "./generated/client";
import type { Child, Event, ChildMilestone } from "@/types/domain";
import { isDateOnly } from "@/lib/dates";

/** SQL DATE values are always encoded as UTC midnight, never local wall time. */
export function toDate(value?: string): Date | null {
  if (!value) return null;
  if (!isDateOnly(value)) throw new Error("Ngày không hợp lệ.");
  return new Date(`${value}T00:00:00.000Z`);
}
const fromDate = (value: Date | null) => value?.toISOString().slice(0, 10);

export function mapChild(row: ChildRow): Child {
  return {
    id: row.id, familyId: row.familyId, avatar: row.avatarAssetId ? `/api/media/${row.avatarAssetId}` : undefined, name: row.name, nickname: row.nickname ?? undefined,
    lifecycle: row.lifecycle, dueDate: fromDate(row.dueDate), birthDate: fromDate(row.birthDate),
    birthTime: row.birthTime ?? undefined, gender: row.gender ?? undefined,
    calendarRule: row.calendarRule, leapMonthRule: row.leapMonthRule,
    reminderEnabled: row.reminderEnabled, trackingUntilAge: row.trackingUntilAge,
    dueReminderSnoozedUntil: fromDate(row.dueReminderSnoozedUntil), privacy: "FAMILY_ONLY",
  };
}
export function mapEvent(row: EventRow & { media?: { id: string }[] }): Event {
  return {
    id: row.id, childId: row.childId, title: row.title, date: fromDate(row.date)!,
    time: row.time || undefined, type: row.type, description: row.description,
    images: row.media?.map((asset) => `/api/media/${asset.id}`) ?? [], reminder: row.reminder, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
export function mapMilestone(row: MilestoneRow): ChildMilestone {
  return {
    id: row.id, childId: row.childId, key: row.key, title: row.title,
    kind: row.kind === "full_month" ? "full-month" : row.kind === "first_birthday" ? "first-birthday" : row.kind,
    state: row.state, suggestedDate: fromDate(row.suggestedDate), confirmedDate: fromDate(row.confirmedDate),
    ceremonyDate: fromDate(row.ceremonyDate), needsDateConfirmation: row.needsDateConfirmation,
    description: row.description, age: row.age ?? undefined, eventId: row.eventId ?? undefined,
  };
}
