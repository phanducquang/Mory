import type { Child, DateOnly } from "@/types/domain";

export const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";
const DAY_MS = 86_400_000;

export function isDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1)
    return false;
  return day <= daysInMonth(year, month);
}

export function dateParts(value: DateOnly) {
  if (!isDateOnly(value))
    throw new Error("Ngày không hợp lệ. Vui lòng dùng định dạng YYYY-MM-DD.");
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function todayVN(now: Date = new Date()): DateOnly {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function epochDay(value: DateOnly) {
  const { year, month, day } = dateParts(value);
  // UTC is used only as a numeric calendar arithmetic axis. No timezone conversion occurs.
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function daysBetween(from: DateOnly, to: DateOnly) {
  return epochDay(to) - epochDay(from);
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const result = new Date((epochDay(date) + days) * DAY_MS);
  return result.toISOString().slice(0, 10);
}

export function addMonths(date: DateOnly, months: number): DateOnly {
  const { year, month, day } = dateParts(date);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  return makeDate(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    Math.min(
      day,
      daysInMonth(target.getUTCFullYear(), target.getUTCMonth() + 1),
    ),
  );
}

export function makeDate(year: number, month: number, day: number): DateOnly {
  const result = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!isDateOnly(result)) throw new Error("Ngày không hợp lệ.");
  return result;
}

/** February 29 anniversaries fall on February 28 in non-leap years. */
export function birthdayInYear(birthDate: DateOnly, year: number): DateOnly {
  const { month, day } = dateParts(birthDate);
  return makeDate(year, month, Math.min(day, daysInMonth(year, month)));
}

export function ageInMonths(
  birthDate: DateOnly,
  at: DateOnly = todayVN(),
): number {
  if (at < birthDate) return 0;
  const birth = dateParts(birthDate);
  const end = dateParts(at);
  let months = (end.year - birth.year) * 12 + end.month - birth.month;
  if (addMonths(birthDate, months) > at) months--;
  return Math.max(0, months);
}

export function ageLabel(
  birthDate: DateOnly,
  at: DateOnly = todayVN(),
): string {
  const days = daysBetween(birthDate, at);
  if (days < 0) return "Chưa đến ngày sinh";
  const months = ageInMonths(birthDate, at);
  if (months === 0) return `${days} ngày tuổi`;
  if (months < 12) return `${months} tháng tuổi`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} tuổi${rest ? ` ${rest} tháng` : ""}`;
}

export function pregnancyLabel(
  dueDate: DateOnly,
  at: DateOnly = todayVN(),
): string {
  const remaining = daysBetween(at, dueDate);
  if (remaining < 0) return "Đang chờ ngày gặp con";
  const gestationalDays = Math.max(0, 280 - remaining);
  return `Thai kỳ tuần ${Math.floor(gestationalDays / 7)}${gestationalDays % 7 ? ` + ${gestationalDays % 7} ngày` : ""}`;
}

export function childAgeLabel(child: Child, at: DateOnly = todayVN()): string {
  if (child.lifecycle === "PAUSED") return "Hành trình đang tạm dừng";
  if (child.lifecycle === "ENDED") return "Hành trình đã được lưu giữ";
  if (child.lifecycle === "EXPECTING" && child.dueDate)
    return pregnancyLabel(child.dueDate, at);
  if (child.lifecycle === "AFTER_BIRTH" && child.birthDate)
    return ageLabel(child.birthDate, at);
  return "Hành trình của con";
}

export function formatDate(
  value: DateOnly,
  options?: Intl.DateTimeFormatOptions,
): string {
  const { year, month, day } = dateParts(value);
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatLongDate(value: DateOnly): string {
  return formatDate(value, { day: "numeric", month: "long", year: "numeric" });
}

export function relativeDate(
  value: DateOnly,
  at: DateOnly = todayVN(),
): string {
  const delta = daysBetween(at, value);
  if (delta === 0) return "Hôm nay";
  if (delta === 1) return "Ngày mai";
  if (delta === -1) return "Hôm qua";
  return delta > 0 ? `Còn ${delta} ngày` : `${Math.abs(delta)} ngày trước`;
}
