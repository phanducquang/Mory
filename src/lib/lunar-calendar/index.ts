import { addDays, isDateOnly } from "@/lib/dates";
import type { CalendarRule, DateOnly, LeapMonthRule } from "@/types/domain";

export interface LunarDate {
  day: number;
  month: number;
  year: number;
  isLeapMonth: boolean;
}
/** Only inject a converter independently verified for Vietnam civil time (UTC+7). */
export interface VietnameseLunarCalendar {
  readonly timezone: "Asia/Ho_Chi_Minh";
  readonly source: string;
  fromSolar(date: DateOnly): LunarDate | null;
  toSolar(date: LunarDate): DateOnly | null;
  monthsInYear(
    year: number,
  ): Array<{ month: number; isLeapMonth: boolean; days: 29 | 30 }>;
}

export interface CeremonySuggestion {
  suggestedDate?: DateOnly;
  requiresConfirmation: true;
  reason: string;
  lunarDate?: LunarDate;
}

const UNVERIFIED =
  "Không có dữ liệu lịch phù hợp để gợi ý. Gia đình vui lòng chọn và xác nhận ngày tổ chức.";

function sameLunar(a: LunarDate | null, b: LunarDate) {
  return (
    !!a &&
    a.day === b.day &&
    a.month === b.month &&
    a.year === b.year &&
    a.isLeapMonth === b.isLeapMonth
  );
}

/** Never turn a guessed lunar conversion into a confirmed ceremony date. */
export function suggestLunarCeremony(
  birthDate: DateOnly,
  kind: "full-month" | "first-birthday",
  rule: CalendarRule = "SAME_DAY",
  leapRule: LeapMonthRule = "REGULAR_MONTH",
  calendar?: VietnameseLunarCalendar,
): CeremonySuggestion {
  if (!isDateOnly(birthDate)) throw new Error("Ngày sinh không hợp lệ.");
  if (!calendar || calendar.timezone !== "Asia/Ho_Chi_Minh")
    return { requiresConfirmation: true, reason: UNVERIFIED };
  const birth = calendar.fromSolar(birthDate);
  if (!birth)
    return {
      requiresConfirmation: true,
      reason: "Ngày sinh nằm ngoài khoảng lịch đã được kiểm chứng.",
    };
  let year = birth.year;
  let month = birth.month;
  let isLeapMonth = false;
  if (kind === "full-month") {
    const months = calendar.monthsInYear(year);
    const index = months.findIndex(
      (item) =>
        item.month === birth.month && item.isLeapMonth === birth.isLeapMonth,
    );
    if (index < 0) return { requiresConfirmation: true, reason: UNVERIFIED };
    const next = months[index + 1] ?? calendar.monthsInYear(++year)[0];
    if (!next) return { requiresConfirmation: true, reason: UNVERIFIED };
    month = next.month;
    isLeapMonth = next.isLeapMonth;
  } else {
    year++;
    const available = calendar
      .monthsInYear(year)
      .filter((item) => item.month === month);
    if (leapRule === "LEAP_MONTH") {
      if (!available.some((item) => item.isLeapMonth))
        return {
          requiresConfirmation: true,
          reason:
            "Năm này không có tháng nhuận tương ứng. Gia đình vui lòng chọn ngày tổ chức.",
        };
      isLeapMonth = true;
    } else if (leapRule === "NEXT_AVAILABLE") {
      isLeapMonth =
        birth.isLeapMonth && available.some((item) => item.isLeapMonth);
    }
  }
  const targetMonth = calendar
    .monthsInYear(year)
    .find((item) => item.month === month && item.isLeapMonth === isLeapMonth);
  if (!targetMonth) return { requiresConfirmation: true, reason: UNVERIFIED };
  // A day 30 in a 29-day target month is explicitly clamped to its final day.
  const lunarDate = {
    year,
    month,
    day: Math.min(birth.day, targetMonth.days),
    isLeapMonth,
  };
  const solar = calendar.toSolar(lunarDate);
  if (
    !solar ||
    !isDateOnly(solar) ||
    !sameLunar(calendar.fromSolar(solar), lunarDate)
  )
    return {
      requiresConfirmation: true,
      reason:
        "Kết quả chuyển đổi cần được kiểm tra lại. Gia đình vui lòng chọn ngày tổ chức.",
    };
  const offset = rule === "MINUS_ONE" ? -1 : rule === "MINUS_TWO" ? -2 : 0;
  return {
    suggestedDate: addDays(solar, offset),
    lunarDate,
    requiresConfirmation: true,
    reason:
      "Gợi ý âm lịch, đã áp dụng quy tắc gia đình. Vui lòng xác nhận ngày tổ chức.",
  };
}
