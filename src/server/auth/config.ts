import "server-only";
import { z } from "zod";
import { readHttpOrigin } from "../../../scripts/config-origin.mjs";

export function serverDataEnabled() {
  const mode = process.env.MORY_DATA_MODE ?? "demo";
  if (mode !== "demo" && mode !== "server") throw new Error("MORY_DATA_MODE phải là demo hoặc server.");
  return mode === "server";
}
export interface AuthConfig { secret: string; baseURL: string; secure: boolean; allowSignup: boolean; emailEnabled?: boolean }
export function readAuthConfig(env: Record<string, string | undefined> = process.env) {
  const secret = z.string().min(32).safeParse(env.BETTER_AUTH_SECRET);
  const baseURL = readAppOrigin(env.BETTER_AUTH_URL);
  if (!secret.success) throw new Error("Cần BETTER_AUTH_SECRET riêng có ít nhất 32 ký tự.");
  return { secret: secret.data, baseURL: baseURL.origin, secure: baseURL.protocol === "https:", allowSignup: env.AUTH_ALLOW_SIGNUP === "true", emailEnabled: env.AUTH_EMAIL_ENABLED === "true" };
}

export function readAppOrigin(value: string | undefined) {
  return readHttpOrigin(value, "BETTER_AUTH_URL");
}
