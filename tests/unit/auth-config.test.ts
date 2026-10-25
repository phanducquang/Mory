import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readAuthConfig } from "@/server/auth/config";

describe("authentication configuration", () => {
  const secret = "x".repeat(48);
  it("requires explicit credentials without logging their values", () => {
    expect(() => readAuthConfig({ BETTER_AUTH_URL: "https://mory.example", BETTER_AUTH_SECRET: "short-private-secret" })).toThrow("32");
    expect(() => readAuthConfig({ BETTER_AUTH_SECRET: secret })).toThrow("BETTER_AUTH_URL");
  });
  it("accepts HTTP/HTTPS origins and selects cookies according to the public scheme", () => {
    expect(readAuthConfig({ BETTER_AUTH_URL: "https://mory.example", BETTER_AUTH_SECRET: secret })).toMatchObject({ secure: true, allowSignup: false });
    expect(readAuthConfig({ BETTER_AUTH_URL: "http://127.0.0.1:3000", BETTER_AUTH_SECRET: secret, AUTH_ALLOW_SIGNUP: "true" })).toMatchObject({ secure: false, allowSignup: true });
    for (const url of ["http://mory.example", "http://10.0.0.5:3000", "http://[::1]:3000"]) {
      expect(readAuthConfig({ BETTER_AUTH_URL: url, BETTER_AUTH_SECRET: secret })).toMatchObject({ baseURL: new URL(url).origin, secure: false, allowSignup: false });
    }
    for (const url of ["ftp://mory.example", "https://mory.example/path", "https://u:p@mory.example", "https://mory.example?q=1", "https://mory.example#fragment"]) {
      expect(() => readAuthConfig({ BETTER_AUTH_URL: url, BETTER_AUTH_SECRET: secret })).toThrow();
    }
  });
});
