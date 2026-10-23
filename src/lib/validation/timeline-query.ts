import { z } from "zod";
import type { Event } from "@/types/domain";
export const timelineQuerySchema = z.object({
  type: z.enum(["all", "memory", "milestone", "health", "activity"]).default("all"),
  period: z.enum(["all", "past", "upcoming"]).default("all"),
  search: z.string().trim().max(100).default(""), order: z.enum(["asc", "desc"]).default("desc"),
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export interface InitialTimelinePage { childId: string; query: TimelineQuery; events: Event[]; nextCursor?: string }
export const normalizeSearch = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
