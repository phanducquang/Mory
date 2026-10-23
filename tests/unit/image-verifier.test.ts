import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { imageVerifier } from "@/server/storage/image-verifier";
import type { ImageContentType } from "@/server/storage/contracts";
const image = () => sharp({ create: { width: 80, height: 60, channels: 3, background: "pink" } });
describe("private image verification", () => {
  it.each(["jpeg", "png", "webp", "avif"] as const)("decodes %s and persists only WebP", async (format) => {
    const input = await image().toFormat(format).toBuffer();
    const result = await imageVerifier.verify(input, `image/${format}` as ImageContentType, "EVENT");
    expect(await sharp(result.bytes).metadata()).toMatchObject({ format: "webp", width: 80, height: 60 });
  });
  it("removes metadata and applies orientation before encoding", async () => {
    const input = await image().jpeg().withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: "private parent" } }).toBuffer();
    const result = await imageVerifier.verify(input, "image/jpeg", "EVENT");
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata).toMatchObject({ width: 60, height: 80 });
    expect(metadata.exif).toBeUndefined(); expect(metadata.xmp).toBeUndefined(); expect(metadata.orientation).toBeUndefined();
  });
  it("rejects MIME spoofing, SVG and truncated bytes", async () => {
    const png = await image().png().toBuffer();
    await expect(imageVerifier.verify(png, "image/jpeg", "EVENT")).rejects.toThrow();
    await expect(imageVerifier.verify(Buffer.from('<svg width="100" height="100"></svg>'), "image/png", "EVENT")).rejects.toThrow();
    await expect(imageVerifier.verify(png.subarray(0, Math.floor(png.length / 2)), "image/png", "EVENT")).rejects.toThrow();
  });
  it("rejects animated input", async () => {
    const pixels = Buffer.concat([Buffer.alloc(8 * 8 * 3, 0), Buffer.alloc(8 * 8 * 3, 255)]);
    const animated = await sharp(pixels, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    await expect(imageVerifier.verify(animated, "image/webp", "EVENT")).rejects.toThrow();
  });
  it("rejects APNG animation control even when the decoder exposes its first frame", async () => {
    const png = await image().png().toBuffer();
    // Insert the APNG control chunk after IHDR. No APNG payload is ever passed to the decoder.
    const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8); chunk.write("acTL", 4); chunk.writeUInt32BE(2, 8);
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, 16)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 16);
    await expect(imageVerifier.verify(Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]), "image/png", "EVENT")).rejects.toThrow();
  });
  it("caps decoded pixel count before decoding", async () => {
    const large = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "white" } }).png().toBuffer();
    await expect(imageVerifier.verify(large, "image/png", "EVENT")).rejects.toThrow();
  });
  it("bounds avatar dimensions", async () => {
    const input = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "pink" } }).png().toBuffer();
    expect(await imageVerifier.verify(input, "image/png", "AVATAR")).toMatchObject({ width: 512, height: 512 });
  });
});
