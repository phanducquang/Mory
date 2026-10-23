import { existsSync } from "node:fs";
async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const [mode, filename, ledgerFile] = process.argv.slice(2);
  if (!["create", "ledger", "restore"].includes(mode) || !filename || (mode === "restore" && !ledgerFile)) throw new Error("Usage: npm run backup -- create|ledger FILE, or restore FILE LEDGER. Restore requires fresh DB/bucket and stopped application traffic.");
  const { readBackupKey } = await import("../src/server/backup/encryption"); const key = readBackupKey();
  const { createDatabaseClient } = await import("../src/server/db/client");
  const { createBackup, exportDeletionLedger, restoreBackup } = await import("../src/server/backup/service");
  const db = createDatabaseClient();
  try {
    let storage;
    if (process.env.MORY_MEDIA_ENABLED === "true") {
      const { readStorageConfiguration } = await import("../src/server/storage/config");
      const { createS3Storage } = await import("../src/server/storage/s3"); storage = createS3Storage(readStorageConfiguration());
    }
    if (mode === "ledger") await exportDeletionLedger(db, filename, key);
    else if (mode === "create") await createBackup(db, process.env.DATABASE_URL!, storage, filename, key);
    else await restoreBackup(process.env.DATABASE_URL!, storage, filename, ledgerFile, key);
    console.log(JSON.stringify({ operation: mode, completed: true }));
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Backup operation failed. Check key, database tools, empty restore targets, current deletion ledger and service availability. No private details were logged."); process.exitCode = 1; });
