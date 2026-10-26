import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import { completeVerification } from "./email-utils";
if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use disposable account runner.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const password = randomBytes(24).toString("hex");
test.beforeEach(async () => { await pool.query('DELETE FROM "AuthRateLimit"'); });
test.afterAll(async () => { await pool.end(); });
async function signup(page: Page, name: string, ownFamily = false) {
  const email = `${randomUUID()}@example.test`;
  await page.goto("/register"); await page.getByLabel("Tên của bạn", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click(); await completeVerification(page, email, password);
  if (ownFamily) {
    await page.getByRole("button", { name: "Tạo không gian gia đình", exact: true }).click();
    await page.getByLabel("Bé đã chào đời", { exact: true }).check(); await page.getByLabel("Tên bé", { exact: false }).fill("Bé chung");
    await page.getByLabel("Ngày sinh thực tế", { exact: false }).fill("2024-01-01");
    await page.getByRole("button", { name: "Bắt đầu hành trình", exact: true }).click(); await expect(page).toHaveURL(/\/home$/);
  }
}
async function invite(page: Page, role = "PARENT") {
  await page.goto("/family"); await page.getByLabel("Quyền của người được mời", { exact: true }).selectOption(role);
  await page.getByRole("button", { name: "Tạo lời mời", exact: true }).click();
  const input = page.getByLabel("Liên kết mời mới", { exact: true }); await expect(input).toBeVisible(); return input.inputValue();
}
async function accept(page: Page, link: string) {
  await page.goto(link); await page.getByRole("button", { name: "Xem lời mời", exact: true }).click();
  await expect(page.getByRole("region", { name: "Thông tin lời mời", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận tham gia", exact: true }).click(); await expect(page).toHaveURL(/\/home$/);
}
async function event(page: Page, title: string) {
  await page.getByRole("button", { name: "Lưu kỷ niệm mới", exact: true }).click(); const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên sự kiện", { exact: false }).fill(title); await dialog.getByLabel("Ngày diễn ra", { exact: false }).fill("2024-02-01");
  await dialog.getByRole("button", { name: "Lưu kỷ niệm", exact: true }).click(); await expect(dialog).not.toBeVisible();
}
async function switchFamily(page: Page, name: string) {
  await page.goto("/family"); await page.getByLabel("Chọn không gian gia đình", { exact: true }).selectOption({ label: name });
  await page.getByRole("button", { name: "Mở gia đình", exact: true }).click(); await expect(page).toHaveURL(/\/home$/);
}

test("independent parent accounts share events, switch families, and lose access after removal", async ({ page, browser }) => {
  await signup(page, "Bố cùng chăm con", true); await page.goto("/family");
  await page.getByLabel("Tên không gian gia đình", { exact: true }).fill("Gia đình bố mẹ");
  await page.getByRole("button", { name: "Lưu tên gia đình", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Đã cập nhật tên");
  const link = await invite(page); const other = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  let photoURL = "";
  try {
    const mom = await other.newPage(); await signup(mom, "Mẹ cùng chăm con", true);
    await accept(mom, link); await event(mom, "Kỷ niệm mẹ ghi cho con");
    if (process.env.MORY_MEDIA_ENABLED === "true") {
      await mom.getByLabel("Thêm ảnh", { exact: true }).setInputFiles({ name: "family.png", mimeType: "image/png", buffer: await sharp({ create: { width: 64, height: 64, channels: 3, background: "pink" } }).png().toBuffer() });
      await expect(mom.getByText("Đã lưu ảnh riêng tư cho gia đình.", { exact: true })).toBeVisible();
      photoURL = (await mom.locator(".detail-photos img").first().getAttribute("src"))!;
      expect((await page.request.get(photoURL)).status()).toBe(200);
    }
    await page.goto("/timeline"); await expect(page.getByText("Kỷ niệm mẹ ghi cho con", { exact: true })).toBeVisible();
    await mom.goto("/family"); await expect(mom.getByRole("button", { name: "Tạo lời mời", exact: true })).toHaveCount(0);
    await switchFamily(mom, "Gia đình của tôi"); await mom.goto("/timeline"); await expect(mom.getByText("Kỷ niệm mẹ ghi cho con", { exact: true })).toHaveCount(0);
    await switchFamily(mom, "Gia đình bố mẹ");
    await page.goto("/family"); const member = page.locator(".family-member-list > li").filter({ hasText: "Mẹ cùng chăm con" });
    await member.getByRole("combobox").selectOption("VIEWER"); await member.getByRole("button", { name: "Lưu quyền", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Đã cập nhật quyền"); await mom.goto("/family"); await expect(mom.getByText("Chỉ xem", { exact: true }).first()).toBeVisible();
    await member.getByRole("button", { name: "Xóa thành viên", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible(); await mom.goto("/family"); await expect(mom.getByLabel("Chọn không gian gia đình", { exact: true })).toHaveCount(0);
    await mom.goto("/timeline"); await expect(mom.getByText("Kỷ niệm mẹ ghi cho con", { exact: true })).toHaveCount(0);
    if (photoURL) expect((await mom.request.get(photoURL)).status()).toBe(404);
    await page.goto("/timeline"); await expect(page.getByText("Kỷ niệm mẹ ghi cho con", { exact: true })).toBeVisible();
    await mom.goto(link); await mom.getByRole("button", { name: "Xem lời mời", exact: true }).click(); await expect(mom.getByRole("alert").filter({ hasText: "không còn hiệu lực" })).toBeVisible();
  } finally { await other.close(); }
});

test("new accounts join from welcome, revoked links fail, and membership pages fit mobile", async ({ page, browser }) => {
  await signup(page, "Chủ gia đình mobile", true); const link = await invite(page, "VIEWER");
  const other = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  try {
    const guest = await other.newPage(); await guest.goto(link); await expect(guest.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();
    await signup(guest, "Người thân chỉ xem"); await expect(guest.getByRole("link", { name: "Tham gia bằng lời mời", exact: true })).toBeVisible();
    await accept(guest, link); await guest.goto("/family"); await expect(guest.getByRole("button", { name: "Rời gia đình", exact: true })).toBeVisible();
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto("/family"); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const button of await page.getByRole("button").all()) if (await button.isVisible()) {
        const box = await button.boundingBox(); expect(box!.width).toBeLessThanOrEqual(width); expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      if (width === 320 || width === 375) await page.screenshot({ path: `/private/tmp/mory-family-members-${width}.png`, fullPage: true });
    }
    await page.screenshot({ path: "/private/tmp/mory-family-members-tablet.png", fullPage: true });
    const revoked = await invite(page); await page.getByRole("button", { name: "Thu hồi lời mời", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Đã thu hồi");
    await guest.goto(revoked); await guest.getByRole("button", { name: "Xem lời mời", exact: true }).click(); await expect(guest.getByRole("alert").filter({ hasText: "không còn hiệu lực" })).toBeVisible();
    await guest.goto("/family"); await guest.getByRole("button", { name: "Rời gia đình", exact: true }).click();
    await guest.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click(); await expect(guest).toHaveURL(/\/welcome$/);
  } finally { await other.close(); }
});
