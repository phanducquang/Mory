import { expect, test } from "@playwright/test";
test.describe("production PWA", () => {
  test.skip(
    process.env.PLAYWRIGHT_PRODUCTION !== "1",
    "Service worker is intentionally production only",
  );
  test("manifest, private cache policy and offline document fallback", async ({
    page,
    context,
    request,
  }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      short_name: "Mory",
      display: "standalone",
      lang: "vi",
      start_url: "/home",
    });
    expect(
      manifest.icons.some(
        (icon: { purpose?: string }) => icon.purpose === "maskable",
      ),
    ).toBe(true);
    for (const icon of manifest.icons)
      expect((await request.get(icon.src)).ok()).toBe(true);
    await page.goto("/home");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await page.goto("/timeline");
    await expect(
      page.getByRole("heading", { name: /Hành trình của/ }),
    ).toBeVisible();
    await page.evaluate(async () => {
      await fetch("/home");
      await fetch("/images/baby.jpg");
      await fetch("/timeline?_rsc=privacy-check", { headers: { RSC: "1" } });
    });
    const keys = await page.evaluate(async () => {
      const names = await caches.keys();
      return (
        await Promise.all(
          names.map(async (name) =>
            (await (await caches.open(name)).keys()).map(
              (r) => new URL(r.url).pathname,
            ),
          ),
        )
      ).flat();
    });
    expect(keys).toContain("/offline.html");
    expect(keys).not.toContain("/home");
    expect(keys).not.toContain("/timeline");
    expect(keys).not.toContain("/images/baby.jpg");
    await context.setOffline(true);
    await page.goto("/children");
    await expect(
      page.getByRole("heading", { name: "Mình kết nối lại nhé." }),
    ).toBeVisible();
    await context.setOffline(false);
  });
});
