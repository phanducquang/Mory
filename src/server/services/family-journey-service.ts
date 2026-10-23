import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { childSchema, customMilestoneSchema, birthConfirmationSchema } from "@/lib/validation";
import type { FamilyJourneyRepository } from "../repositories/journey-repository";
import type { AuthorizationService, SessionProvider } from "./access";

const profileInput = childSchema.safeExtend({
  reminderEnabled: z.boolean().optional(), trackingUntilAge: z.number().int().min(2).max(100).optional(),
});

/** Session and roles must come from real server adapters before exposing these operations. */
export function createFamilyJourneyService({ sessions, authorization, repository }: {
  sessions: SessionProvider; authorization: AuthorizationService; repository: FamilyJourneyRepository;
}) {
  async function access(childId: string, permission: "read" | "write") {
    const session = await sessions.requireSession();
    await authorization.requireChildAccess(session, childId, permission);
    return session;
  }
  return {
    async createChild(rawInput: unknown) {
      const session = await sessions.requireSession();
      await authorization.requireFamilyAccess(session, "write");
      const input = profileInput.parse(rawInput);
      return repository.createChild(session.familyId, { ...input, id: randomUUID(), familyId: session.familyId });
    },
    async updateChild(childId: string, rawInput: unknown) {
      const session = await access(childId, "write");
      const input = profileInput.parse(rawInput);
      return repository.updateChild(session.familyId, { ...input, id: childId, familyId: session.familyId });
    },
    async confirmBirth(childId: string, rawInput: unknown) {
      const session = await access(childId, "write");
      const input = birthConfirmationSchema.parse(rawInput);
      return repository.confirmBirth(session.familyId, childId, input.birthDate, input.birthTime);
    },
    async setTrackingState(childId: string, rawState: unknown) {
      const session = await access(childId, "write");
      const state = z.enum(["PAUSED", "ENDED", "RESUME"]).parse(rawState);
      return repository.setTrackingState(session.familyId, childId, state);
    },
    async snoozeBirthConfirmation(childId: string, days = 1) {
      const session = await access(childId, "write");
      return repository.snoozeBirthConfirmation(session.familyId, childId, days);
    },
    async listMilestones(childId: string) {
      const session = await access(childId, "read");
      return repository.listMilestones(session.familyId, childId);
    },
    async confirmMilestone(childId: string, key: string, date: string) {
      const session = await access(childId, "write");
      return repository.confirmMilestone(session.familyId, childId, key, date);
    },
    async createCustomMilestone(childId: string, rawInput: unknown) {
      const session = await access(childId, "write");
      return repository.createCustomMilestone(session.familyId, childId, customMilestoneSchema.parse(rawInput));
    },
    async setMilestoneState(childId: string, key: string, rawState: unknown) {
      const session = await access(childId, "write");
      return repository.setMilestoneState(session.familyId, childId, key, z.enum(["COMPLETED", "SKIPPED"]).parse(rawState));
    },
  };
}
