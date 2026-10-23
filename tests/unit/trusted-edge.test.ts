import { describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { trustedEdgeHeaders } from "@/server/auth/edge";
describe("trusted edge",()=>{
 const secret="a".repeat(40);
 it("strips spoofed identities and never trusts raw forwarded IPs",()=>{
  const headers=new Headers({"x-mory-verified-ip":"192.0.2.1","x-forwarded-for":"192.0.2.2","x-mory-client-ip":"192.0.2.3","x-mory-edge-secret":"wrong"});
  const actual=trustedEdgeHeaders(headers,secret);expect(actual.has("x-mory-verified-ip")).toBe(false);expect(actual.has("x-mory-edge-secret")).toBe(false);
 });
 it("accepts one authenticated IP, rejects lists and leaves shared fallback when unconfigured",()=>{
  const h=new Headers({"x-mory-client-ip":"2001:db8::1","x-mory-edge-secret":secret});expect(trustedEdgeHeaders(h,secret).get("x-mory-verified-ip")).toBe("2001:db8::1");
  h.set("x-mory-client-ip","192.0.2.1, 192.0.2.2");expect(trustedEdgeHeaders(h,secret).has("x-mory-verified-ip")).toBe(false);
  h.set("x-mory-client-ip","192.0.2.1");expect(trustedEdgeHeaders(h,"").has("x-mory-verified-ip")).toBe(false);
 });
});
