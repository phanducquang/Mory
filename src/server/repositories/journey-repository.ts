import "server-only";

import type { Child, ChildMilestone, Event as JourneyEvent } from "@/types/domain";
import type { CustomMilestoneInput } from "@/lib/validation";

/** Every implementation must apply familyId in its query predicates. */
export interface JourneyRepository {
  listChildren(familyId: string): Promise<Child[]>;
  findChild(familyId: string, childId: string): Promise<Child | null>;
  listEvents(
    familyId: string,
    childId: string,
    cursor?: string,
  ): Promise<{ events: JourneyEvent[]; nextCursor?: string }>;
  findEvent(familyId: string, eventId: string): Promise<JourneyEvent | null>;
  createEvent(familyId: string, event: JourneyEvent): Promise<JourneyEvent>;
  updateEvent(familyId: string, event: JourneyEvent): Promise<JourneyEvent>;
  /** Atomically delete associated reminders and queue private-object cleanup. */
  deleteEvent(familyId: string, eventId: string): Promise<void>;
}

export interface FamilyJourneyRepository extends JourneyRepository {
  createChild(familyId: string, child: Child): Promise<Child>;
  updateChild(familyId: string, child: Child): Promise<Child>;
  confirmBirth(familyId: string, childId: string, date: string, time?: string): Promise<Child>;
  snoozeBirthConfirmation(familyId: string, childId: string, days: number): Promise<Child>;
  setTrackingState(familyId: string, childId: string, state: "PAUSED" | "ENDED" | "RESUME"): Promise<Child>;
  listMilestones(familyId: string, childId: string): Promise<ChildMilestone[]>;
  confirmMilestone(familyId: string, childId: string, key: string, date: string): Promise<ChildMilestone>;
  createCustomMilestone(familyId: string, childId: string, input: CustomMilestoneInput): Promise<ChildMilestone>;
  setMilestoneState(familyId: string, childId: string, key: string, state: "COMPLETED" | "SKIPPED"): Promise<ChildMilestone>;
}
