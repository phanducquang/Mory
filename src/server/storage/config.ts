import "server-only";

import { ServerNotConfiguredError } from "../services/access";

/** Read only on the server. Do not serialize this object into Client Components. */
export function readStorageConfiguration() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey)
    throw new ServerNotConfiguredError("Private object storage");
  const parsed = new URL(endpoint);
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("Storage endpoint must be an origin.");
  if (
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]", "minio", "rustfs"].includes(parsed.hostname)
    )
  ) {
    throw new Error(
      "Storage endpoint requires HTTPS, except local S3 development.",
    );
  }
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };
}
