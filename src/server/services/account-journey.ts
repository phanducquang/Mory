import "server-only";
import { createPostgresJourneyRepository } from "../repositories/postgres-journey-repository";
import { readAuthConfig } from "../auth/config";
import { mediaEnabled } from "../storage/runtime";
import { cookies } from "next/headers";
import { requireAccount } from "../auth/session";
import { getServerRuntime } from "../runtime";
import { createJourneyService } from "./journey-service";
import { createFamilyJourneyService } from "./family-journey-service";
import { queryFamilyEvents } from "../repositories/postgres-event-query";
import type { DemoData } from "@/types/domain";
import { timelineQuerySchema } from "@/lib/validation/timeline-query";

export async function accountServices() {
  const account = await requireAccount();
  const runtime = getServerRuntime();
  const repository = createPostgresJourneyRepository(runtime.db, account.userId);
  const dependencies = { ...runtime, repository, sessions: { requireSession: async () => account } };
  return { ...runtime, repository, account, journey: createJourneyService(dependencies), family: createFamilyJourneyService(dependencies) };
}
export async function loadAccountSnapshot(selectedChildId?: string) {
  const { account, journey, family, db } = await accountServices();
  const children = await journey.listChildren();
  const notificationPreference = await db.userPreference.findUnique({ where: { userId: account.userId } });
  const capabilities = { remindersEnabled: process.env.MORY_REMINDERS_ENABLED === "true" && !!readAuthConfig().emailEnabled, notificationsEnabled: notificationPreference?.notificationsEnabled ?? false };
  const preference = selectedChildId ?? (await cookies()).get("mory-child")?.value;
  const child = children.find((c) => c.id === preference) ?? children[0];
  if (!child) return { data: { children, events: [], milestones: [], activeChildId: "" } satisfies DemoData, ...capabilities, mediaEnabled: mediaEnabled(), canWrite: account.role !== "VIEWER", displayName: account.displayName };
  const [past, upcoming, milestones] = await Promise.all([
    queryFamilyEvents(db, account.familyId, child.id, { period: "past", order: "desc" }),
    queryFamilyEvents(db, account.familyId, child.id, { period: "upcoming", order: "asc" }),
    family.listMilestones(child.id),
  ]);
  const events = [...new Map([...past.events, ...upcoming.events].map((e) => [e.id, e])).values()];
  return { data: { children, events, milestones, activeChildId: child.id } satisfies DemoData, ...capabilities, mediaEnabled: mediaEnabled(), canWrite: account.role !== "VIEWER", displayName: account.displayName };
}
export type AccountSnapshot = Awaited<ReturnType<typeof loadAccountSnapshot>>;

export async function loadInitialTimeline(eventsOnly = false) {
  const { account, journey, db } = await accountServices();
  const children = await journey.listChildren();
  const preference = (await cookies()).get("mory-child")?.value;
  const child = children.find((c) => c.id === preference) ?? children[0];
  if (!child) return undefined;
  const query = timelineQuerySchema.parse(eventsOnly ? { period: "upcoming", order: "asc" } : {});
  return { childId: child.id, query, ...await queryFamilyEvents(db, account.familyId, child.id, query) };
}
