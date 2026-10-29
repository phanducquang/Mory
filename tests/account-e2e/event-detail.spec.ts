import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { galleryPhotos } from "../e2e/photo-fixture";
import { completeVerification } from "./email-utils";

if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use the isolated account runner.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
test.afterAll(async () => { await pool.end(); });
const phase = process.env.MORY_DETAIL_REVIEW_PHASE;
async function capture(page: Page, name: string) {
  if (phase !== "before" && phase !== "after") return;
  await mkdir(`review/event-detail/${phase}`, { recursive: true });
  await page.screenshot({ path: `review/event-detail/${phase}/${name}-${page.viewportSize()!.width}.png`, fullPage: true, animations: "disabled" });
}

test("event photos keep contextual removal, error recovery, private reads and viewer permissions", async ({ page }) => {
  test.setTimeout(180_000);
  await pool.query('DELETE FROM "AuthRateLimit"');
  const email = `${randomUUID()}@example.test`, password = randomBytes(24).toString("hex");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/register");
  await page.getByLabel("Tên của bạn", { exact: true }).fill("Gia đình minh họa UI");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await completeVerification(page, email, password);
  await page.getByRole("button", { name: "Tạo không gian gia đình", exact: true }).click();
  await page.getByLabel("Bé đã chào đời", { exact: true }).check();
  await page.getByLabel("Tên bé", { exact: false }).fill("Bé minh họa");
  await page.getByLabel("Ngày sinh thực tế", { exact: false }).fill("2024-01-01");
  await page.getByRole("button", { name: "Bắt đầu hành trình", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "Lưu kỷ niệm mới", exact: true }).filter({ visible: true }).first().click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Tên sự kiện", { exact: false }).fill("Ba bức ảnh trong câu chuyện của gia đình");
  await form.getByLabel("Câu chuyện của bạn", { exact: false }).fill("Câu chuyện minh họa cho màn hình chi tiết. Ảnh dọc, ảnh ngang và từng thao tác đều cần rõ ràng trên điện thoại.");
  await form.getByRole("button", { name: "Lưu kỷ niệm", exact: true }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+$/);
  await capture(page, "server-empty");
  const manager = page.getByRole("region", { name: "Ảnh của kỷ niệm", exact: true });
  for (const [index, photo] of (await galleryPhotos()).entries()) {
    await manager.getByLabel("Thêm ảnh", { exact: true }).setInputFiles(photo);
    await expect(page.locator(".detail-photos img")).toHaveCount(index + 1);
    await expect(manager.getByLabel("Thêm ảnh", { exact: true })).toBeEnabled();
  }
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 900 }); await capture(page, "server-detail"); }
  if (phase === "before") return; // Baseline evidence uses the old UI, not the new interactions.

  const photos = page.locator(".detail-photos img");
  const urls = await photos.evaluateAll(elements => elements.map(element => element.getAttribute("src")!));
  await manager.getByRole("button", { name: "Chọn ảnh 2", exact: true }).click();
  await manager.getByRole("button", { name: "Xem ảnh 2 toàn màn hình", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Ảnh 2 / 3");
  await page.keyboard.press("Escape");
  await expect(manager.getByRole("button", { name: "Xem ảnh 2 toàn màn hình", exact: true })).toBeFocused();
  await page.route(`**${urls[1]}`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Chưa xóa được ảnh. Vui lòng thử lại." }) }));
  await manager.getByRole("button", { name: "Xóa ảnh 2", exact: true }).click();
  await expect(manager.getByRole("alert")).toContainText("Chưa xóa được ảnh");
  await expect(photos).toHaveCount(3);
  await page.unroute(`**${urls[1]}`);
  await manager.getByRole("button", { name: "Xóa ảnh 2", exact: true }).click();
  await expect(photos).toHaveCount(2);
  expect(await photos.evaluateAll(elements => elements.map(element => element.getAttribute("src")))).toEqual([urls[0], urls[2]]);
  expect((await page.request.get(urls[1])).status()).toBe(404);
  expect((await page.request.get(urls[0])).status()).toBe(200);
  await expect(manager.locator(".photo-position")).toHaveText("Ảnh 2 / 2");
  const userId = (await pool.query('SELECT "id" FROM "User" WHERE "email"=$1', [email])).rows[0].id;
  await pool.query('UPDATE "FamilyMember" SET "role"=\'VIEWER\' WHERE "userId"=$1', [userId]);
  await page.reload();
  await expect(manager.locator('input[type="file"]')).toHaveCount(0);
  await expect(manager.getByRole("button", { name: /^Xóa ảnh/ })).toHaveCount(0);
  await manager.getByRole("button", { name: "Xem ảnh 1 toàn màn hình", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await pool.query('UPDATE "FamilyMember" SET "role"=\'OWNER\' WHERE "userId"=$1', [userId]);
  await page.reload();
  for (const remaining of [1, 0]) {
    await manager.getByRole("button", { name: "Xóa ảnh 1", exact: true }).click();
    await expect(photos).toHaveCount(remaining);
    await expect(manager.getByLabel("Thêm ảnh", { exact: true })).toBeEnabled();
  }
  await expect(manager.getByText("Chưa có ảnh cho kỷ niệm này", { exact: true })).toBeVisible();
});
