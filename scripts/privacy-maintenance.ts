import { existsSync } from "node:fs";
async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const { createDatabaseClient } = await import("../src/server/db/client");
  const { maintainPrivacy } = await import("../src/server/privacy/maintenance");
  const db = createDatabaseClient();
  try {
    let storage;
    if (process.env.MORY_MEDIA_ENABLED === "true") {
      const { readStorageConfiguration } = await import("../src/server/storage/config");
      const { createS3Storage } = await import("../src/server/storage/s3");
      storage = createS3Storage(readStorageConfiguration());
    }
    const result = await maintainPrivacy(db, storage); console.log(JSON.stringify(result));
    if (result.failed || result.blocked) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Privacy maintenance failed; inspect database/storage availability. No private payload was logged."); process.exitCode = 1; });
