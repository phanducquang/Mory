import { todayVN } from "@/lib/dates";
import type {
  Child,
  ChildMilestone,
  DateOnly,
  DemoData,
  Event,
  EventType,
} from "@/types/domain";
import { generateMilestones, milestoneDate } from "@/features/milestones";

type TimelineRecord = Pick<
  Event,
  "id" | "childId" | "date" | "time" | "title" | "description" | "type"
>;
export type TimelineItem = TimelineRecord &
  Pick<Event, "images"> &
  (
    | { source: "event"; event: Event }
    | { source: "milestone"; milestone: ChildMilestone }
  );

/** Project suggestions without persisting fake events or invented audit timestamps. */
export function projectTimeline(
  data: Pick<DemoData, "events" | "milestones">,
  child: Child,
  at: DateOnly = todayVN(),
): TimelineItem[] {
  const events: TimelineItem[] = data.events
    .filter((e) => e.childId === child.id)
    .map((event) => ({ ...event, source: "event", event }));
  const suggestions: TimelineItem[] = generateMilestones(
    child,
    data.milestones,
    at,
  )
    .filter(
      (m) =>
        ["SUGGESTED", "PENDING_CONFIRMATION"].includes(m.state) &&
        !m.eventId &&
        !!milestoneDate(m),
    )
    .map((m) => ({
      id: `suggestion:${m.id}`,
      childId: child.id,
      title: m.title,
      date: milestoneDate(m)!,
      type: "milestone",
      description: m.description,
      images: [],
      source: "milestone",
      milestone: m,
    }));
  return [...events, ...suggestions];
}

export interface TimelineFilters {
  childId?: string;
  type?: EventType | "all";
  period?: "all" | "past" | "upcoming";
  search?: string;
  order?: "asc" | "desc";
}
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

export function filterTimeline<T extends TimelineRecord>(
  events: T[],
  filters: TimelineFilters = {},
  at: DateOnly = todayVN(),
): T[] {
  const query = normalize(filters.search?.trim() ?? "");
  return events
    .filter((event) => {
      if (filters.childId && event.childId !== filters.childId) return false;
      if (filters.type && filters.type !== "all" && event.type !== filters.type)
        return false;
      if (filters.period === "past" && event.date > at) return false;
      if (filters.period === "upcoming" && event.date < at) return false;
      return (
        !query ||
        normalize(`${event.title} ${event.description}`).includes(query)
      );
    })
    .sort((a, b) => {
      const byDate = `${a.date}T${a.time ?? ""}`.localeCompare(
        `${b.date}T${b.time ?? ""}`,
      );
      return (
        (filters.order === "asc" ? byDate : -byDate) ||
        (filters.order === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id))
      );
    });
}

export function groupTimeline<T extends TimelineRecord>(
  events: T[],
  by: "month" | "year" = "month",
): Array<{ key: string; label: string; events: T[] }> {
  const groups = new Map<string, T[]>();
  for (const event of events) {
    const key = event.date.slice(0, by === "year" ? 4 : 7);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups].map(([key, items]) => ({
    key,
    label:
      by === "year"
        ? `Năm ${key}`
        : `Tháng ${Number(key.slice(5))}, ${key.slice(0, 4)}`,
    events: items,
  }));
}
