import "server-only";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_EVENT_IMAGES = 12;
export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];
export type MediaPurpose = "EVENT" | "AVATAR";
export interface VerifiedImage { bytes: Buffer; width: number; height: number }
export interface PrivateObjectStorage {
  assertEmptyNamespace?(): Promise<void>;
  putObject(key: string, bytes: Buffer): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  listObjects(cursor?: string, prefix?: string): Promise<{ objects: { key: string; modified: Date }[]; cursor?: string }>;
}
export interface ImageVerifier {
  verify(bytes: Buffer, contentType: ImageContentType, purpose: MediaPurpose): Promise<VerifiedImage>;
}
export interface MediaAssetRecord {
  id: string; familyId: string; childId: string; eventId: string | null; purpose: MediaPurpose;
  objectKey: string; contentType: string; byteLength: number;
  status: "PENDING_VERIFICATION" | "READY" | "REJECTED"; expiresAt: Date;
}
export interface MediaRepository {
  reservePending(asset: MediaAssetRecord, maximumForEvent: number): Promise<void>;
  consumeBudget(userId: string): Promise<void>;
  findById(familyId: string, id: string): Promise<MediaAssetRecord | null>;
  markReady(familyId: string, id: string, verified: { width: number; height: number; byteLength: number }): Promise<void>;
  markRejected(familyId: string, id: string): Promise<boolean>;
  remove(familyId: string, id: string): Promise<void>;
  queueCleanup(familyId: string, objectKey: string, notBefore?: Date): Promise<void>;
}
export class InvalidImageError extends Error {
  constructor() { super("Ảnh không hợp lệ. Chọn JPEG, PNG, WebP hoặc AVIF tĩnh, tối đa 8 MB và 40 triệu điểm ảnh."); }
}
export class UploadLimitError extends Error {
  constructor() { super("Có quá nhiều lượt tải ảnh. Vui lòng thử lại sau một phút."); }
}
