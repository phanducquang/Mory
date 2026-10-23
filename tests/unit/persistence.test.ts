import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoData } from "@/lib/demo-data";
import { demoDataSchema, parseDemoData } from "@/lib/validation";
import { browserJourneyRepository } from "@/features/app/demo-repository";
import {
  confirmMilestoneEvent,
  generateMilestones,
} from "@/features/milestones";

afterEach(() => vi.unstubAllGlobals());

describe("persisted demo data", () => {
  it("parses seed data without changing date-only values or event timestamps", () => {
    const seed = createDemoData("2026-10-17");
    expect(parseDemoData(seed)).toEqual(seed);
  });
  it("rejects corrupt persisted child, event and milestone dates", () => {
    const seed = createDemoData("2026-10-17");
    const invalidChild = structuredClone(seed);
    invalidChild.children[0].birthDate = "2025-02-29";
    expect(demoDataSchema.safeParse(invalidChild).success).toBe(false);
    const invalidEvent = structuredClone(seed);
    invalidEvent.events[0].date = "2026-04-31";
    expect(demoDataSchema.safeParse(invalidEvent).success).toBe(false);
    const invalidMilestone = structuredClone(seed);
    invalidMilestone.milestones = [
      {
        ...generateMilestones(seed.children[0], [], "2026-10-17")[0],
        confirmedDate: "2026-02-30",
        state: "CONFIRMED",
      },
    ];
    expect(demoDataSchema.safeParse(invalidMilestone).success).toBe(false);
  });
  it("rejects orphan events, missing active children and duplicate identifiers", () => {
    const seed = createDemoData("2026-10-17");
    const orphan = structuredClone(seed);
    orphan.events[0].childId = "missing-child";
    expect(demoDataSchema.safeParse(orphan).success).toBe(false);
    expect(
      demoDataSchema.safeParse({ ...seed, activeChildId: "missing-child" })
        .success,
    ).toBe(false);
    expect(
      demoDataSchema.safeParse({
        ...seed,
        children: [...seed.children, seed.children[0]],
      }).success,
    ).toBe(false);
    expect(
      demoDataSchema.safeParse({
        ...seed,
        events: [...seed.events, seed.events[0]],
      }).success,
    ).toBe(false);
  });
  it("rejects a milestone linked to another child's event", () => {
    const seed = createDemoData("2026-10-17");
    seed.events[0] = {
      ...seed.events[0],
      childId: seed.children[1].id,
      type: "milestone",
    };
    seed.milestones = [
      {
        ...generateMilestones(seed.children[0], [], "2026-10-17")[0],
        eventId: seed.events[0].id,
      },
    ];
    expect(demoDataSchema.safeParse(seed).success).toBe(false);
  });
  it("rejects malformed image references, times and timestamps", () => {
    const seed = createDemoData("2026-10-17");
    for (const changes of [
      { images: ["javascript:alert(1)"] },
      { images: ["data:image/svg+xml;base64,AAAA"] },
      { time: "25:00" },
      { createdAt: "tomorrow" },
      { updatedAt: "2020-01-01T00:00:00Z" },
    ]) {
      expect(
        demoDataSchema.safeParse({
          ...seed,
          events: [{ ...seed.events[0], ...changes }],
        }).success,
      ).toBe(false);
    }
  });
  it("rejects a birth date on an expecting profile and confirmed milestones with no date", () => {
    const seed = createDemoData("2026-10-17");
    seed.children[1].birthDate = "2026-01-01";
    expect(demoDataSchema.safeParse(seed).success).toBe(false);
    const clean = createDemoData("2026-10-17");
    clean.milestones = [
      {
        ...generateMilestones(clean.children[0], [], "2026-10-17")[0],
        state: "CONFIRMED",
      },
    ];
    expect(demoDataSchema.safeParse(clean).success).toBe(false);
  });
  it("loads valid data and reports corrupted localStorage without silently accepting it", () => {
    const seed = createDemoData("2026-10-17");
    const storage = {
      getItem: vi.fn(() => JSON.stringify(seed)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", storage);
    expect(browserJourneyRepository.load()).toEqual(seed);
    storage.getItem.mockReturnValue(
      JSON.stringify({ children: [], events: [], activeChildId: "missing" }),
    );
    expect(() => browserJourneyRepository.load()).toThrow(
      "Dữ liệu demo không đọc được",
    );
    storage.getItem.mockReturnValue("{");
    expect(() => browserJourneyRepository.load()).toThrow(
      "Dữ liệu demo không đọc được",
    );
  });
});

describe("atomic family milestone confirmation", () => {
  it("persists both the confirmed family date and a linked timeline event in one state", () => {
    const seed = createDemoData("2026-10-17");
    const milestone = generateMilestones(
      seed.children[0],
      [],
      "2026-10-17",
    ).find((item) => item.kind === "first-birthday")!;
    const next = confirmMilestoneEvent(seed, milestone, "2027-04-01", {
      eventId: "ceremony-event",
      timestamp: "2026-10-17T06:00:00.000Z",
    });
    expect(next.milestones?.[0]).toMatchObject({
      state: "CONFIRMED",
      confirmedDate: "2027-04-01",
      ceremonyDate: "2027-04-01",
      eventId: "ceremony-event",
    });
    expect(
      next.events.find((event) => event.id === "ceremony-event"),
    ).toMatchObject({
      date: "2027-04-01",
      type: "milestone",
      childId: seed.activeChildId,
    });
    expect(parseDemoData(next)).toEqual(next);
    expect(seed.milestones).toEqual([]);
  });
  it("reschedules the same event, preserving its creation time and journal content", () => {
    const seed = createDemoData("2026-10-17");
    const milestone = generateMilestones(seed.children[0])[0];
    const first = confirmMilestoneEvent(seed, milestone, "2026-11-01", {
      eventId: "ceremony-event",
      timestamp: "2026-10-17T06:00:00.000Z",
    });
    first.events.find((event) => event.id === "ceremony-event")!.description =
      "Gia đình cùng chuẩn bị.";
    const second = confirmMilestoneEvent(first, milestone, "2026-11-02", {
      eventId: "unused-id",
      timestamp: "2026-10-17T07:00:00.000Z",
    });
    expect(second.events).toHaveLength(first.events.length);
    expect(
      second.events.find((event) => event.id === "ceremony-event"),
    ).toMatchObject({
      date: "2026-11-02",
      description: "Gia đình cùng chuẩn bị.",
      createdAt: "2026-10-17T06:00:00.000Z",
      updatedAt: "2026-10-17T07:00:00.000Z",
    });
  });
  it("rejects confirmation for a different child or a paused journey", () => {
    const seed = createDemoData("2026-10-17");
    const milestone = generateMilestones(seed.children[0])[0];
    const metadata = {
      eventId: "ceremony-event",
      timestamp: "2026-10-17T06:00:00.000Z",
    };
    expect(() =>
      confirmMilestoneEvent(
        { ...seed, activeChildId: seed.children[1].id },
        milestone,
        "2026-11-01",
        metadata,
      ),
    ).toThrow();
    seed.children[0].lifecycle = "PAUSED";
    expect(() =>
      confirmMilestoneEvent(seed, milestone, "2026-11-01", metadata),
    ).toThrow();
  });
});
