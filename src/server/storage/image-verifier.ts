import "server-only";
import sharp from "sharp";
import { InvalidImageError, MAX_IMAGE_BYTES, type ImageVerifier } from "./contracts";

/** Decode before trusting metadata; the only persisted bytes are metadata-free WebP. */
export const imageVerifier: ImageVerifier = {
  async verify(bytes, contentType, purpose) {
    try {
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new InvalidImageError();
      // libvips can expose only the first APNG frame; reject its animation control chunk explicitly.
      if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        for (let offset = 8; offset + 12 <= bytes.length;) {
          const length = bytes.readUInt32BE(offset);
          if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") throw new InvalidImageError();
          if (length > bytes.length - offset - 12) throw new InvalidImageError();
          offset += 12 + length;
        }
      }
      const options = { limitInputPixels: 40_000_000, failOn: "warning" as const };
      const metadata = await sharp(bytes, options).metadata();
      const actual = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heif: "image/avif" }[metadata.format as string];
      if (!actual || actual !== contentType || (metadata.pages ?? 1) !== 1 ||
        !metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000 ||
        (metadata.format === "heif" && (metadata.compression !== "av1" || !bytes.subarray(4, 32).includes(Buffer.from("avif")))))
        throw new InvalidImageError();
      let image = sharp(bytes, options).rotate();
      image = purpose === "AVATAR"
        ? image.resize(512, 512, { fit: "cover", withoutEnlargement: true })
        : image.resize(4096, 4096, { fit: "inside", withoutEnlargement: true });
      const { data, info } = await image.webp({ quality: 90 }).timeout({ seconds: 15 }).toBuffer({ resolveWithObject: true });
      if (!data.length || data.length > MAX_IMAGE_BYTES) throw new InvalidImageError();
      return { bytes: data, width: info.width, height: info.height };
    } catch { throw new InvalidImageError(); }
  },
};
