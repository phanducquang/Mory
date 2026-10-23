import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const { createDatabaseClient } = await import("../src/server/db/client");
  const { configuredMailPass } = await import("../src/server/mail/maintenance");
  if (process.env.AUTH_EMAIL_ENABLED !== "true") throw new Error();
  const db = createDatabaseClient();
  let stopped = false;
  process.once("SIGTERM", () => { stopped = true; }); process.once("SIGINT", () => { stopped = true; });
  try {
    do {
      const stats = await configuredMailPass(db);
      if (!process.argv.includes("--watch") || stats.sent || stats.failed || stats.retry) console.log(JSON.stringify(stats));
      if (stats.failed || stats.retry) { if (!process.argv.includes("--watch")) process.exitCode = 1; }
      if (process.argv.includes("--watch") && !stopped) await delay(500);
    } while (process.argv.includes("--watch") && !stopped);
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Auth mail worker failed. Check configuration and service availability."); process.exitCode = 1; });
