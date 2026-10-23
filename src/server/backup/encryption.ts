import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { open, mkdir, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import path from "node:path";
import { once } from "node:events";
const MAGIC = Buffer.from("MORYBK1\n");
const AAD = Buffer.from("mory-backup:v1");
export function readBackupKey(value = process.env.MORY_BACKUP_KEY) {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, "base64").length !== 32) throw new Error("Cần MORY_BACKUP_KEY riêng gồm 32 byte base64.");
  return Buffer.from(value, "base64");
}
/** No plaintext file; exclusive create prevents overwriting an existing backup. */
export async function writeEncryptedBackup(filename: string, key: Buffer, write: (record: (value: unknown) => Promise<void>) => Promise<void>) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const file = await open(filename, "wx", 0o600); const iv = randomBytes(12);
  let complete = false;
  try {
    await file.writeFile(Buffer.concat([MAGIC, iv]));
    const output = new Writable({ write(chunk: Buffer, _encoding, callback) {
      void file.writeFile(chunk).then(() => callback(), callback);
    } });
    const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(AAD);
    let outputError: unknown;
    const piped = pipeline(cipher, output).catch((error) => { outputError = error; });
    const record = async (value: unknown) => {
      if (outputError) throw outputError;
      const line = JSON.stringify(value) + "\n";
      if (Buffer.byteLength(line) > 16 * 1024 * 1024) throw new Error("Backup record exceeds its limit.");
      if (!cipher.write(line)) await once(cipher, "drain");
    };
    try { await write(record); cipher.end(); await piped; if (outputError) throw outputError; }
    catch (error) { cipher.destroy(); await piped; throw error; }
    await file.writeFile(cipher.getAuthTag());
    await file.sync(); complete = true;
  } finally { await file.close(); if (!complete) await unlink(filename).catch(() => {}); }
}
async function decryptedStream(filename: string, key: Buffer) {
  const file = await open(filename, "r");
  try {
    const stat = await file.stat(); if (stat.size < MAGIC.length + 12 + 16) throw new Error("Invalid backup.");
    const header = Buffer.alloc(MAGIC.length + 12); await file.read(header, 0, header.length, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Invalid backup version.");
    const tag = Buffer.alloc(16); await file.read(tag, 0, 16, stat.size - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(MAGIC.length)); decipher.setAAD(AAD); decipher.setAuthTag(tag);
    return { source: createReadStream(filename, { start: header.length, end: stat.size - 17 }), decipher };
  } finally { await file.close(); }
}
export async function verifyEncryptedBackup(filename: string, key: Buffer) {
  const { source, decipher } = await decryptedStream(filename, key);
  await pipeline(source, decipher, new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
}
/** Bounded JSONL parsing, after a separate authentication pass and before SQL is applied. */
export async function readEncryptedBackup(filename: string, key: Buffer, consume: (record: unknown) => Promise<void>) {
  await verifyEncryptedBackup(filename, key);
  const { source, decipher } = await decryptedStream(filename, key);
  let buffered = Buffer.alloc(0);
  // Async writable honors backpressure while applying each record.
  const sink = new Writable({ write(chunk: Buffer, _encoding, callback) {
    void (async () => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length > 16 * 1024 * 1024) throw new Error("Backup record exceeds its limit.");
      let end: number;
      while ((end = buffered.indexOf(10)) >= 0) {
        const line = buffered.subarray(0, end); buffered = buffered.subarray(end + 1);
        if (line.length) await consume(JSON.parse(line.toString("utf8")));
      }
    })().then(() => callback(), callback);
  } });
  await pipeline(source, decipher, sink);
  if (buffered.length) throw new Error("Truncated backup record.");
}
