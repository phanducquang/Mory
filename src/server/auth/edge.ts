import "server-only";
import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
/** The edge must overwrite these headers and be the only network path to the app. */
export function trustedEdgeHeaders(input: Headers, secret = process.env.AUTH_TRUSTED_EDGE_SECRET) {
  const result = new Headers(input); result.delete("x-mory-verified-ip");
  const supplied = input.get("x-mory-edge-secret") ?? "";
  const address = input.get("x-mory-client-ip") ?? "";
  result.delete("x-mory-edge-secret"); result.delete("x-mory-client-ip");
  if (secret && Buffer.byteLength(secret) >= 32 && Buffer.byteLength(supplied) === Buffer.byteLength(secret) && timingSafeEqual(Buffer.from(secret), Buffer.from(supplied)) && isIP(address)) result.set("x-mory-verified-ip", address);
  return result;
}
