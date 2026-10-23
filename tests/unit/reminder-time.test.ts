import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { eventInstant, reminderInstant } from "@/server/reminders/time";
describe("Vietnam reminder time", () => {
  it("uses 09:00 Vietnam for date-only events and reminds one day before", () => {
    expect(eventInstant("2027-01-01").toISOString()).toBe("2027-01-01T02:00:00.000Z");
    expect(reminderInstant("2027-01-01").toISOString()).toBe("2026-12-31T02:00:00.000Z");
  });
  it("handles midnight and leap days without host timezone assumptions", () => {
    expect(eventInstant("2028-02-29", "00:00").toISOString()).toBe("2028-02-28T17:00:00.000Z");
    expect(reminderInstant("2028-02-29", "00:00").toISOString()).toBe("2028-02-27T17:00:00.000Z");
    expect(() => eventInstant("2027-02-29")).toThrow(); expect(() => eventInstant("2028-02-29", "24:00")).toThrow();
  });
});
