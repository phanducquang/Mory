import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetBucketVersioningCommand, ListObjectVersionsCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { readStorageConfiguration } from "./config";
import type { PrivateObjectStorage } from "./contracts";

export type StorageCheckStep = "list" | "versions" | "versioning" | "put" | "conditional-put" | "read" | "private-access" | "version-history" | "cleanup";

/** Read-only by default. Probe writes/deletes only its own random key in a dedicated test bucket. */
export async function checkStorageCompatibility(
  config: ReturnType<typeof readStorageConfiguration>, client: S3Client, storage: PrivateObjectStorage,
  options: { probe?: boolean; onStep?: (step: StorageCheckStep) => void; fetch?: typeof fetch } = {},
) {
  const timeout = () => ({ abortSignal: AbortSignal.timeout(20_000) });
  let current: StorageCheckStep = "list";
  const step = (value: StorageCheckStep) => { current = value; options.onStep?.(value); };
  step("list");
  await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: "families/", MaxKeys: 1 }), timeout());
  step("versions");
  await client.send(new ListObjectVersionsCommand({ Bucket: config.bucket, Prefix: "families/", MaxKeys: 1 }), timeout());
  if (!options.probe) return { mode: "read-only", list: true, versions: true } as const;

  // Do not enable/suspend versioning or alter bucket policy on behalf of the operator.
  step("versioning");
  const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: config.bucket }), timeout());
  if (versioning.Status !== "Enabled") throw new Error("Probe requires a separate version-enabled test bucket.");
  const key = `families/${randomUUID()}/children/${randomUUID()}/avatars/${randomUUID()}.webp`;
  const bytes = Buffer.from("mory-storage-compatibility-probe");
  try {
    step("put"); await storage.putObject(key, bytes);
    step("conditional-put");
    let rejected = false;
    try { await storage.putObject(key, Buffer.from("must-not-overwrite")); }
    catch (error) { rejected = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412; if (!rejected) throw error; }
    if (!rejected) throw new Error("Provider did not enforce If-None-Match.");
    step("read");
    if (!(await storage.getObject(key)).equals(bytes)) throw new Error("Object round trip differs.");
    step("private-access");
    const url = new URL(config.endpoint);
    if (config.forcePathStyle) url.pathname = `/${config.bucket}/${key}`;
    else { url.hostname = `${config.bucket}.${url.hostname}`; url.pathname = `/${key}`; }
    const anonymous = await (options.fetch ?? fetch)(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
    await anonymous.body?.cancel();
    if (![403, 404].includes(anonymous.status)) throw new Error("Anonymous object access must be denied.");
    step("version-history");
    // Overwrite/delete only this probe's key to exercise history and a delete marker.
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentType: "image/webp" }), timeout());
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), timeout());
    const history = await client.send(new ListObjectVersionsCommand({ Bucket: config.bucket, Prefix: key, MaxKeys: 1000 }), timeout());
    if ((history.Versions?.filter(v => v.Key === key).length ?? 0) < 2 || !history.DeleteMarkers?.some(v => v.Key === key)) throw new Error("Provider did not retain object versions and delete marker.");
  } finally {
    const previous = current;
    step("cleanup");
    // Attempt cleanup even when a timed-out PUT may have committed remotely.
    await storage.deleteObject(key);
    const remaining = await client.send(new ListObjectVersionsCommand({ Bucket: config.bucket, Prefix: key, MaxKeys: 1000 }), timeout());
    if ([...(remaining.Versions ?? []), ...(remaining.DeleteMarkers ?? [])].some(v => v.Key === key)) throw new Error("Probe cleanup left object history behind.");
    step(previous);
  }
  return { mode: "probe", list: true, versions: true, conditionalPut: true, privateAccess: true, roundTrip: true, versionCleanup: true } as const;
}
