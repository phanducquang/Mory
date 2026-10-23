import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { unavailableSessionProvider } from "@/server/services/access";
import { createJourneyService } from "@/server/services/journey-service";
import { createMediaService } from "@/server/services/media-service";
import { MAX_IMAGE_BYTES } from "@/server/storage/contracts";
const session = { userId: "parent-a", familyId: "family-a" };
const eventId = "10000000-0000-4000-8000-000000000001";
const assetId = "10000000-0000-4000-8000-000000000002";
const payload = Buffer.from("image bytes");
function mediaDependencies() {
  return {
    sessions: { requireSession: vi.fn().mockResolvedValue(session) },
    authorization: { requireFamilyAccess: vi.fn().mockResolvedValue(undefined), requireChildAccess: vi.fn().mockResolvedValue(undefined), requireEventAccess: vi.fn().mockResolvedValue({ childId: "child-a" }) },
    media: { consumeBudget: vi.fn().mockResolvedValue(undefined), reservePending: vi.fn().mockResolvedValue(undefined), findById: vi.fn().mockResolvedValue(null), markReady: vi.fn().mockResolvedValue(undefined), markRejected: vi.fn().mockResolvedValue(true), remove: vi.fn(), queueCleanup: vi.fn().mockResolvedValue(undefined) },
    storage: { putObject: vi.fn().mockResolvedValue(undefined), getObject: vi.fn().mockResolvedValue(payload), deleteObject: vi.fn(), listObjects: vi.fn() },
    verifier: { verify: vi.fn().mockResolvedValue({ bytes: payload, width: 10, height: 10 }) },
  };
}
const upload = (deps: ReturnType<typeof mediaDependencies>, read = vi.fn().mockResolvedValue(payload)) => createMediaService(deps).upload("EVENT", eventId, "image/jpeg", payload.length, read);
describe("server access boundaries", () => {
  it("queues failed PUTs without deleting inline", async () => {
    const d = mediaDependencies(); d.storage.putObject.mockRejectedValue(new Error("Unavailable"));
    d.media.findById.mockResolvedValue({ status: "PENDING_VERIFICATION", expiresAt: new Date(Date.now()+300_000), eventId, childId: "child-a" });
    await expect(upload(d)).rejects.toThrow("Unavailable");
    expect(d.media.markRejected).toHaveBeenCalledWith(session.familyId, expect.any(String));
    expect(d.media.queueCleanup).toHaveBeenCalled(); expect(d.storage.deleteObject).not.toHaveBeenCalled();
  });
  it("preserves a READY object after an uncertain commit acknowledgement", async () => {
    const d = mediaDependencies(); d.media.markReady.mockRejectedValue(new Error("Lost ack"));
    d.media.findById.mockResolvedValueOnce({ status: "PENDING_VERIFICATION", expiresAt: new Date(Date.now()+300_000), eventId, childId: "child-a" }).mockResolvedValue({ status: "READY" });
    await expect(upload(d)).resolves.toMatchObject({ url: expect.stringMatching(/^\/api\/media\//) });
    expect(d.media.markRejected).not.toHaveBeenCalled(); expect(d.media.queueCleanup).not.toHaveBeenCalled();
  });
  it("checks permission before reading any image bytes", async () => {
    const d = mediaDependencies(); const read = vi.fn(); d.authorization.requireEventAccess.mockRejectedValue(new Error("Forbidden"));
    await expect(upload(d, read)).rejects.toThrow("Forbidden");
    expect(read).not.toHaveBeenCalled(); expect(d.media.reservePending).not.toHaveBeenCalled();
  });
  it("checks quota before decoding or writing", async () => {
    const d = mediaDependencies(); const read = vi.fn(); d.media.reservePending.mockRejectedValue(new Error("Quota"));
    await expect(upload(d, read)).rejects.toThrow("Quota");
    expect(read).not.toHaveBeenCalled(); expect(d.storage.putObject).not.toHaveBeenCalled();
  });
  it("rejects oversized files and unsupported MIME types before storage", async () => {
    const d = mediaDependencies(); const svc = createMediaService(d);
    await expect(svc.upload("EVENT", eventId, "image/jpeg", MAX_IMAGE_BYTES + 1, vi.fn())).rejects.toThrow();
    await expect(svc.upload("EVENT", eventId, "image/svg+xml", 5, vi.fn())).rejects.toThrow();
    expect(d.storage.putObject).not.toHaveBeenCalled();
  });
  it("rejects incomplete bodies and never commits unverified input", async () => {
    const d = mediaDependencies(); await expect(upload(d, vi.fn().mockResolvedValue(Buffer.from("bad")))).rejects.toThrow();
    expect(d.verifier.verify).not.toHaveBeenCalled(); expect(d.media.markReady).not.toHaveBeenCalled(); expect(d.media.queueCleanup).toHaveBeenCalled();
  });
  it("does not expose an image from another family", async () => {
    const d = mediaDependencies(); d.media.findById.mockResolvedValue({ familyId: "other", status: "READY" });
    await expect(createMediaService(d).read(assetId)).rejects.toThrow(); expect(d.storage.getObject).not.toHaveBeenCalled();
  });
  it("never reads pending objects", async () => {
    const d = mediaDependencies(); d.media.findById.mockResolvedValue({ familyId: session.familyId, status: "PENDING_VERIFICATION" });
    await expect(createMediaService(d).read(assetId)).rejects.toThrow(); expect(d.storage.getObject).not.toHaveBeenCalled();
  });
  it("rechecks current family membership before listing profiles", async () => {
    const d = mediaDependencies(); const repository = { listChildren: vi.fn(), findChild: vi.fn(), listEvents: vi.fn(), findEvent: vi.fn(), createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn() };
    d.authorization.requireFamilyAccess.mockRejectedValue(new Error("Revoked"));
    await expect(createJourneyService({ ...d, repository }).listChildren()).rejects.toThrow("Revoked"); expect(repository.listChildren).not.toHaveBeenCalled();
  });
  it("fails closed without authentication", async () => { await expect(unavailableSessionProvider.requireSession()).rejects.toThrow("Authentication is not configured"); });
  it("scopes event writes to the session family and keeps event date separate from audit time", async () => {
    const repository = {
      listChildren: vi.fn(),
      findChild: vi.fn(),
      listEvents: vi.fn(),
      findEvent: vi.fn(),
      createEvent: vi
        .fn()
        .mockImplementation(async (_familyId, event) => event),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn(),
    };
    const service = createJourneyService({
      sessions: { requireSession: async () => session },
      authorization: {
        requireFamilyAccess: vi.fn().mockResolvedValue(undefined),
      requireChildAccess: vi.fn().mockResolvedValue(undefined),
        requireEventAccess: vi.fn(),
      },
      repository,
    });
    const event = await service.createEvent("child-a", {
      title: "Kỷ niệm đầu tiên",
      date: "2020-01-01",
      type: "memory",
      description: "",
      reminder: false,
    });
    expect(repository.createEvent).toHaveBeenCalledWith(
      "family-a",
      expect.objectContaining({ childId: "child-a", date: "2020-01-01" }),
    );
    expect(event.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.createdAt).toBe(event.updatedAt);
    expect(event.date).toBe("2020-01-01");
  });
});
