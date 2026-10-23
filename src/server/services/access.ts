import "server-only";

export interface SessionContext {
  userId: string;
  familyId: string;
}

/** Resolve from a verified server-side session; never from request body IDs. */
export interface SessionProvider {
  requireSession(): Promise<SessionContext>;
}

export interface AuthorizationService {
  requireFamilyAccess(session: SessionContext, permission: "read" | "write"): Promise<void>;
  requireChildAccess(
    session: SessionContext,
    childId: string,
    permission: "read" | "write",
  ): Promise<void>;
  requireEventAccess(
    session: SessionContext,
    eventId: string,
    permission: "read" | "write",
  ): Promise<{ childId: string }>;
}

export class ServerNotConfiguredError extends Error {
  constructor(feature: string) {
    super(
      `${feature} is not configured. The browser demo does not provide server authentication or persistence.`,
    );
    this.name = "ServerNotConfiguredError";
  }
}

/** Fail closed until a real session adapter is explicitly supplied. */
export const unavailableSessionProvider: SessionProvider = {
  async requireSession() {
    throw new ServerNotConfiguredError("Authentication");
  },
};
