import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { inboxLink, openMailLink } from "./email-utils";
if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use the isolated account runner.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const phase = process.env.MORY_UI_REVIEW_PHASE;
test.afterAll(async () => { await pool.end(); });
async function capture(page: Page, name: string) {
  if (!phase || !["before", "after"].includes(phase)) return;
  const dir = path.resolve("review/ui-ux-pro-max", phase); await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}-${page.viewportSize()!.width}.png`), animations: "disabled", mask: [page.locator('input[type="password"], input[type="email"], input[readonly], input[autocomplete="off"]')] });
  if (name === "server-settings" || name === "server-account" || name === "server-family") {
    await page.screenshot({ path: path.join(dir, `${name}-full-${page.viewportSize()!.width}.png`), fullPage: true, animations: "disabled", mask: [page.locator('input[type="password"], input[type="email"], input[readonly], input[autocomplete="off"]')] });
  }
}
test("existing account, family and invitation screens remain accessible across viewport sizes", async ({ page }) => {
  test.setTimeout(180_000); await pool.query('DELETE FROM "AuthRateLimit"');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of ["login", "register", "forgot-password", "verify-email", "reset-password", "join"]) {
      await page.goto(`/${route}`); await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); await capture(page, route);
    }
  }
  const email = `${randomUUID()}@example.test`, password = randomBytes(24).toString("hex");
  await page.goto("/register"); await page.getByLabel("Tên của bạn", { exact: true }).fill("Tài khoản minh họa UI");
  await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  if (process.env.AUTH_EMAIL_ENABLED === "true") {
    await openMailLink(page, await inboxLink(email, "VERIFY")); await expect(page.getByRole("button", { name: "Xác minh email", exact: true })).toBeVisible();
    await capture(page, "verify-confirm"); await page.getByRole("button", { name: "Xác minh email", exact: true }).click();
    await page.getByRole("link", { name: "Đăng nhập", exact: true }).click(); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Tạo không gian gia đình", exact: true })).toBeVisible();
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 960 }); await capture(page, "welcome"); }
  await page.getByRole("button", { name: "Tạo không gian gia đình", exact: true }).click();
  await page.getByLabel("Bé đã chào đời", { exact: true }).check(); await page.getByLabel("Tên bé", { exact: false }).fill("Mây — hồ sơ minh họa"); await page.getByLabel("Ngày sinh thực tế", { exact: false }).fill("2024-01-01");
  await page.getByRole("button", { name: "Bắt đầu hành trình", exact: true }).click(); await expect(page).toHaveURL(/\/home$/);
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of ["account", "family", "join", "settings"]) {
      await page.goto(`/${route}`); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if ([390, 1440].includes(width)) await capture(page, route === "join" ? "join-signed-in" : `server-${route}`);
    }
  }
  await page.goto("/family"); await page.getByRole("button", { name: "Tạo lời mời", exact: true }).click();
  const field = page.getByLabel("Liên kết mời mới", { exact: true }); await expect(field).toBeVisible(); const invitation = await field.inputValue();
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 960 }); await capture(page, "family-invitation"); }
  await page.goto(invitation); await page.getByRole("button", { name: "Xem lời mời", exact: true }).click(); await expect(page.getByRole("button", { name: "Xác nhận tham gia", exact: true })).toBeVisible();
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 960 }); await capture(page, "join-preview"); }
  if (process.env.AUTH_EMAIL_ENABLED === "true") {
    await page.goto("/forgot-password"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByRole("button", { name: "Gửi liên kết đặt lại mật khẩu", exact: true }).click();
    await openMailLink(page, await inboxLink(email, "RESET")); await expect(page.getByLabel("Mật khẩu mới", { exact: true })).toBeVisible();
    for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 960 }); await capture(page, "reset-form"); }
  }
});
