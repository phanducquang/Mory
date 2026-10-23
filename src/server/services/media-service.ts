import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthorizationService, SessionProvider } from "./access";
import { ResourceNotFoundError } from "../db/errors";
import { IMAGE_CONTENT_TYPES, MAX_EVENT_IMAGES, MAX_IMAGE_BYTES, InvalidImageError,
  type MediaRepository, type PrivateObjectStorage, type ImageVerifier, type MediaPurpose, type MediaAssetRecord } from "../storage/contracts";

interface Dependencies {
  sessions: SessionProvider; authorization: AuthorizationService; media: MediaRepository;
  storage: PrivateObjectStorage; verifier: ImageVerifier;
}
export function createMediaService({ sessions, authorization, media, storage, verifier }: Dependencies) {
  async function authorize(session: Awaited<ReturnType<SessionProvider["requireSession"]>>, asset: MediaAssetRecord, permission: "read" | "write") {
    if (asset.eventId) await authorization.requireEventAccess(session, asset.eventId, permission);
    else await authorization.requireChildAccess(session, asset.childId, permission);
  }
  return {
    /** readBytes is deferred until authentication, target authorization, budget and quota pass. */
    async upload(purpose: MediaPurpose, targetId: string, contentType: string, byteLength: number, readBytes: () => Promise<Buffer>) {
      const session = await sessions.requireSession();
      z.uuid().parse(targetId);
      const input = z.object({ contentType: z.enum(IMAGE_CONTENT_TYPES), byteLength: z.number().int().positive().max(MAX_IMAGE_BYTES) }).safeParse({ contentType, byteLength });
      if (!input.success) throw new InvalidImageError();
      const childId = purpose === "EVENT"
        ? (await authorization.requireEventAccess(session, targetId, "write")).childId
        : (await authorization.requireChildAccess(session, targetId, "write"), targetId);
      await media.consumeBudget(session.userId);
      const id = randomUUID();
      const objectKey = purpose === "EVENT" ? `families/${session.familyId}/events/${targetId}/${id}` : `families/${session.familyId}/children/${childId}/avatars/${id}`;
      const asset: MediaAssetRecord = { id, familyId: session.familyId, childId, eventId: purpose === "EVENT" ? targetId : null,
        purpose, objectKey, contentType, byteLength, status: "PENDING_VERIFICATION", expiresAt: new Date(Date.now() + 300_000) };
      await media.reservePending(asset, MAX_EVENT_IMAGES);
      try {
        const bytes = await readBytes();
        if (bytes.length !== byteLength) throw new InvalidImageError();
        const verified = await verifier.verify(bytes, input.data.contentType, purpose);
        const pending = await media.findById(session.familyId, id);
        if (!pending || pending.status !== "PENDING_VERIFICATION" || pending.expiresAt <= new Date()) throw new ResourceNotFoundError();
        await authorize(session, pending, "write");
        await storage.putObject(objectKey, verified.bytes);
        await media.markReady(session.familyId, id, { width: verified.width, height: verified.height, byteLength: verified.bytes.length });
        return { id, url: `/api/media/${id}` };
      } catch (error) {
        // A lost transaction acknowledgement must not delete an already accepted image.
        const current = await media.findById(session.familyId, id);
        if (current?.status === "READY") return { id, url: `/api/media/${id}` };
        await media.markRejected(session.familyId, id);
        // If the event was deleted while PUT was in flight, its cleanup job may already have run.
        await media.queueCleanup(session.familyId, objectKey, asset.expiresAt);
        throw error;
      }
    },
    async read(assetId: string) {
      const session = await sessions.requireSession();
      const asset = await media.findById(session.familyId, z.uuid().parse(assetId));
      if (!asset || asset.familyId !== session.familyId || asset.status !== "READY") throw new ResourceNotFoundError();
      await authorize(session, asset, "read");
      return storage.getObject(asset.objectKey);
    },
    async remove(assetId: string) {
      const session = await sessions.requireSession();
      const asset = await media.findById(session.familyId, z.uuid().parse(assetId));
      if (!asset || asset.familyId !== session.familyId) throw new ResourceNotFoundError();
      await authorize(session, asset, "write");
      await media.remove(session.familyId, asset.id);
    },
  };
}
