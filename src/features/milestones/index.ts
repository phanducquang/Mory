import { birthdayInYear, dateParts, isDateOnly, todayVN } from "@/lib/dates";
import {
  suggestLunarCeremony,
  type VietnameseLunarCalendar,
} from "@/lib/lunar-calendar";
import { vietnameseLunarCalendar } from "@/lib/lunar-calendar/vietnamese-calendar";
import {
  customMilestoneSchema,
  type CustomMilestoneInput,
} from "@/lib/validation";
import type {
  Child,
  ChildMilestone,
  DateOnly,
  DemoData,
  Event,
} from "@/types/domain";

export function milestoneDate(milestone: ChildMilestone): DateOnly | undefined {
  return (
    milestone.ceremonyDate ?? milestone.confirmedDate ?? milestone.suggestedDate
  );
}

export function generateMilestones(
  child: Child,
  existing: ChildMilestone[] = [],
  at: DateOnly = todayVN(),
  calendar: VietnameseLunarCalendar = vietnameseLunarCalendar,
): ChildMilestone[] {
  if (child.lifecycle === "PAUSED" || child.lifecycle === "ENDED")
    return existing.filter((item) => item.childId === child.id);
  const suggested: ChildMilestone[] = [];
  const base = (
    key: string,
    title: string,
    kind: ChildMilestone["kind"],
  ): ChildMilestone => ({
    id: `${child.id}:${key}`,
    childId: child.id,
    key,
    title,
    kind,
    state: "SUGGESTED",
    needsDateConfirmation: false,
    description: "",
  });
  if (child.lifecycle === "EXPECTING" && child.dueDate) {
    suggested.push({
      ...base("due", "Ngày dự kiến gặp con", "due"),
      suggestedDate: child.dueDate,
      state: child.dueDate <= at ? "PENDING_CONFIRMATION" : "SUGGESTED",
      needsDateConfirmation: true,
      description:
        "Ngày dự sinh chỉ để tham khảo. Chỉ chuyển giai đoạn khi gia đình xác nhận bé đã chào đời.",
    });
  }
  if (child.lifecycle === "AFTER_BIRTH" && child.birthDate) {
    for (const [kind, title] of [
      ["full-month", "Lễ đầy tháng"],
      ["first-birthday", "Lễ thôi nôi"],
    ] as const) {
      const ceremony = suggestLunarCeremony(
        child.birthDate,
        kind,
        child.calendarRule,
        child.leapMonthRule,
        calendar,
      );
      suggested.push({
        ...base(kind, title, kind),
        state: "PENDING_CONFIRMATION",
        suggestedDate: ceremony.suggestedDate,
        needsDateConfirmation: true,
        description: ceremony.reason,
      });
    }
    const birthYear = dateParts(child.birthDate).year;
    const currentYear = dateParts(at).year;
    const maxAge = child.trackingUntilAge ?? 18;
    // Include past birthdays and the next two years without forcing a development deadline.
    for (
      let age = 2;
      age <= Math.min(maxAge, Math.max(3, currentYear - birthYear + 2));
      age++
    ) {
      suggested.push({
        ...base(`birthday-${age}`, `Sinh nhật ${age} tuổi`, "birthday"),
        age,
        suggestedDate: birthdayInYear(child.birthDate, birthYear + age),
        description:
          "Ngày sinh nhật theo dương lịch. Gia đình có thể chọn ngày tổ chức khác.",
      });
    }
  }
  const saved = existing.filter((item) => item.childId === child.id);
  const merged = suggested.map((item) => {
    const previous = saved.find((candidate) => candidate.key === item.key);
    // The engine never overwrites a family decision or date, even after a birth date change.
    return previous &&
      (previous.confirmedDate ||
        previous.ceremonyDate ||
        ["CONFIRMED", "COMPLETED", "SKIPPED"].includes(previous.state))
      ? previous
      : { ...item, ...previous, suggestedDate: item.suggestedDate };
  });
  const generatedKeys = new Set(suggested.map((item) => item.key));
  for (const item of saved) if (!generatedKeys.has(item.key)) merged.push(item);
  return merged;
}

