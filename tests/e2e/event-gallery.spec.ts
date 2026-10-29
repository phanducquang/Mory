import { devices, expect, test } from "@playwright/test";
import { createPhotoEvent } from "./photo-fixture";

test("photos slide, open fully, zoom and restore keyboard focus to the displayed photo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createPhotoEvent(page);
  const gallery = page.getByRole("region", { name: "Ảnh của sự kiện", exact: true });
  await expect(gallery.locator(".photo-position")).toHaveText("Ảnh 1 / 3");
  await gallery.getByRole("button", { name: "Ảnh tiếp theo", exact: true }).click();
  await expect(gallery.getByRole("button", { name: "Chọn ảnh 2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await gallery.getByRole("button", { name: "Xem ảnh 2 toàn màn hình", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(gallery.getByRole("button", { name: "Xem ảnh 3 toàn màn hình", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const viewer = page.getByRole("dialog");
  await expect(viewer).toHaveAccessibleName("Ảnh 3 / 3");
  await page.keyboard.press("ArrowLeft");
  await expect(viewer).toHaveAccessibleName("Ảnh 2 / 3");
  await viewer.getByRole("button", { name: "Phóng to", exact: true }).click();
  const zoom = viewer.locator(".photo-viewer-stage");
  await expect.poll(() => zoom.evaluate(element => element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight)).toBe(true);
  await zoom.evaluate(element => element.scrollTo({ top: 180, left: 180 }));
  expect(await zoom.evaluate(element => element.scrollTop > 0 || element.scrollLeft > 0)).toBe(true);
  await viewer.getByRole("button", { name: "Thu nhỏ", exact: true }).click();
  await viewer.getByRole("button", { name: "Ảnh tiếp theo", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(viewer.getByRole("button", { name: "Đóng hộp thoại", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(viewer).not.toBeVisible();
  await expect(gallery.getByRole("button", { name: "Xem ảnh 2 toàn màn hình", exact: true })).toBeFocused();
  await gallery.getByRole("button", { name: "Chọn ảnh 1", exact: true }).click();
  await expect(gallery.locator(".photo-position")).toHaveText("Ảnh 1 / 3");
});

test("gallery and viewer fit seven widths, landscape and enlarged text without cropping the page", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createPhotoEvent(page);
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Xem ảnh 1 toàn màn hình", exact: true }).click();
    const viewer = page.getByRole("dialog");
    const bounds = await viewer.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(901);
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole("button", { name: "Xem ảnh 1 toàn màn hình", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Đóng hộp thoại" })).toBeInViewport();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("zero and one-photo events retain editing and event deletion confirmation", async ({ page }) => {
  await createPhotoEvent(page, 0);
  await expect(page.getByText("Chưa có ảnh cho kỷ niệm này", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ảnh của sự kiện", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Xóa sự kiện", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Giữ lại", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Trở về hành trình", exact: false }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Hành trình của/);
  // Another independent browser storage state for a single-photo event.
  await page.evaluate(() => localStorage.removeItem("mory-demo-v1"));
  await createPhotoEvent(page, 1);
  const gallery = page.getByRole("region", { name: "Ảnh của sự kiện", exact: true });
  await expect(gallery.locator(".photo-position")).toHaveText("Ảnh 1 / 1");
  await expect(gallery.getByRole("button", { name: "Ảnh tiếp theo", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Tên sự kiện", { exact: false })).toBeVisible();
});

test("Android touch swipes move both the native gallery and the large viewer", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium CDP drives real emulated touch input.");
  const context = await browser.newContext({ ...devices["Galaxy S24"], baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000" });
  try {
    const page = await context.newPage();
    await createPhotoEvent(page);
    const session = await context.newCDPSession(page);
    async function swipe(selector: string) {
      const element = page.locator(selector);
      await element.scrollIntoViewIfNeeded();
      const box = (await element.boundingBox())!;
      const y = box.y + box.height / 2, start = box.x + box.width * 0.8;
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start, y }] });
      for (let step = 1; step <= 6; step++) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start - box.width * 0.6 * step / 6, y }] });
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    await swipe(".photo-track");
    await expect(page.locator(".photo-position")).toHaveText("Ảnh 2 / 3");
    await page.getByRole("button", { name: "Xem ảnh 2 toàn màn hình", exact: true }).click();
    await swipe(".photo-viewer-stage");
    await expect(page.getByRole("dialog")).toHaveAccessibleName("Ảnh 3 / 3");
  } finally { await context.close(); }
});
