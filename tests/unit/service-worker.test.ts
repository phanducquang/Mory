import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(new Response("online"));
  const clients = { claim: vi.fn().mockResolvedValue(undefined) };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL,
    Response,
    caches,
    fetch,
    self: {
      location: { origin: "https://mory.example" },
      clients,
      skipWaiting: vi.fn(),
      addEventListener: (type: string, callback: (event: unknown) => void) =>
        listeners.set(type, callback),
    },
  });
  function dispatchFetch(
    path: string,
    options: { mode?: string; headers?: Record<string, string> } = {},
  ) {
    const event = {
      request: {
        method: "GET",
        url: new URL(path, "https://mory.example").toString(),
        mode: options.mode ?? "cors",
        headers: new Headers(options.headers),
      },
      respondWith: vi.fn(),
    };
    listeners.get("fetch")!(event);
    return event;
  }
  return { listeners, caches, cache, fetch, clients, dispatchFetch };
}

describe("PWA privacy policy", () => {
  it("does not intercept API responses, private images, RSC requests or foreign origins", () => {
    const sw = worker();
    for (const path of [
      "/api/events",
      "/_next/image?url=private.jpg",
      "/uploads/family-a/photo.jpg",
      "/timeline?_rsc=123",
      "https://storage.example/private.jpg",
    ]) {
      expect(sw.dispatchFetch(path).respondWith).not.toHaveBeenCalled();
    }
    expect(
      sw.dispatchFetch("/timeline", { headers: { RSC: "1" } }).respondWith,
    ).not.toHaveBeenCalled();
    expect(sw.caches.open).not.toHaveBeenCalled();
  });

  it("loads private documents from network without writing them to a cache", async () => {
    const sw = worker();
    const event = sw.dispatchFetch("/children/child-a", { mode: "navigate" });
    const response = await event.respondWith.mock.calls[0][0];
    expect(await response.text()).toBe("online");
    expect(sw.caches.open).not.toHaveBeenCalled();
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("returns only the static fallback for an offline document request", async () => {
    const sw = worker();
    sw.fetch.mockRejectedValue(new Error("offline"));
    const fallback = new Response("offline fallback");
    sw.caches.match.mockResolvedValue(fallback);
    const event = sw.dispatchFetch("/timeline", { mode: "navigate" });
    expect(await event.respondWith.mock.calls[0][0]).toBe(fallback);
    expect(sw.caches.match).toHaveBeenCalledWith("/offline.html");
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("keeps public assets available from the network when cache storage is full", async () => {
    const sw = worker();
    const response = new Response("application script");
    Object.defineProperty(response, "type", { value: "basic" });
    sw.fetch.mockResolvedValue(response);
    sw.cache.put.mockRejectedValue(new Error("QuotaExceededError"));
    const event = sw.dispatchFetch("/_next/static/chunks/application.js");
    expect(await event.respondWith.mock.calls[0][0]).toBe(response);
  });

  it("removes old Mory cache versions while preserving other applications' caches", async () => {
    const sw = worker();
    sw.caches.keys.mockResolvedValue([
      "mory-public-v0",
      "mory-public-v1",
      "another-app",
    ]);
    const event = { waitUntil: vi.fn() };
    sw.listeners.get("activate")!(event);
    await event.waitUntil.mock.calls[0][0];
    expect(sw.caches.delete).toHaveBeenCalledExactlyOnceWith("mory-public-v0");
    expect(sw.clients.claim).toHaveBeenCalledOnce();
  });
});
