import { describe, expect, it } from "vitest";
import { addDays, daysBetween } from "@/lib/dates";
import {
  vietnameseLunarCalendar as calendar,
  LUNAR_CALENDAR_RANGE,
  lunarDateLabel,
} from "@/lib/lunar-calendar/vietnamese-calendar";
import { suggestLunarCeremony } from "@/lib/lunar-calendar";
import { generateMilestones } from "@/features/milestones";
import fixtures from "../fixtures/vietnamese-lunar-dates.json";
import data from "@/lib/lunar-calendar/generated/vietnamese-years.json";

describe("Vietnam UTC+7 calendar with independently sourced civil-date fixtures", () => {
  for (const fixture of fixtures)
    it(`${fixture.solar} matches ${fixture.source}`, () => {
      expect(calendar.fromSolar(fixture.solar)).toEqual(fixture.lunar);
      expect(calendar.toSolar(fixture.lunar)).toBe(fixture.solar);
    });
  it("preserves every valid lunar day through solar/lunar round trips across the supported range", () => {
    let count = 0;
    for (const { year, months } of data.years) {
      expect(calendar.monthsInYear(year)).toHaveLength(months.length);
      for (const month of months) {
        for (let day = 1; day <= month.days; day++) {
          const lunar = {
            year,
            month: month.month,
            isLeapMonth: month.isLeapMonth,
            day,
          };
          const solar = calendar.toSolar(lunar)!;
          expect(calendar.fromSolar(solar)).toEqual(lunar);
          expect(solar).toBe(addDays(month.start, day - 1));
          count++;
        }
        expect(
          calendar.toSolar({
            year,
            month: month.month,
            isLeapMonth: month.isLeapMonth,
            day: month.days + 1,
          }),
        ).toBeNull();
      }
    }
    expect(count).toBe(daysBetween(data.minDate, data.endExclusive));
  }, 20_000); // Exhaustive 45,654-day verification can exceed the default 5s on a busy host.
  it("has continuous months, exactly 12 regular months, at most one leap month, and 29/30 day lengths", () => {
    let next = data.minDate;
    for (const { year, months } of data.years) {
      expect(months.filter((m) => !m.isLeapMonth).map((m) => m.month)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ]);
      expect(months.filter((m) => m.isLeapMonth).length).toBeLessThanOrEqual(1);
      months.forEach((m, index) => {
        expect(m.start).toBe(next);
        expect([29, 30]).toContain(m.days);
        if (m.isLeapMonth) expect(m.month).toBe(months[index - 1].month);
        next = addDays(m.start, m.days);
      });
      expect(calendar.monthsInYear(year).length).toBeGreaterThanOrEqual(12);
    }
    expect(next).toBe(data.endExclusive);
  });
  it("rejects invalid/out-of-range dates and absent leap months without guessing", () => {
    for (const date of ["1975-01-01", "2101-01-29", "2025-02-30", "not-a-date"])
      expect(calendar.fromSolar(date)).toBeNull();
    expect(
      calendar.toSolar({ year: 2024, month: 6, day: 1, isLeapMonth: true }),
    ).toBeNull();
    expect(
      calendar.toSolar({ year: 2025, month: 6, day: 0, isLeapMonth: true }),
    ).toBeNull();
    expect(calendar.monthsInYear(1975)).toEqual([]);
    expect(calendar.fromSolar(LUNAR_CALENDAR_RANGE.minDate)).not.toBeNull();
    expect(
      calendar.fromSolar(addDays(LUNAR_CALENDAR_RANGE.endExclusive, -1)),
    ).not.toBeNull();
  });
  it("regresses Vietnam-specific 1985 and 2030 New Year and the 2033 leap-month numbering defect", () => {
    // Astronomy/rule regression cases; unlike fixtures above, these are NOT claimed
    // as independent government calendar certification of future years.
    expect(
      calendar.toSolar({ year: 1985, month: 1, day: 1, isLeapMonth: false }),
    ).toBe("1985-01-21");
    expect(
      calendar.toSolar({ year: 2030, month: 1, day: 1, isLeapMonth: false }),
    ).toBe("2030-02-02");
    const leaps = calendar.monthsInYear(2033).filter((m) => m.isLeapMonth);
    expect(leaps).toEqual([{ month: 11, isLeapMonth: true, days: 29 }]);
    expect(
      calendar.toSolar({ year: 2033, month: 8, day: 1, isLeapMonth: true }),
    ).toBeNull();
    expect(
      calendar.toSolar({ year: 2033, month: 11, day: 1, isLeapMonth: true }),
    ).toBe("2033-12-22");
  });
  it("generates an actual full-month suggestion including a leap month and a 30-to-29 day clamp", () => {
    expect(
      suggestLunarCeremony(
        "2025-06-25",
        "full-month",
        "SAME_DAY",
        "REGULAR_MONTH",
        calendar,
      ).suggestedDate,
    ).toBe("2025-07-25");
    expect(
      suggestLunarCeremony(
        "2025-07-24",
        "full-month",
        "MINUS_ONE",
        "REGULAR_MONTH",
        calendar,
      ).suggestedDate,
    ).toBe("2025-08-21");
    expect(lunarDateLabel("2025-07-25")).toBe("1/6 nhuận/2025 âm lịch");
  });
  it("uses lunar first birthday independently from the solar birthday and leaves decisions pending", () => {
    const result = generateMilestones(
      {
        id: "baby",
        name: "Bé",
        lifecycle: "AFTER_BIRTH",
        birthDate: "2024-02-10",
      },
      [],
      "2024-03-01",
    );
    expect(result.find((m) => m.kind === "first-birthday")).toMatchObject({
      suggestedDate: "2025-01-29",
      state: "PENDING_CONFIRMATION",
      needsDateConfirmation: true,
    });
    const unsupported = generateMilestones({
      id: "old",
      name: "Bé",
      lifecycle: "AFTER_BIRTH",
      birthDate: "1970-01-01",
    });
    expect(
      unsupported.find((m) => m.kind === "first-birthday")?.suggestedDate,
    ).toBeUndefined();
  });
});

describe('ceremony rules against the real calendar adapter',()=>{
  it('rolls the lunar year and applies each explicit leap-month choice without falling back silently',()=>{
    expect(suggestLunarCeremony('2024-02-09','full-month','SAME_DAY','REGULAR_MONTH',calendar)).toMatchObject({suggestedDate:'2024-03-09',lunarDate:{year:2024,month:1,day:29,isLeapMonth:false}});
    const birth=calendar.toSolar({year:2024,month:6,day:1,isLeapMonth:false})!;
    expect(suggestLunarCeremony(birth,'first-birthday','SAME_DAY','REGULAR_MONTH',calendar).suggestedDate).toBe('2025-06-25');
    expect(suggestLunarCeremony(birth,'first-birthday','SAME_DAY','LEAP_MONTH',calendar).suggestedDate).toBe('2025-07-25');
    expect(suggestLunarCeremony('2025-07-25','first-birthday','SAME_DAY','LEAP_MONTH',calendar).suggestedDate).toBeUndefined();
    expect(suggestLunarCeremony('2025-07-25','first-birthday','SAME_DAY','NEXT_AVAILABLE',calendar)).toMatchObject({lunarDate:{year:2026,month:6,day:1,isLeapMonth:false},requiresConfirmation:true});
  });
});
