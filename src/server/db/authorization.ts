import "server-only";

import type { PrismaClient } from "./generated/client";
import type { AuthorizationService, SessionContext } from "../services/access";
import { ResourceNotFoundError } from "./errors";

/** Re-check membership on every call; no cached roles or client-supplied family authority. */
export function createDatabaseAuthorization(db: PrismaClient): AuthorizationService {
  async function requireFamilyAccess(session: SessionContext, permission: "read" | "write") {
    const member = await db.familyMember.findUnique({
      where: { familyId_userId: { familyId: session.familyId, userId: session.userId } },
      include: { family: true, user: true },
    });
    if (!member || member.family.deletionRequestedAt || member.user.deletionRequestedAt || (permission === "write" && member.role === "VIEWER"))
      throw new ResourceNotFoundError();
  }
  return {
    requireFamilyAccess,
    async requireChildAccess(session, childId, permission) {
      await requireFamilyAccess(session, permission);
      if (!await db.child.findFirst({ where: { familyId: session.familyId, id: childId }, select: { id: true } }))
        throw new ResourceNotFoundError();
    },
    async requireEventAccess(session, eventId, permission) {
      await requireFamilyAccess(session, permission);
      const event = await db.event.findFirst({ where: { familyId: session.familyId, id: eventId }, select: { childId: true } });
      if (!event) throw new ResourceNotFoundError();
      return event;
    },
  };
}
