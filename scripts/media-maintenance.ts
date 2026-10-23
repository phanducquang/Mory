import { existsSync } from "node:fs";
async function main() {
if (existsSync(".env")) process.loadEnvFile(".env");
// Dynamic imports run after loading the operator's environment. No credentials are logged.
const { createDatabaseClient } = await import("../src/server/db/client");
const { readStorageConfiguration } = await import("../src/server/storage/config");
const { createS3Storage } = await import("../src/server/storage/s3");
const { maintainMedia } = await import("../src/server/storage/maintenance");
const db = createDatabaseClient();
try {
  if (process.env.MORY_MEDIA_ENABLED !== "true") throw new Error("Private media is disabled.");
  const config = readStorageConfiguration();
  const result = await maintainMedia(db, createS3Storage(config), `${config.endpoint}/${config.bucket}`);
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} catch { console.error("Media maintenance failed. Check database/storage configuration and availability."); process.exitCode = 1; }
finally { await db.$disconnect(); }

}
void main().catch(() => { console.error("Media maintenance could not initialize."); process.exitCode = 1; });
