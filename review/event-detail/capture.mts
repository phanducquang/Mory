import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createPhotoEvent } from "../../tests/e2e/photo-fixture";

const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Use before or after");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3107", locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  await createPhotoEvent(page);
  const directory = `review/event-detail/${phase}`;
  await mkdir(directory, { recursive: true });
  const measurements = [];
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
    await page.evaluate(() => scrollTo(0, 0));
    measurements.push({ width, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    if ([390, 1440].includes(width)) {
      await page.screenshot({ path: `${directory}/detail-${width}.png`, animations: "disabled", fullPage: true });
      if (phase === "after") {
        await page.getByRole("button", { name: "Xem ảnh 1 toàn màn hình", exact: true }).click();
        await page.getByRole("dialog").screenshot({ path: `${directory}/viewer-${width}.png`, animations: "disabled" });
        await page.keyboard.press("Escape");
      }
    }
  }
  await writeFile(`${directory}/measurements.json`, JSON.stringify(measurements, null, 2));
  console.log(`${phase}: seven widths captured with synthetic photos`);
} finally { await browser.close(); }
