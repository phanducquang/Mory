import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";
import { ServerNotConfiguredError } from "../services/access";

/** No fallback database or credentials. The caller owns the connection pool. */
export function createDatabaseClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new ServerNotConfiguredError("PostgreSQL");
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2)
      throw new Error();
  } catch {
    throw new ServerNotConfiguredError("Valid PostgreSQL DATABASE_URL");
  }
  const adapter = new PrismaPg({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
  return new PrismaClient({ adapter });
}
