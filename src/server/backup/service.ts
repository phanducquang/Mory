import "server-only";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import type { PrismaClient } from "../db/generated/client";
import type { PrivateObjectStorage } from "../storage/contracts";
import { readEncryptedBackup, writeEncryptedBackup, verifyEncryptedBackup } from "./encryption";
import { BACKUP_LOCK } from "./lock";
const DAY = 86_400_000;
const id = z.uuid();
const tombstone = z.object({ kind: z.enum(["FAMILY", "USER"]), resourceId: id });
const keyPattern = /^families\/([0-9a-f-]{36})\/(?:events\/[0-9a-f-]{36}\/[0-9a-f-]{36}|children\/[0-9a-f-]{36}\/avatars\/[0-9a-f-]{36})$/i;
function processEnvironment(connectionString: string) {
  const u = new URL(connectionString);
  const sslmode = u.searchParams.get("sslmode");
  if (u.searchParams.size && [...u.searchParams.keys()].some((k) => k !== "sslmode")) throw new Error("Backup connection supports sslmode only; configure libpq TLS through PGSSL* variables.");
  return { ...process.env, PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.slice(1)), ...(sslmode ? { PGSSLMODE: sslmode } : {}) };
}
function command(binary: string, args: string[], connectionString: string) {
  const child = spawn(binary, args, { env: processEnvironment(connectionString), stdio: ["pipe", "pipe", "pipe"] });
  // Database tools can echo SQL/data in errors: expose only a generic status.
  let diagnostic = "";
  child.stderr.on("data", (chunk: Buffer) => { diagnostic = (diagnostic + chunk.toString()).slice(-8000); });
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error("Database backup tool could not start.")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Database backup tool failed (${binary.endsWith("test-psql.mjs") ? "restore" : "dump"}; ${/cannot insert multiple commands|cannot run inside a transaction|syntax error/i.test(diagnostic) ? "SQL syntax/transaction" : /schema "public" already exists/i.test(diagnostic) ? "public schema exists" : /unrecognized configuration parameter/i.test(diagnostic) ? "server parameter" : /violates foreign key/i.test(diagnostic) ? "foreign key" : /already exists/i.test(diagnostic) ? "existing object" : /invalid command/i.test(diagnostic) ? "psql meta-command" : /snapshot/i.test(diagnostic) ? "snapshot" : /permission denied/i.test(diagnostic) ? "permissions" : /unrecognized|invalid option/i.test(diagnostic) ? "tool options" : /connection|connect/i.test(diagnostic) ? "connection" : (process.env.MORY_INTEGRATION_DATABASE === "disposable-docker" ? diagnostic.match(/ERROR:\s*([a-z ]{1,80})/i)?.[1] ?? "execution" : "execution")}).`)));
  });
  void done.catch(() => {});
  return { child, done };
}
export async function exportDeletionLedger(db: PrismaClient, filename: string, key: Buffer) {
  await writeEncryptedBackup(filename, key, async (record) => {
    // Repeatable-read makes ledger generation time an honest lower bound for its contents.
    await db.$transaction(async (tx) => {
      const generatedAt = new Date().toISOString(); await record({ type: "ledger", version: 1, generatedAt });
      let cursor: string | undefined; let count = 0;
      do {
        const rows = await tx.deletionTombstone.findMany({ where: cursor ? { id: { gt: cursor } } : {}, orderBy: { id: "asc" }, take: 500 });
        for (const row of rows) { await record({ type: "deletion", ...tombstone.parse(row) }); count++; }
        cursor = rows.length === 500 ? rows.at(-1)!.id : undefined;
      } while (cursor);
      await record({ type: "end", count });
    }, { isolationLevel: "RepeatableRead", timeout: 120_000 });
  });
}
export async function createBackup(db: PrismaClient, connectionString: string, storage: PrivateObjectStorage | undefined, filename: string, key: Buffer, binary = process.env.PG_DUMP_BIN || "pg_dump") {
  const snapshot = new pg.Client({ connectionString }); await snapshot.connect();
  let dump: ReturnType<typeof command> | undefined;
  const timer = setTimeout(() => { dump?.child.kill("SIGKILL"); void snapshot.end(); }, 30 * 60_000); timer.unref();
  try {
    await snapshot.query("SELECT pg_advisory_lock_shared($1)", [BACKUP_LOCK]);
    await snapshot.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const exported = await snapshot.query<{ snapshot: string }>("SELECT pg_export_snapshot() AS snapshot");
    const createdAt = new Date().toISOString();
    await writeEncryptedBackup(filename, key, async (record) => {
      await record({ type: "backup", version: 1, createdAt });
      dump = command(binary, ["--no-owner", "--no-acl", "--format=plain", `--snapshot=${exported.rows[0].snapshot}`], connectionString);
      dump.child.stdin.end();
      for await (const chunk of dump.child.stdout) await record({ type: "sql", data: Buffer.from(chunk).toString("base64") });
      await dump.done; await record({ type: "sql-end" });
      // Read the exact same snapshot as pg_dump, in bounded keyset pages.
      let cursor = ""; let count = 0;
      for (;;) {
        const rows = await snapshot.query<{ id: string; objectKey: string }>('SELECT "id","objectKey" FROM "MediaAsset" WHERE "status"=\'READY\' AND "id"::text>$1 ORDER BY "id"::text LIMIT 100', [cursor]);
        for (const row of rows.rows) {
          if (!storage || !keyPattern.test(row.objectKey)) throw new Error("Ready media requires configured storage.");
          const bytes = await storage.getObject(row.objectKey);
          await record({ type: "object", key: row.objectKey, data: bytes.toString("base64"), sha256: createHash("sha256").update(bytes).digest("hex") });
          count++; cursor = row.id;
        }
        if (rows.rows.length < 100) break;
      }
      await record({ type: "end", count });
    });
  } finally { clearTimeout(timer); dump?.child.kill("SIGKILL"); await snapshot.query("ROLLBACK").catch(() => {}); await snapshot.end().catch(() => {}); }
}
async function readLedger(filename: string, key: Buffer) {
  let generatedAt = 0; let complete = false; const entries: z.infer<typeof tombstone>[] = [];
  await readEncryptedBackup(filename, key, async (raw) => {
    const record = z.object({ type: z.string() }).passthrough().parse(raw);
    if (complete) throw new Error("Invalid deletion ledger.");
    if (!generatedAt && record.type === "ledger" && record.version === 1) { generatedAt = Date.parse(z.string().parse(record.generatedAt)); return; }
    if (!generatedAt) throw new Error("Invalid deletion ledger.");
    if (record.type === "deletion" && entries.length < 1_000_000) entries.push(tombstone.parse(record));
    else if (record.type === "end" && record.count === entries.length) complete = true;
    else throw new Error("Invalid deletion ledger.");
  });
  if (!complete) throw new Error("Incomplete deletion ledger.");
  return { generatedAt, entries };
}
/** Restore is deliberately restricted to a fresh DB/bucket. Keep application traffic stopped throughout. */
export async function restoreBackup(connectionString: string, storage: PrivateObjectStorage | undefined, filename: string, ledgerFile: string, key: Buffer, binary = process.env.PSQL_BIN || "psql") {
  await verifyEncryptedBackup(filename, key);
  const ledger = await readLedger(ledgerFile, key);
  const check = new pg.Client({ connectionString }); await check.connect();
  try {
    const tables = await check.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') LIMIT 1");
    if (tables.rowCount) throw new Error("Restore requires an empty public schema.");
  } finally { await check.end(); }
  if (storage?.assertEmptyNamespace) await storage.assertEmptyNamespace();
  else if (storage && (await storage.listObjects()).objects.length) throw new Error("Restore requires an empty media namespace.");
  const sql = command(binary, ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--quiet", "--file=-"], connectionString);
  sql.child.stdout.resume(); sql.child.stdin.on("error", () => {});
  const created: string[] = []; const seen = new Set<string>(); let header = false; let sqlEnd = false; let complete = false; let count = 0; let commitIssued = false;
  const timer = setTimeout(() => sql.child.kill("SIGKILL"), 30*60_000); timer.unref();
  const write = async (bytes: Buffer | string) => {
    if (sql.child.exitCode !== null || sql.child.stdin.destroyed) throw new Error("Restore process stopped.");
    if (!sql.child.stdin.write(bytes)) await once(sql.child.stdin, "drain");
  };
  try {
    await write("BEGIN;\n");
    await readEncryptedBackup(filename, key, async (raw) => {
      const r = z.object({ type: z.string() }).passthrough().parse(raw);
      if (complete) throw new Error("Data after backup footer.");
      if (!header) {
        const date = Date.parse(z.string().parse(r.createdAt));
        if (r.type !== "backup" || r.version !== 1 || !Number.isFinite(date) || date > ledger.generatedAt || date > Date.now() || Date.now()-date > 30*DAY || ledger.generatedAt > Date.now()) throw new Error("Backup/ledger timestamp outside restoration policy.");
        header = true; return;
      }
      if (r.type === "sql" && !sqlEnd) await write(Buffer.from(z.string().parse(r.data), "base64"));
      else if (r.type === "sql-end" && !sqlEnd) sqlEnd = true;
      else if (r.type === "object" && sqlEnd) {
        const objectKey = z.string().parse(r.key); const match = keyPattern.exec(objectKey);
        if (!storage || !match || seen.has(objectKey)) throw new Error("Invalid restore object.");
        id.parse(match[1]); seen.add(objectKey); count++;
        const bytes = Buffer.from(z.string().parse(r.data), "base64");
        if (bytes.length < 1 || bytes.length > 8*1024*1024 || createHash("sha256").update(bytes).digest("hex") !== r.sha256) throw new Error("Invalid object digest.");
        if (!ledger.entries.some((e) => e.kind === "FAMILY" && e.resourceId === match[1])) {
          // Record before PUT: a lost acknowledgement must still be compensated.
          created.push(objectKey); await storage.putObject(objectKey, bytes);
        }
      } else if (r.type === "end" && sqlEnd && r.count === count) complete = true;
      else throw new Error("Invalid backup sequence.");
    });
    if (!complete) throw new Error("Incomplete backup.");
    await write('\nSET search_path=public,pg_catalog; DELETE FROM "AuthSession"; DELETE FROM "AuthVerification"; DELETE FROM "AuthMailJob"; DELETE FROM "AuthRateLimit"; UPDATE "AuthAccount" SET "password"=NULL,"accessToken"=NULL,"refreshToken"=NULL,"idToken"=NULL;\n');
    // No restored pending reservation may later become READY; cleanup remains durable.
    await write('UPDATE "MediaAsset" SET "status"=\'REJECTED\' WHERE "status"=\'PENDING_VERIFICATION\';\n');
    for (const entry of ledger.entries) {
      const resourceId = id.parse(entry.resourceId); // validated UUID interpolation only
      if (entry.kind === "FAMILY") {
        await write(`UPDATE "Child" SET "avatarAssetId"=NULL WHERE "familyId"='${resourceId}'; DELETE FROM "Family" WHERE "id"='${resourceId}';\n`);
      } else {
        await write(`UPDATE "AuditLog" SET "actorId"=NULL WHERE "actorId"='${resourceId}'; DELETE FROM "User" WHERE "id"='${resourceId}';\n`);
      }
      await write(`INSERT INTO "DeletionTombstone" ("id","kind","resourceId","requestedAt","completedAt") VALUES (gen_random_uuid(),'${entry.kind}','${resourceId}',now(),now()) ON CONFLICT ("kind","resourceId") DO NOTHING;\n`);
    }
    commitIssued = true;
    await write("COMMIT;\n");
    sql.child.stdin.end(); await sql.done;
  } catch (error) {
    sql.child.kill("SIGKILL"); await sql.done.catch(() => {});
    if (commitIssued) throw new Error("Restore commit acknowledgement uncertain; keep the target database and bucket quarantined for operator inspection.");
    if (storage) for (const objectKey of created) await storage.deleteObject(objectKey).catch(() => {});
    throw error;
  } finally { clearTimeout(timer); }
}
