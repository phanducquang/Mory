import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { writeEncryptedBackup, readEncryptedBackup, verifyEncryptedBackup, readBackupKey } from "@/server/backup/encryption";
describe("encrypted streaming backups", () => {
  it("round-trips bounded records without plaintext files and rejects tamper/wrong keys", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mory-backup-unit-")); const filename = path.join(dir, "snapshot.enc"); const key = randomBytes(32);
    try {
      const records = [{ kind: "header", version: 1 }, ...Array.from({ length: 100 }, (_, i) => ({ kind: "data", value: `PRIVATE_FAMILY_INFORMATION_${i}` }))];
      await writeEncryptedBackup(filename, key, async (record) => { for (const value of records) await record(value); });
      expect((await stat(filename)).mode & 0o777).toBe(0o600);
      const raw = await readFile(filename); expect(raw.includes(Buffer.from("PRIVATE_FAMILY_INFORMATION"))).toBe(false);
      const restored: unknown[] = []; await readEncryptedBackup(filename, key, async (r) => { restored.push(r); }); expect(restored).toEqual(records);
      await expect(verifyEncryptedBackup(filename, randomBytes(32))).rejects.toThrow();
      await expect(writeEncryptedBackup(filename, key, async () => {})).rejects.toThrow();
      raw[35] ^= 1; await writeFile(filename, raw); await expect(verifyEncryptedBackup(filename, key)).rejects.toThrow();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("removes failed partial writes and requires an independent valid key", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mory-backup-unit-")); const filename = path.join(dir, "snapshot.enc");
    try {
      await expect(writeEncryptedBackup(filename, randomBytes(32), async () => { throw new Error("Producer failed"); })).rejects.toThrow("Producer failed");
      await expect(stat(filename)).rejects.toThrow(); expect(() => readBackupKey("short")).toThrow();
      expect(readBackupKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
