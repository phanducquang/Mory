import "server-only";

import { ServerNotConfiguredError } from "../services/access";
import { readHttpOrigin } from "../../../scripts/config-origin.mjs";

/** Read only on the server. Do not serialize this object into Client Components. */
export function readStorageConfiguration() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey)
    throw new ServerNotConfiguredError("Private object storage");
  readHttpOrigin(endpoint, "S3_ENDPOINT");
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };
}