export function confirmMilestone(
  milestone: ChildMilestone,
  date: DateOnly,
): ChildMilestone {
  if (!isDateOnly(date)) throw new Error("Ngày tổ chức không hợp lệ.");
  return {
    ...milestone,
    confirmedDate: date,
    ceremonyDate:
      milestone.kind === "full-month" || milestone.kind === "first-birthday"
        ? date
        : milestone.ceremonyDate,
    state: "CONFIRMED",
    needsDateConfirmation: false,
  };
}

/** Build one atomic state change for a family-confirmed milestone and its calendar event. */
export function confirmMilestoneEvent(
  data: DemoData,
  milestone: ChildMilestone,
  date: DateOnly,
  metadata: { eventId: string; timestamp: string },
): DemoData {
  const child = data.children.find((item) => item.id === data.activeChildId);
  if (!child || child.id !== milestone.childId)
    throw new Error("Cột mốc không thuộc hồ sơ bé đang chọn.");
  if (child.lifecycle === "PAUSED" || child.lifecycle === "ENDED")
    throw new Error("Vui lòng tiếp tục hành trình trước khi lên lịch cột mốc.");
  if (milestone.kind === "due")
    throw new Error(
      "Vui lòng dùng xác nhận chào đời để lưu ngày sinh thực tế.",
    );
  const saved =
    data.milestones?.find(
      (item) => item.childId === child.id && item.key === milestone.key,
    ) ?? milestone;
  const existingEvent = data.events.find(
    (item) => item.id === saved.eventId && item.childId === child.id,
  );
  const confirmed = {
    ...confirmMilestone(saved, date),
    eventId: existingEvent?.id ?? metadata.eventId,
  };
  const event: Event = {
    id: confirmed.eventId,
    childId: child.id,
    title: confirmed.title,
    date,
    type: "milestone",
    description:
      saved.kind === "custom"
        ? saved.description
        : "Ngày tổ chức do gia đình lựa chọn và xác nhận.",
    images: [],
    reminder: false,
    ...existingEvent,
    updatedAt: metadata.timestamp,
    createdAt: existingEvent?.createdAt ?? metadata.timestamp,
  };
  // Date is the family's current explicit choice even when the linked event already exists.
  event.date = date;
  return {
    ...data,
    milestones: [
      ...(data.milestones ?? []).filter(
        (item) => !(item.childId === child.id && item.key === milestone.key),
      ),
      confirmed,
    ],
    events: [...data.events.filter((item) => item.id !== event.id), event],
  };
}

export function upcomingMilestones(
  milestones: ChildMilestone[],
  at: DateOnly = todayVN(),
): ChildMilestone[] {
  return milestones
    .filter(
      (item) =>
        !["SKIPPED", "COMPLETED"].includes(item.state) &&
        !!milestoneDate(item) &&
        milestoneDate(item)! >= at,
    )
    .sort((a, b) => milestoneDate(a)!.localeCompare(milestoneDate(b)!));
}

/** A custom milestone may be undated: development has no imposed deadline. */
export function createCustomMilestone(
  data: DemoData,
  input: CustomMilestoneInput,
  metadata: { id: string; eventId: string; timestamp: string },
): DemoData {
  const values = customMilestoneSchema.parse(input);
  const child = data.children.find((c) => c.id === data.activeChildId);
  if (!child || ["PAUSED", "ENDED"].includes(child.lifecycle))
    throw new Error("Vui lòng tiếp tục hành trình trước khi thêm cột mốc.");
  if (
    !metadata.id ||
    data.milestones?.some((m) => m.key === `custom:${metadata.id}`)
  )
    throw new Error("Cột mốc này đã tồn tại.");
  const milestone: ChildMilestone = {
    id: `${child.id}:custom:${metadata.id}`,
    childId: child.id,
    key: `custom:${metadata.id}`,
    title: values.title,
    description: values.description,
    kind: "custom",
    state: "SUGGESTED",
    needsDateConfirmation: !values.date,
  };
  const next = { ...data, milestones: [...(data.milestones ?? []), milestone] };
  return values.date
    ? confirmMilestoneEvent(next, milestone, values.date, metadata)
    : next;
}
