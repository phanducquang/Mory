import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const { createDatabaseClient } = await import("../src/server/db/client");
  const { readAppOrigin } = await import("../src/server/auth/config");
  const { scheduleReminders } = await import("../src/server/reminders/scheduler");
  if (process.env.MORY_REMINDERS_ENABLED !== "true" || process.env.AUTH_EMAIL_ENABLED !== "true") throw new Error();
  const db = createDatabaseClient();
  let stopped = false; const stop = new AbortController();
  process.once("SIGTERM", () => { stopped = true; stop.abort(); }); process.once("SIGINT", () => { stopped = true; stop.abort(); });
  try { do {
    const stats = await scheduleReminders(db, readAppOrigin(process.env.BETTER_AUTH_URL).origin);
    if (!process.argv.includes("--watch") || stats.queued) console.log(JSON.stringify(stats));
    if (process.argv.includes("--watch") && !stopped) await delay(process.env.MORY_INTEGRATION_DATABASE === "disposable-docker" ? 500 : 60_000, undefined, { signal: stop.signal }).catch(() => {});
  } while (process.argv.includes("--watch") && !stopped); }
  finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Reminder scheduling failed. Check configuration and service availability."); process.exitCode = 1; });
