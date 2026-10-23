import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  ageInMonths,
  ageLabel,
  birthdayInYear,
  daysBetween,
  formatDate,
  isDateOnly,
  pregnancyLabel,
  todayVN,
} from "@/lib/dates";

describe("Vietnamese date-only calendar", () => {
  it("uses Vietnam civil time rather than the host timezone", () => {
    expect(todayVN(new Date("2026-10-16T17:00:00.000Z"))).toBe("2026-10-17");
    expect(todayVN(new Date("2026-10-16T16:59:59.000Z"))).toBe("2026-10-16");
  });
  it("rejects impossible dates and timestamp-shaped values", () => {
    expect(isDateOnly("2025-02-29")).toBe(false);
    expect(isDateOnly("2024-02-29")).toBe(true);
    expect(isDateOnly("2026-04-31")).toBe(false);
    expect(isDateOnly("2026-10-17T00:00:00Z")).toBe(false);
  });
  it("keeps date-only values stable while formatting and doing arithmetic", () => {
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("makes the February 29 anniversary policy explicit", () => {
    expect(birthdayInYear("2024-02-29", 2025)).toBe("2025-02-28");
    expect(birthdayInYear("2024-02-29", 2028)).toBe("2028-02-29");
    expect(ageInMonths("2024-02-29", "2025-02-28")).toBe(12);
    expect(ageLabel("2024-02-29", "2025-02-27")).toBe("11 tháng tuổi");
    expect(ageLabel("2024-02-29", "2025-02-28")).toBe("1 tuổi");
  });
  it("does not count a partial month as a complete month", () => {
    expect(ageInMonths("2026-03-17", "2026-10-16")).toBe(6);
    expect(ageLabel("2026-03-17", "2026-10-17")).toBe("7 tháng tuổi");
    expect(ageLabel("2026-10-10", "2026-10-17")).toBe("7 ngày tuổi");
    expect(pregnancyLabel("2026-10-16", "2026-10-17")).toBe(
      "Đang chờ ngày gặp con",
    );
  });
});
