import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { completeVerification } from "./email-utils";
import sharp from "sharp";
if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use npm run test:media.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const password = randomBytes(24).toString("hex");
const origin = process.env.PLAYWRIGHT_BASE_URL!;
test.skip(process.env.MORY_MEDIA_ENABLED !== "true", "Private media is opt-in.");
test.beforeEach(async () => { await pool.query('DELETE FROM "AuthRateLimit"'); });
test.afterAll(async () => { await pool.end(); });
async function signup(page: Page, name: string) {
  const email = `${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Tên của bạn", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await completeVerification(page, email, password);
  await page.getByRole("button", { name: "Tạo không gian gia đình" }).click();
  await page.getByLabel("Bé đã chào đời", { exact: true }).check();
  await page.getByLabel("Tên bé", { exact: false }).fill(name);
  await page.getByLabel("Ngày sinh thực tế", { exact: false }).fill("2024-02-10");
  await page.getByRole("button", { name: "Bắt đầu hành trình", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bắt đầu hành trình của con", exact: true })).not.toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
  const result = await pool.query('SELECT c.*, m."userId" FROM "Child" c JOIN "FamilyMember" m ON c."familyId"=m."familyId" JOIN "User" u ON m."userId"=u."id" WHERE u."email"=$1', [email]);
  expect(result.rows).toHaveLength(1);
  return result.rows[0] as { id: string; familyId: string; userId: string };
}
async function createEvent(page: Page) {
  await page.getByRole("button", { name: "Lưu kỷ niệm mới", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên sự kiện", { exact: false }).fill("Ngày lưu ảnh riêng tư");
  await dialog.getByLabel("Ngày diễn ra", { exact: false }).fill("2024-03-10");
  await dialog.getByRole("button", { name: "Lưu kỷ niệm", exact: true }).click();
  await expect(dialog).not.toBeVisible(); await expect(page).toHaveURL(/\/events\/[\da-f-]+$/);
  return page.url().split("/").at(-1)!;
}
const picture = async () => ({ name: "private-photo.png", mimeType: "image/png", buffer: await sharp({ create: { width: 640, height: 480, channels: 3, background: "pink" } }).png().toBuffer() });

test("upload, reload, edit and delete an event image through the authenticated UI", async ({ page, request }) => {
  await signup(page, "Bé ảnh E2E"); const id = await createEvent(page);
  await page.getByLabel("Thêm ảnh", { exact: true }).setInputFiles(await picture());
  await expect(page.getByText("Đã lưu ảnh riêng tư cho gia đình.", { exact: true })).toBeVisible();
  const image = page.locator(".detail-photos img").first(); await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const url = (await image.getAttribute("src"))!;
  const response = await page.request.get(url); expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store"); expect(response.headers()["content-type"]).toBe("image/webp");
  expect((await request.get(url)).status()).toBe(401);
  await page.reload(); await expect(page.locator(".detail-photos img")).toHaveCount(1);
  await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Tên sự kiện", { exact: false }).fill("Kỷ niệm giữ nguyên ảnh");
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click(); await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload(); await expect(page.locator(".detail-photos img")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => page.locator(".detail-photos img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: "/private/tmp/mory-media-event-mobile.png", fullPage: true });
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (key) => (await (await caches.open(key)).keys()).map((r) => r.url)))).flat());
  expect(cached.some((key) => key.includes("/api/media/"))).toBe(false);
  await page.getByRole("button", { name: "Xóa ảnh 1", exact: true }).click();
  await expect(page.locator(".detail-photos img")).toHaveCount(0); expect((await page.request.get(url)).status()).toBe(404);
  expect((await pool.query('SELECT count(*)::int AS n FROM "MediaAsset" WHERE "eventId"=$1 AND "status"=\'READY\'', [id])).rows[0].n).toBe(0);
});

test("avatar replacement persists; another family and a viewer cannot mutate private images", async ({ page, browser }) => {
  const a = await signup(page, "Bé avatar"); await page.goto("/children");
  await page.getByLabel("Thêm ảnh", { exact: true }).setInputFiles(await picture());
  await expect(page.getByText("Đã lưu ảnh riêng tư cho gia đình.", { exact: true })).toBeVisible();
  const first = (await page.locator(".profile-avatar img").getAttribute("src"))!;
  await page.getByLabel("Thay ảnh đại diện", { exact: true }).setInputFiles(await picture());
  await expect.poll(() => page.locator(".profile-avatar img").getAttribute("src")).not.toBe(first);
  const second = (await page.locator(".profile-avatar img").getAttribute("src"))!;
  expect((await page.request.get(first)).status()).toBe(404);
  await page.reload(); await expect(page.locator(".profile-avatar img")).toHaveAttribute("src", second);
  await page.getByRole("button", { name: "Chỉnh sửa hồ sơ", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Tên bé", { exact: false }).fill("Bé avatar đã sửa");
  await page.getByRole("button", { name: "Lưu hồ sơ", exact: true }).click(); await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload(); await expect(page.locator(".profile-avatar img")).toHaveAttribute("src", second);
  const other = await browser.newContext({ baseURL: origin });
  try {
    const otherPage = await other.newPage(); await signup(otherPage, "Bé gia đình khác");
    expect((await other.request.get(second)).status()).toBe(404);
    expect((await other.request.delete(second, { headers: { Origin: origin } })).status()).toBe(404);
    expect((await other.request.post(`/api/media/avatar/${a.id}`, { headers: { Origin: origin, "Content-Type": "image/png" }, data: (await picture()).buffer })).status()).toBe(404);
  } finally { await other.close(); }
  await pool.query('UPDATE "FamilyMember" SET "role"=\'VIEWER\' WHERE "userId"=$1', [a.userId]);
  expect((await page.request.get(second)).status()).toBe(200);
  expect((await page.request.delete(second, { headers: { Origin: origin } })).status()).toBe(403);
  expect((await page.request.post(`/api/media/avatar/${a.id}`, { headers: { Origin: origin, "Content-Type": "image/png" }, data: (await picture()).buffer })).status()).toBe(403);
  await page.reload(); await expect(page.locator('.media-manager input[type="file"]')).toHaveCount(0);
  await page.goto("/account"); await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/); expect((await page.request.get(second)).status()).toBe(401);
});

test("media endpoints reject cross-origin, spoofed, oversized and unknown inputs", async ({ page }) => {
  await signup(page, "Bé kiểm tra ảnh"); const id = await createEvent(page); const endpoint = `/api/media/event/${id}`;
  expect((await page.request.post(endpoint, { headers: { Origin: "https://other.invalid", "Content-Type": "image/png" }, data: (await picture()).buffer })).status()).toBe(403);
  const spoofed = await page.request.post(endpoint, { headers: { Origin: origin, "Content-Type": "image/png" }, data: '<svg width="10" height="10"></svg>' });
  expect(spoofed.status()).toBe(400);
  expect((await page.request.post(endpoint, { headers: { Origin: origin, "Content-Type": "image/png" }, data: Buffer.alloc(8 * 1024 * 1024 + 1) })).status()).toBe(400);
  expect((await page.request.get(`/api/media/${randomUUID()}`)).status()).toBe(404);
  expect((await pool.query('SELECT count(*)::int AS n FROM "MediaAsset" WHERE "eventId"=$1 AND "status"=\'READY\'', [id])).rows[0].n).toBe(0);
});
