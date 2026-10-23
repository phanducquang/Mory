import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eventSchema } from "@/lib/validation";
import type { JourneyRepository } from "../repositories/journey-repository";
import type { AuthorizationService, SessionProvider } from "./access";

// Attachments must use the verified media service, never arbitrary URLs/data URIs.
const eventMutationSchema = eventSchema
  .omit({ images: true })
  .extend({ images: z.array(z.never()).max(0).default([]) });

interface Dependencies {
  sessions: SessionProvider;
  authorization: AuthorizationService;
  repository: JourneyRepository;
}

/** Future Server Components/Actions call services directly; no internal HTTP hop. */
export function createJourneyService({
  sessions,
  authorization,
  repository,
}: Dependencies) {
  return {
    async listChildren() {
      const session = await sessions.requireSession();
      await authorization.requireFamilyAccess(session, "read");
      return repository.listChildren(session.familyId);
    },
    async listEvents(childId: string, cursor?: string) {
      const session = await sessions.requireSession();
      await authorization.requireChildAccess(session, childId, "read");
      return repository.listEvents(session.familyId, childId, cursor);
    },
    async getEvent(eventId: string) {
      const session = await sessions.requireSession();
      await authorization.requireEventAccess(session, eventId, "read");
      return repository.findEvent(session.familyId, eventId);
    },
    async createEvent(childId: string, rawInput: unknown) {
      const session = await sessions.requireSession();
      const input = eventMutationSchema.parse(rawInput);
      await authorization.requireChildAccess(session, childId, "write");
      const timestamp = new Date().toISOString();
      return repository.createEvent(session.familyId, {
        ...input,
        id: randomUUID(),
        childId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    },
    async updateEvent(eventId: string, rawInput: unknown) {
      const session = await sessions.requireSession();
      const input = eventMutationSchema.parse(rawInput);
      await authorization.requireEventAccess(session, eventId, "write");
      const existing = await repository.findEvent(session.familyId, eventId);
      if (!existing) throw new Error("Event not found.");
      return repository.updateEvent(session.familyId, {
        ...existing,
        ...input,
        images: existing.images,
        updatedAt: new Date().toISOString(),
      });
    },
    async deleteEvent(eventId: string) {
      const session = await sessions.requireSession();
      await authorization.requireEventAccess(session, eventId, "write");
      await repository.deleteEvent(session.familyId, eventId);
    },
  };
}
