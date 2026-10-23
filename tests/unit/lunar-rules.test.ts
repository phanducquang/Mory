import { describe, expect, it } from "vitest";
import {
  suggestLunarCeremony,
  type LunarDate,
  type VietnameseLunarCalendar,
} from "@/lib/lunar-calendar";

/**
 * Synthetic adapter fixtures isolate family rules from astronomical conversion.
 * These pairs deliberately make no claim about real Vietnamese lunar dates.
 * A production adapter requires separate independently sourced conversion tests.
 */
function fixtureCalendar(
  birth: LunarDate,
  target: LunarDate,
  months: Record<
    number,
    Array<{ month: number; isLeapMonth: boolean; days: 29 | 30 }>
  >,
): VietnameseLunarCalendar {
  return {
    timezone: "Asia/Ho_Chi_Minh",
    source: "Synthetic unit fixture; never used at runtime",
    fromSolar: (date) =>
      date === "2024-01-01" ? birth : date === "2024-02-01" ? target : null,
    toSolar: (date) =>
      date.day === target.day &&
      date.month === target.month &&
      date.year === target.year &&
      date.isLeapMonth === target.isLeapMonth
        ? "2024-02-01"
        : null,
    monthsInYear: (year) => months[year] ?? [],
  };
}

describe("lunar ceremony rules with an injected verified-calendar contract", () => {
  it("rolls a full-month ceremony into the next lunar year and clamps day 30 to a 29-day month", () => {
    const birth = { day: 30, month: 12, year: 2023, isLeapMonth: false };
    const target = { day: 29, month: 1, year: 2024, isLeapMonth: false };
    const calendar = fixtureCalendar(birth, target, {
      2023: [{ month: 12, isLeapMonth: false, days: 30 }],
      2024: [{ month: 1, isLeapMonth: false, days: 29 }],
    });
    expect(
      suggestLunarCeremony(
        "2024-01-01",
        "full-month",
        "SAME_DAY",
        "REGULAR_MONTH",
        calendar,
      ),
    ).toMatchObject({
      lunarDate: target,
      suggestedDate: "2024-02-01",
      requiresConfirmation: true,
    });
  });

  it("counts the immediately following lunar month including a leap month", () => {
    const birth = { day: 15, month: 6, year: 2024, isLeapMonth: false };
    const target = { ...birth, isLeapMonth: true };
    const calendar = fixtureCalendar(birth, target, {
      2024: [
        { month: 6, isLeapMonth: false, days: 30 },
        { month: 6, isLeapMonth: true, days: 29 },
        { month: 7, isLeapMonth: false, days: 30 },
      ],
    });
    expect(
      suggestLunarCeremony(
        "2024-01-01",
        "full-month",
        "MINUS_TWO",
        "REGULAR_MONTH",
        calendar,
      ),
    ).toMatchObject({
      lunarDate: target,
      suggestedDate: "2024-01-30",
      requiresConfirmation: true,
    });
  });

  it("uses the family's chosen regular month for the first birthday ceremony", () => {
    const birth = { day: 12, month: 6, year: 2023, isLeapMonth: true };
    const target = { ...birth, year: 2024, isLeapMonth: false };
    const calendar = fixtureCalendar(birth, target, {
      2024: [
        { month: 6, isLeapMonth: false, days: 30 },
        { month: 6, isLeapMonth: true, days: 29 },
      ],
    });
    expect(
      suggestLunarCeremony(
        "2024-01-01",
        "first-birthday",
        "MINUS_ONE",
        "REGULAR_MONTH",
        calendar,
      ),
    ).toMatchObject({
      lunarDate: target,
      suggestedDate: "2024-01-31",
      requiresConfirmation: true,
    });
  });

  it("does not silently replace a selected leap month when that year has no matching leap month", () => {
    const birth = { day: 12, month: 6, year: 2023, isLeapMonth: true };
    const target = { ...birth, year: 2024, isLeapMonth: false };
    const calendar = fixtureCalendar(birth, target, {
      2024: [{ month: 6, isLeapMonth: false, days: 30 }],
    });
    const result = suggestLunarCeremony(
      "2024-01-01",
      "first-birthday",
      "SAME_DAY",
      "LEAP_MONTH",
      calendar,
    );
    expect(result.suggestedDate).toBeUndefined();
    expect(result.requiresConfirmation).toBe(true);
    expect(result.reason).toContain("không có tháng nhuận");
  });

  it("rejects a converter result that fails the lunar/solar round trip", () => {
    const birth = { day: 15, month: 1, year: 2024, isLeapMonth: false };
    const target = { ...birth, month: 2 };
    const calendar = fixtureCalendar(birth, target, {
      2024: [
        { month: 1, isLeapMonth: false, days: 30 },
        { month: 2, isLeapMonth: false, days: 29 },
      ],
    });
    calendar.fromSolar = (date) =>
      date === "2024-01-01" ? birth : { ...target, day: 16 };
    expect(
      suggestLunarCeremony(
        "2024-01-01",
        "full-month",
        "SAME_DAY",
        "REGULAR_MONTH",
        calendar,
      ).suggestedDate,
    ).toBeUndefined();
  });
});
