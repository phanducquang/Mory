import "server-only";
import { z } from "zod";
export const authEmailEnabled = () => process.env.AUTH_EMAIL_ENABLED === "true";
export function readMailQueueConfig(env: Record<string, string | undefined> = process.env) {
  const encoded = env.AUTH_MAIL_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded) || Buffer.from(encoded, "base64").length !== 32)
    throw new Error("Cần AUTH_MAIL_KEY riêng gồm 32 byte mã hóa base64.");
  const from = z.email().max(320).safeParse(env.AUTH_MAIL_FROM);
  if (!from.success) throw new Error("Cần AUTH_MAIL_FROM là một địa chỉ email hợp lệ.");
  return { key: Buffer.from(encoded, "base64"), from: from.data };
}
export function readSmtpConfig(env: Record<string, string | undefined> = process.env) {
  const host = env.SMTP_HOST ?? "";
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error("Cần SMTP_HOST hợp lệ.");
  const port = Number(env.SMTP_PORT ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT không hợp lệ.");
  const secure = env.SMTP_SECURE === "true";
  const local = ["localhost", "127.0.0.1", "::1", "mailcatcher", "mailpit"].includes(host);
  const insecure = env.SMTP_ALLOW_INSECURE_LOCAL === "true";
  if (insecure && !local) throw new Error("SMTP không mã hóa chỉ dành cho dịch vụ local.");
  if (!!env.SMTP_USER !== !!env.SMTP_PASSWORD) throw new Error("Cần cả SMTP_USER và SMTP_PASSWORD.");
  return { host, port, secure, requireTLS: !secure && !insecure, ignoreTLS: insecure,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD! } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 20_000, dnsTimeout: 10_000,
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    disableFileAccess: true, disableUrlAccess: true, logger: false as const, debug: false,
  };
}
