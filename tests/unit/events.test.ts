import { describe, expect, it } from "vitest";
import { eventSchema, childSchema } from "@/lib/validation";
import { filterTimeline, groupTimeline } from "@/features/timeline/domain";
import { createDemoData } from "@/lib/demo-data";
import type { Event } from "@/types/domain";

const input = {
  title: "Kỷ niệm đầu tiên",
  date: "2026-10-17",
  type: "memory",
  description: "Một ngày bình yên.",
  images: [],
  reminder: false,
};

describe("event validation", () => {
  it("accepts event dates in the past, today and future", () => {
    for (const date of ["2020-01-01", "2026-10-17", "2028-12-31"])
      expect(eventSchema.safeParse({ ...input, date }).success).toBe(true);
  });
  it("rejects impossible dates, missing titles, invalid times and unsupported types", () => {
    for (const changes of [
      { date: "2025-02-29" },
      { date: "2026-13-01" },
      { date: "2026-10-17T00:00:00Z" },
      { title: " " },
      { time: "24:01" },
      { type: "other" },
    ]) {
      expect(eventSchema.safeParse({ ...input, ...changes }).success).toBe(
        false,
      );
    }
    expect(eventSchema.safeParse({ ...input, time: "23:59" }).success).toBe(
      true,
    );
  });
  it("allows an optional pregnancy name while requiring actual birth information after birth", () => {
    expect(
      childSchema.safeParse({
        name: "",
        lifecycle: "EXPECTING",
        dueDate: "2026-10-17",
      }).success,
    ).toBe(true);
    expect(
      childSchema.safeParse({
        name: "",
        lifecycle: "AFTER_BIRTH",
        birthDate: "2024-01-01",
      }).success,
    ).toBe(false);
    expect(
      childSchema.safeParse({
        name: "An",
        lifecycle: "AFTER_BIRTH",
        birthDate: "2199-01-01",
      }).success,
    ).toBe(false);
  });
});

describe("timeline filtering", () => {
  const event = (
    id: string,
    date: string,
    type: Event["type"],
    childId = "a",
  ): Event => ({
    id,
    childId,
    date,
    type,
    title: id === "past" ? "Bước đầu tiên" : id,
    description: "",
    images: [],
    reminder: false,
    createdAt: "2026-10-17T00:00:00Z",
    updatedAt: "2026-10-17T00:00:00Z",
  });
  const events = [
    event("past", "2026-09-01", "milestone"),
    event("today", "2026-10-17", "memory"),
    event("future", "2026-11-01", "health"),
    event("other-child", "2026-10-10", "memory", "b"),
  ];

  it("isolates the active child and sorts by event date rather than createdAt", () => {
    expect(
      filterTimeline(events, { childId: "a" }, "2026-10-17").map(
        (item) => item.id,
      ),
    ).toEqual(["future", "today", "past"]);
    expect(events.map((item) => item.id)).toEqual([
      "past",
      "today",
      "future",
      "other-child",
    ]);
  });
  it("combines date, type and accent-insensitive search filters", () => {
    expect(
      filterTimeline(
        events,
        { childId: "a", period: "past" },
        "2026-10-17",
      ).map((item) => item.id),
    ).toEqual(["today", "past"]);
    expect(
      filterTimeline(
        events,
        { childId: "a", period: "upcoming" },
        "2026-10-17",
      ).map((item) => item.id),
    ).toEqual(["future", "today"]);
    expect(
      filterTimeline(
        events,
        { type: "milestone", search: "buoc dau" },
        "2026-10-17",
      ).map((item) => item.id),
    ).toEqual(["past"]);
  });
  it("groups dates into local calendar months and years", () => {
    expect(groupTimeline(events.slice(0, 2)).map((group) => group.key)).toEqual(
      ["2026-09", "2026-10"],
    );
    expect(groupTimeline(events, "year")[0].events).toHaveLength(4);
  });
  it("keeps clock-time and ID ties in the same order as database pagination", () => {
    const tied = [
      event("no-time", "2024-03-01", "memory"),
      { ...event("midnight", "2024-03-01", "memory"), time: "00:00" },
      { ...event("a", "2024-03-01", "memory"), time: "08:00" },
      { ...event("b", "2024-03-01", "memory"), time: "08:00" },
    ];
    expect(filterTimeline(tied).map((e) => e.id)).toEqual(["b", "a", "midnight", "no-time"]);
    expect(filterTimeline(tied, { order: "asc" }).map((e) => e.id)).toEqual(["no-time", "midnight", "a", "b"]);
  });
  it("creates isolated seed copies and separates date from creation metadata", () => {
    const first = createDemoData("2026-10-17");
    const second = createDemoData("2026-10-17");
    first.children[0].name = "Changed";
    expect(second.children[0].name).toBe("Minh An");
    expect(second.events[0].date).toBe("2026-10-15");
    expect(second.events[0].createdAt).toBe("2026-10-17T05:00:00.000Z");
    expect(second.children).toHaveLength(2);
  });
});
