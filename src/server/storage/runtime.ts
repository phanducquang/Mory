import "server-only";
import { createS3Storage } from "./s3";
import { readStorageConfiguration } from "./config";
import { ServerNotConfiguredError } from "../services/access";
import { createPostgresMediaRepository } from "../repositories/postgres-media-repository";
import { createMediaService } from "../services/media-service";
import { imageVerifier } from "./image-verifier";
import { getServerRuntime } from "../runtime";
import type { SessionContext } from "../services/access";

export const mediaEnabled = () => process.env.MORY_MEDIA_ENABLED === "true";
let storage: ReturnType<typeof createS3Storage> | undefined;
export function getMediaStorage() {
  if (!mediaEnabled()) throw new ServerNotConfiguredError("Private media");
  return storage ??= createS3Storage(readStorageConfiguration());
}
export function accountMediaService(account: SessionContext) {
  const { db, authorization } = getServerRuntime();
  return createMediaService({ sessions: { requireSession: async () => account }, authorization,
    media: createPostgresMediaRepository(db, account.userId), storage: getMediaStorage(), verifier: imageVerifier });
}
