import { describe, expect, it } from "vitest";
import { createDemoData } from "@/lib/demo-data";
import { parseDemoData } from "@/lib/validation";
import {
  confirmMilestoneEvent,
  createCustomMilestone,
  generateMilestones,
} from "@/features/milestones";
import {
  projectTimeline,
  filterTimeline,
  groupTimeline,
} from "@/features/timeline/domain";
const metadata = {
  id: "first-step",
  eventId: "custom-event",
  timestamp: "2024-03-01T05:00:00.000Z",
};
const input = {
  title: "  Bước chân đầu tiên  ",
  description: "Theo nhịp riêng của con",
  date: "",
};
function journey() {
  const data = createDemoData("2024-03-01");
  data.children[0].birthDate = "2024-02-10";
  return data;
}

describe("custom milestones", () => {
  it("saves an undated milestone without a deadline or a fabricated calendar event", () => {
    const data = journey();
    const next = createCustomMilestone(data, input, metadata);
    expect(next.milestones?.[0]).toMatchObject({
      kind: "custom",
      state: "SUGGESTED",
      title: "Bước chân đầu tiên",
      description: input.description,
    });
    expect(next.milestones?.[0].suggestedDate).toBeUndefined();
    expect(next.events).toEqual(data.events);
    expect(data.milestones).toEqual([]);
    expect(parseDemoData(next)).toEqual(next);
  });
  it("atomically confirms a dated custom milestone and keeps its journal in exactly one event", () => {
    const next = createCustomMilestone(
      journey(),
      { ...input, date: "2024-03-10" },
      metadata,
    );
    expect(next.milestones?.[0]).toMatchObject({
      state: "CONFIRMED",
      confirmedDate: "2024-03-10",
      eventId: metadata.eventId,
    });
    expect(next.events.find((e) => e.id === metadata.eventId)).toMatchObject({
      title: "Bước chân đầu tiên",
      date: "2024-03-10",
      description: input.description,
      type: "milestone",
      createdAt: metadata.timestamp,
    });
    const again = confirmMilestoneEvent(
      next,
      next.milestones![0],
      "2024-03-12",
      { eventId: "not-used", timestamp: "2024-03-02T05:00:00.000Z" },
    );
    expect(
      again.events.filter((e) => e.title === "Bước chân đầu tiên"),
    ).toHaveLength(1);
    expect(again.events.find((e) => e.id === metadata.eventId)?.createdAt).toBe(
      metadata.timestamp,
    );
    expect(parseDemoData(again)).toEqual(again);
  });
  it("rejects invalid dates, duplicate identifiers and paused journeys without mutating data", () => {
    const data = journey();
    expect(() =>
      createCustomMilestone(data, { ...input, date: "2024-02-30" }, metadata),
    ).toThrow();
    expect(() =>
      createCustomMilestone(data, { ...input, title: " " }, metadata),
    ).toThrow();
    const next = createCustomMilestone(data, input, metadata);
    expect(() => createCustomMilestone(next, input, metadata)).toThrow(
      "đã tồn tại",
    );
    data.children[0].lifecycle = "PAUSED";
    expect(() => createCustomMilestone(data, input, metadata)).toThrow(
      "tiếp tục",
    );
    expect(data.events).toHaveLength(5);
  });
});

describe("automatic milestone projection on the journey timeline", () => {
  it("merges dated automatic suggestions without persisting fake events or timestamps", () => {
    const data = journey();
    const before = JSON.stringify(data);
    const items = projectTimeline(data, data.children[0], "2024-03-01");
    const fullMonth = items.find(
      (i) => i.source === "milestone" && i.milestone.kind === "full-month",
    );
    expect(fullMonth).toMatchObject({
      source: "milestone",
      date: "2024-03-10",
      title: "Lễ đầy tháng",
      type: "milestone",
    });
    expect(fullMonth).not.toHaveProperty("createdAt");
    expect(fullMonth).not.toHaveProperty("updatedAt");
    expect(JSON.stringify(data)).toBe(before);
  });
  it("filters and groups both events and suggestions by actual date, type and Vietnamese search", () => {
    const data = journey();
    const items = projectTimeline(data, data.children[0], "2024-03-01");
    const result = filterTimeline(
      items,
      { type: "milestone", period: "upcoming", search: "day thang" },
      "2024-03-01",
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Lễ đầy tháng");
    expect(groupTimeline(result)[0]).toMatchObject({
      key: "2024-03",
      events: result,
    });
    expect(
      filterTimeline(items, { type: "memory" }).every(
        (i) => i.source === "event",
      ),
    ).toBe(true);
  });
  it("replaces a suggestion with one confirmed event and does not resurrect skipped or paused suggestions", () => {
    const data = journey();
    const child = data.children[0];
    const fullMonth = generateMilestones(child, [], "2024-03-01").find(
      (m) => m.kind === "full-month",
    )!;
    const next = confirmMilestoneEvent(data, fullMonth, "2024-03-11", metadata);
    const items = projectTimeline(next, child, "2024-03-01").filter(
      (i) => i.title === fullMonth.title,
    );
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("event");
    expect(items[0].date).toBe("2024-03-11");
    expect(
      projectTimeline(
        { ...data, milestones: [{ ...fullMonth, state: "SKIPPED" }] },
        child,
      ).some(
        (i) => i.source === "milestone" && i.milestone.kind === "full-month",
      ),
    ).toBe(false);
    expect(
      projectTimeline(data, { ...child, lifecycle: "PAUSED" }).every(
        (i) => i.source === "event",
      ),
    ).toBe(true);
  });
  it("scopes projected events to the selected child and retains undated custom milestones only in the profile", () => {
    const data = createCustomMilestone(journey(), input, metadata);
    const items = projectTimeline(data, data.children[1]);
    expect(items.every((i) => i.childId === data.children[1].id)).toBe(true);
    expect(items.some((i) => i.title === input.title.trim())).toBe(false);
    expect(data.milestones).toHaveLength(1);
  });
});
