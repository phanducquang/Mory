import { describe, expect, it } from "vitest";
import {
  confirmMilestone,
  generateMilestones,
  milestoneDate,
  upcomingMilestones,
} from "@/features/milestones";
import { suggestLunarCeremony } from "@/lib/lunar-calendar";
import type { Child } from "@/types/domain";

const child: Child = {
  id: "child-a",
  name: "An",
  lifecycle: "AFTER_BIRTH",
  birthDate: "2024-02-29",
};

describe("milestone engine", () => {
  it("keeps a due milestone pending without creating post-birth milestones", () => {
    const milestones = generateMilestones(
      {
        ...child,
        lifecycle: "EXPECTING",
        birthDate: undefined,
        dueDate: "2026-10-10",
      },
      [],
      "2026-10-17",
    );
    expect(milestones).toHaveLength(1);
    expect(milestones[0]).toMatchObject({
      kind: "due",
      state: "PENDING_CONFIRMATION",
      suggestedDate: "2026-10-10",
    });
  });
  it("does not substitute a solar month or solar birthday for a lunar ceremony", () => {
    const milestones = generateMilestones(child, [], "2026-10-17");
    for (const key of ["full-month", "first-birthday"]) {
      expect(milestones.find((item) => item.key === key)).toMatchObject({
        state: "PENDING_CONFIRMATION",
        needsDateConfirmation: true,
      });
      expect(
        milestones.find((item) => item.key === key)?.suggestedDate,
      ).toBeTruthy();
    }
    expect(
      milestones.find((item) => item.key === "first-birthday")?.suggestedDate,
    ).not.toBe("2025-02-28");
    expect(
      milestones.find((item) => item.key === "birthday-1"),
    ).toBeUndefined();
    expect(
      milestones.find((item) => item.key === "birthday-2")?.suggestedDate,
    ).toBe("2026-02-28");
    expect(
      milestones.find((item) => item.key === "birthday-4")?.suggestedDate,
    ).toBe("2028-02-29");
  });
  it("requires family confirmation for all unverified lunar conversions including leap and short months", () => {
    for (const birthDate of [
      "2023-03-22",
      "2024-02-09",
      "2025-07-25",
      "2026-02-16",
    ]) {
      for (const kind of ["full-month", "first-birthday"] as const) {
        expect(suggestLunarCeremony(birthDate, kind)).toMatchObject({
          requiresConfirmation: true,
        });
        expect(
          suggestLunarCeremony(birthDate, kind).suggestedDate,
        ).toBeUndefined();
      }
    }
  });
  it("preserves a confirmed date when a birth date or family rule changes", () => {
    const original = generateMilestones(child, [], "2026-10-17");
    const ceremony = original.find((item) => item.key === "first-birthday")!;
    const confirmed = confirmMilestone(ceremony, "2025-03-01");
    const changed = generateMilestones(
      { ...child, birthDate: "2024-03-01", calendarRule: "MINUS_TWO" },
      [confirmed],
      "2026-10-17",
    );
    expect(changed.find((item) => item.key === ceremony.key)).toEqual(
      confirmed,
    );
    expect(milestoneDate(confirmed)).toBe("2025-03-01");
  });
  it("does not resurrect skipped milestones or remove custom milestones", () => {
    const ceremony = generateMilestones(child)[0];
    const skipped = { ...ceremony, state: "SKIPPED" as const };
    const custom = {
      ...ceremony,
      id: "custom",
      key: "first-step",
      kind: "custom" as const,
      title: "Bước chân đầu tiên",
      state: "COMPLETED" as const,
      confirmedDate: "2025-04-01",
    };
    const result = generateMilestones(child, [skipped, custom]);
    expect(result.find((item) => item.key === skipped.key)?.state).toBe(
      "SKIPPED",
    );
    expect(result).toContainEqual(custom);
  });
  it("suppresses generated reminders for paused journeys and respects family tracking age", () => {
    expect(generateMilestones({ ...child, lifecycle: "PAUSED" })).toEqual([]);
    expect(generateMilestones({ ...child, lifecycle: "ENDED" })).toEqual([]);
    expect(
      generateMilestones(
        { ...child, trackingUntilAge: 2 },
        [],
        "2026-10-17",
      ).filter((item) => item.kind === "birthday"),
    ).toHaveLength(1);
  });
  it("excludes completed, skipped and date-less suggestions from upcoming dates", () => {
    const milestones = generateMilestones(child, [], "2026-10-17");
    expect(
      upcomingMilestones(milestones, "2026-10-17").map((item) => item.key),
    ).toEqual(["birthday-3", "birthday-4"]);
  });
});
