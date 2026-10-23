import "server-only";
import { createDatabaseClient } from "./db/client";
import { createDatabaseAuthorization } from "./db/authorization";
import { createPostgresJourneyRepository } from "./repositories/postgres-journey-repository";
import { createAuthentication } from "./auth/factory";
import { readAuthConfig, serverDataEnabled } from "./auth/config";

function createRuntime() {
  if (!serverDataEnabled()) throw new Error("Chế độ tài khoản chưa được bật.");
  const config = readAuthConfig();
  const db = createDatabaseClient();
  return { db, auth: createAuthentication(db, config), authorization: createDatabaseAuthorization(db), repository: createPostgresJourneyRepository(db) };
}
let runtime: ReturnType<typeof createRuntime> | undefined;
/** Only caches connections/configuration, never session or family data. */
export function getServerRuntime() { return runtime ??= createRuntime(); }
