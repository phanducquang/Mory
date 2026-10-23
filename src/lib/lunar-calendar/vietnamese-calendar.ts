import { addDays, daysBetween, isDateOnly } from "@/lib/dates";
import data from "./generated/vietnamese-years.json";
import type { LunarDate, VietnameseLunarCalendar } from "./index";

/** Public, deterministic calendar data only; no family data or mutable cache. */
export const LUNAR_CALENDAR_RANGE = Object.freeze({
  minYear: data.minYear,
  maxYear: data.maxYear,
  minDate: data.minDate,
  endExclusive: data.endExclusive,
});
const months = data.years.flatMap(({ year, months }) =>
  months.map((month) => ({ ...month, year })),
);
const years = new Map(data.years.map((year) => [year.year, year.months]));

export const vietnameseLunarCalendar: VietnameseLunarCalendar = {
  timezone: "Asia/Ho_Chi_Minh",
  source:
    "date-chinese@2.1.4 astronomy; Mory solstice rules; docs/lunar-calendar-verification.md",
  fromSolar(date) {
    if (!isDateOnly(date) || date < data.minDate || date >= data.endExclusive)
      return null;
    let low = 0,
      high = months.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (months[middle].start <= date) low = middle + 1;
      else high = middle - 1;
    }
    const month = months[high];
    if (!month) return null;
    const day = daysBetween(month.start, date) + 1;
    if (day < 1 || day > month.days) return null;
    return {
      year: month.year,
      month: month.month,
      day,
      isLeapMonth: month.isLeapMonth,
    };
  },
  toSolar(date) {
    if (
      !Number.isInteger(date.year) ||
      !Number.isInteger(date.month) ||
      !Number.isInteger(date.day) ||
      typeof date.isLeapMonth !== "boolean"
    )
      return null;
    const month = years
      .get(date.year)
      ?.find(
        (m) => m.month === date.month && m.isLeapMonth === date.isLeapMonth,
      );
    if (!month || date.day < 1 || date.day > month.days) return null;
    return addDays(month.start, date.day - 1);
  },
  monthsInYear(year) {
    return (years.get(year) ?? []).map((m) => ({
      month: m.month,
      isLeapMonth: m.isLeapMonth,
      days: m.days as 29 | 30,
    }));
  },
};
export function formatLunarDate(date: LunarDate): string {
  return `${date.day}/${date.month}${date.isLeapMonth ? " nhuận" : ""}/${date.year} âm lịch`;
}
export function lunarDateLabel(date: string): string | undefined {
  const lunar = vietnameseLunarCalendar.fromSolar(date);
  return lunar ? formatLunarDate(lunar) : undefined;
}
