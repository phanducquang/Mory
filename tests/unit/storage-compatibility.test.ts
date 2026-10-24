import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteObjectCommand, GetBucketVersioningCommand, ListObjectVersionsCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
vi.mock("server-only", () => ({}));
import { readStorageConfiguration } from "@/server/storage/config";
import { checkStorageCompatibility } from "@/server/storage/compatibility";
import type { PrivateObjectStorage } from "@/server/storage/contracts";

const config = { endpoint: "https://s3.example.test", region: "us-east-1", bucket: "private-test", accessKeyId: "test", secretAccessKey: "test", forcePathStyle: true };
afterEach(() => vi.unstubAllEnvs());

describe("S3-compatible storage configuration", () => {
  it.each(["http://rustfs:9000", "http://localhost:9000", "http://127.0.0.1:9000", "http://[::1]:9000", "https://s3.example.test"])("accepts %s without changing the S3 contract", endpoint => {
    for (const [name, value] of Object.entries({ S3_ENDPOINT: endpoint, S3_REGION: "us-east-1", S3_BUCKET: "private-test", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_FORCE_PATH_STYLE: "true" })) vi.stubEnv(name, value);
    expect(readStorageConfiguration()).toEqual({ ...config, endpoint });
  });
  it.each(["http://s3.example.test", "https://s3.example.test/console", "https://user:password@s3.example.test", "https://s3.example.test?token=secret"])("rejects non-TLS remote endpoints or non-origin configuration: %s", endpoint => {
    for (const [name, value] of Object.entries({ S3_ENDPOINT: endpoint, S3_REGION: "us-east-1", S3_BUCKET: "private-test", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test" })) vi.stubEnv(name, value);
    expect(() => readStorageConfiguration()).toThrow();
  });
});

function fixture(options: { conditional?: boolean; public?: boolean; versioning?: string; history?: boolean; cleanup?: boolean } = {}) {
  let key = "", cleaned = false;
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof GetBucketVersioningCommand) return { Status: options.versioning ?? "Enabled" };
    if (command instanceof ListObjectVersionsCommand && command.input.Prefix === key && key) return cleaned && options.cleanup !== false ? {} : options.history === false ? {} : { Versions: [{ Key: key, VersionId: "1" }, { Key: key, VersionId: "2" }], DeleteMarkers: [{ Key: key, VersionId: "marker" }] };
    return {};
  });
  const storage: PrivateObjectStorage = {
    putObject: vi.fn(async (value: string) => { if (key && options.conditional !== false) throw { $metadata: { httpStatusCode: 412 } }; key = value; }),
    getObject: vi.fn(async () => Buffer.from("mory-storage-compatibility-probe")),
    deleteObject: vi.fn(async () => { cleaned = true; }),
    listObjects: vi.fn(async () => ({ objects: [] })),
  };
  const anonymous = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: options.public ? 200 : 403 }));
  return { send, client: { send } as unknown as S3Client, storage, anonymous, key: () => key };
}

describe("storage compatibility checks", () => {
  it("defaults to read-only listing/version checks without writing objects or changing a bucket", async () => {
    const f = fixture();
    await expect(checkStorageCompatibility(config, f.client, f.storage)).resolves.toEqual({ mode: "read-only", list: true, versions: true });
    expect(f.send.mock.calls.map(([command]) => (command as object).constructor)).toEqual([ListObjectsV2Command, ListObjectVersionsCommand]);
    expect(f.storage.putObject).not.toHaveBeenCalled(); expect(f.storage.deleteObject).not.toHaveBeenCalled();
  });
  it("checks conditional writes, private reads, version history and exact-key physical cleanup", async () => {
    const f = fixture();
    await expect(checkStorageCompatibility(config, f.client, f.storage, { probe: true, fetch: f.anonymous })).resolves.toMatchObject({ mode: "probe", versionCleanup: true, privateAccess: true });
    expect(f.key()).toMatch(/^families\/[0-9a-f-]{36}\/children\/[0-9a-f-]{36}\/avatars\/[0-9a-f-]{36}\.webp$/);
    expect(f.storage.deleteObject).toHaveBeenCalledExactlyOnceWith(f.key());
    const commands = f.send.mock.calls.map(([command]) => command);
    expect(commands.some(command => command instanceof PutObjectCommand && command.input.Key === f.key())).toBe(true);
    expect(commands.some(command => command instanceof DeleteObjectCommand && command.input.Key === f.key())).toBe(true);
    expect(f.anonymous.mock.calls[0][0]?.toString()).toBe(`https://s3.example.test/private-test/${f.key()}`);
  });
  it("requires an already-versioned test bucket and never enables versioning itself", async () => {
    const f = fixture({ versioning: "Suspended" });
    await expect(checkStorageCompatibility(config, f.client, f.storage, { probe: true })).rejects.toThrow("version-enabled");
    expect(f.storage.putObject).not.toHaveBeenCalled();
  });
  it.each([
    [{ conditional: false }, "If-None-Match"],
    [{ public: true }, "Anonymous"],
    [{ history: false }, "versions"],
    [{ cleanup: false }, "cleanup"],
  ] as const)("fails closed and cleans up its own probe when a provider violates %j", async (options, message) => {
    const f = fixture(options);
    await expect(checkStorageCompatibility(config, f.client, f.storage, { probe: true, fetch: f.anonymous })).rejects.toThrow(message);
    expect(f.storage.deleteObject).toHaveBeenCalledExactlyOnceWith(f.key());
  });
  it("attempts exact-key cleanup if a failed PUT may have committed remotely", async () => {
    const f = fixture();
    vi.mocked(f.storage.putObject).mockRejectedValueOnce(new Error("timeout"));
    await expect(checkStorageCompatibility(config, f.client, f.storage, { probe: true })).rejects.toThrow("timeout");
    expect(f.storage.deleteObject).toHaveBeenCalledOnce();
    expect(vi.mocked(f.storage.deleteObject).mock.calls[0][0]).toMatch(/^families\//);
  });
});
