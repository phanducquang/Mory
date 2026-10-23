import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, ListObjectVersionsCommand } from "@aws-sdk/client-s3";
import { MAX_IMAGE_BYTES, type PrivateObjectStorage } from "./contracts";
import type { readStorageConfiguration } from "./config";

export function createS3Storage(config: ReturnType<typeof readStorageConfiguration>): PrivateObjectStorage {
  const client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2 });
  const timeout = () => ({ abortSignal: AbortSignal.timeout(20_000) });
  return {
    async assertEmptyNamespace() {
      const versions = await client.send(new ListObjectVersionsCommand({ Bucket: config.bucket, Prefix: "families/", MaxKeys: 1 }), timeout());
      if (versions.Versions?.length || versions.DeleteMarkers?.length) throw new Error("Restore requires an empty media namespace including versions.");
    },
    async putObject(Key, Body) {
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key, Body, ContentType: "image/webp",
        CacheControl: "private, no-store", IfNoneMatch: "*" }), timeout());
    },
    async getObject(Key) {
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key }), timeout());
      if (!result.Body) throw new Error("Missing image.");
      const body = result.Body as typeof result.Body & { destroy?: () => void };
      try {
        if (!result.ContentLength || result.ContentLength > MAX_IMAGE_BYTES) throw new Error("Invalid stored image size.");
        const chunks: Buffer[] = []; let total = 0;
        for await (const chunk of body as AsyncIterable<Uint8Array>) {
          total += chunk.length;
          if (total > MAX_IMAGE_BYTES) throw new Error("Invalid stored image size.");
          chunks.push(Buffer.from(chunk));
        }
        if (total !== result.ContentLength) throw new Error("Incomplete image.");
        return Buffer.concat(chunks, total);
      } finally { body.destroy?.(); }
    },
    async deleteObject(Key) {
      // Remove historical bytes too. Fail closed when ListBucketVersions/DeleteObjectVersion is denied.
      // Start from the beginning after each bounded page, since deleted version markers are no longer cursors.
      const deadline = Date.now()+70_000;
      for (let page = 0; page < 100; page++) {
        const versions = await client.send(new ListObjectVersionsCommand({ Bucket: config.bucket, Prefix: Key, MaxKeys: 200 }), timeout());
        const exact = [...(versions.Versions ?? []), ...(versions.DeleteMarkers ?? [])].filter((v) => v.Key === Key);
        if (!exact.length) return;
        for (const version of exact) {
          if (Date.now()>deadline) throw new Error("Version cleanup needs another pass.");
          await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key, VersionId: version.VersionId }), timeout());
        }
      }
      throw new Error("Version cleanup needs another pass.");
    },
    async listObjects(cursor, prefix = "families/") {
      if (prefix !== "families/" && !/^families\/[0-9a-f-]{36}\/$/i.test(prefix)) throw new Error("Invalid media prefix.");
      const result = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, MaxKeys: 200, ContinuationToken: cursor }), timeout());
      return { objects: (result.Contents ?? []).flatMap((o) => o.Key && o.LastModified ? [{ key: o.Key, modified: o.LastModified }] : []),
        cursor: result.IsTruncated ? result.NextContinuationToken : undefined };
    },
  };
}
