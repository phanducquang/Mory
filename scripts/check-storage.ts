import { existsSync } from "node:fs";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: npm run storage:check [--probe]\nDefault: read-only S3 listing/version checks, no DB.\n--probe: writes/deletes its own random key; use a separate PRIVATE VERSIONED TEST BUCKET only.\nLoads MORY_ENV_FILE or .env; never prints credentials or object keys.");
    return;
  }
  if (args.some(arg => arg !== "--probe")) throw new Error("Unknown option.");
  const file = process.env.MORY_ENV_FILE || ".env";
  if (process.env.MORY_ENV_FILE || existsSync(file)) process.loadEnvFile(file);
  const { readStorageConfiguration } = await import("../src/server/storage/config");
  const { createS3Client, createS3Storage } = await import("../src/server/storage/s3");
  const { checkStorageCompatibility } = await import("../src/server/storage/compatibility");
  const config = readStorageConfiguration();
  const client = createS3Client(config);
  let stage = "configuration";
  try {
    const result = await checkStorageCompatibility(config, client, createS3Storage(config, client), { probe: args.includes("--probe"), onStep: value => { stage = value; } });
    console.log(JSON.stringify({ completed: true, ...result }));
  } catch {
    console.error(JSON.stringify({ completed: false, stage, message: "Check endpoint/TLS, private bucket, permissions and version support. Probe mode requires a separate version-enabled test bucket; inspect it if cleanup failed." }));
    process.exitCode = 1;
  } finally { client.destroy(); }
}
void main().catch(() => { console.error("Storage check could not initialize. Check S3_* and MORY_ENV_FILE; no private details were logged."); process.exitCode = 1; });
