import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
export const mailPayloadSchema = z.object({ to: z.email().max(320), from: z.email().max(320),
  subject: z.string().max(160), text: z.string().max(8000) }).strict();
export type MailPayload = z.infer<typeof mailPayloadSchema>;
export function sealMail(payload: MailPayload, key: Buffer, purpose: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`mory-auth-mail:v1:${purpose}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(mailPayloadSchema.parse(payload)), "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}
export function openMail(payload: string, key: Buffer, purpose: string): MailPayload {
  if (!payload.startsWith("v1.") || payload.length > 16_000) throw new Error("Invalid mail payload.");
  const bytes = Buffer.from(payload.slice(3), "base64");
  if (bytes.length < 29) throw new Error("Invalid mail payload.");
  const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(`mory-auth-mail:v1:${purpose}`)); cipher.setAuthTag(bytes.subarray(12, 28));
  return mailPayloadSchema.parse(JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8")));
}
