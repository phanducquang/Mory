import { addDays, isDateOnly, todayVN } from "@/lib/dates";
import type { Child, DateOnly } from "@/types/domain";

export function needsBirthConfirmation(
  child: Child,
  at: DateOnly = todayVN(),
): boolean {
  return (
    child.lifecycle === "EXPECTING" &&
    !!child.dueDate &&
    child.dueDate <= at &&
    (!child.dueReminderSnoozedUntil || child.dueReminderSnoozedUntil <= at) &&
    child.reminderEnabled !== false
  );
}

export function confirmBirth(
  child: Child,
  birthDate: DateOnly,
  birthTime?: string,
  at: DateOnly = todayVN(),
): Child {
  if (child.lifecycle !== "EXPECTING")
    throw new Error("Chỉ xác nhận chào đời khi đang theo dõi thai kỳ.");
  if (!isDateOnly(birthDate) || birthDate > at)
    throw new Error("Ngày sinh thực tế phải hợp lệ và không ở tương lai.");
  if (birthTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(birthTime))
    throw new Error("Giờ sinh không hợp lệ.");
  return {
    ...child,
    lifecycle: "AFTER_BIRTH",
    birthDate,
    birthTime,
    dueReminderSnoozedUntil: undefined,
  };
}

export function snoozeBirthConfirmation(
  child: Child,
  at: DateOnly = todayVN(),
  days = 1,
): Child {
  if (child.lifecycle !== "EXPECTING") return child;
  return { ...child, dueReminderSnoozedUntil: addDays(at, Math.max(1, days)) };
}

export function changeTrackingState(
  child: Child,
  lifecycle: "PAUSED" | "ENDED",
): Child {
  return {
    ...child,
    lifecycle,
    reminderEnabled: false,
    dueReminderSnoozedUntil: undefined,
  };
}

export function resumeTracking(child: Child): Child {
  return {
    ...child,
    lifecycle: child.birthDate ? "AFTER_BIRTH" : "EXPECTING",
    reminderEnabled: true,
  };
}
