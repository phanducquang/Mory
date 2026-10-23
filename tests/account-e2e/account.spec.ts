import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { completeVerification } from "./email-utils";

if (process.env.MORY_INTEGRATION_DATABASE !== "disposable-docker") throw new Error("Use npm run test:account.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const password = randomBytes(24).toString("hex");
test.beforeEach(async () => { await pool.query('DELETE FROM "AuthRateLimit"'); });
test.afterAll(async () => { await pool.end(); });
async function signup(page: Page, name = "Gia đình E2E", expecting = false) {
  const email = `${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Tên của bạn", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await completeVerification(page, email, password);
  await page.getByRole("button", { name: "Tạo không gian gia đình" }).click();
  await expect(page.getByRole("heading", { name: "Bắt đầu hành trình của con" })).toBeVisible();
  if (expecting) {
    await page.getByLabel("Ngày dự sinh", { exact: false }).fill("2024-12-15");
    await page.getByLabel("Tên gọi của bé", { exact: false }).fill(name);
  } else {
    await page.getByLabel("Bé đã chào đời", { exact: true }).check();
    await page.getByLabel("Tên bé", { exact: false }).fill(name);
    await page.getByLabel("Ngày sinh thực tế", { exact: false }).fill("2024-02-10");
  }
  await page.getByRole("button", { name: "Bắt đầu hành trình", exact: true }).click();
  await expect(page.getByRole("main")).toContainText(name);
  const user = (await pool.query('SELECT "id" FROM "User" WHERE "email" = $1', [email])).rows[0];
  const child = (await pool.query('SELECT c.* FROM "Child" c JOIN "FamilyMember" m ON m."familyId"=c."familyId" WHERE m."userId"=$1', [user.id])).rows[0];
  return { email, userId: user.id as string, childId: child.id as string, familyId: child.familyId as string };
}
async function createMemory(page: Page, title: string) {
  await page.getByRole("button", { name: "Lưu kỷ niệm mới", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Lưu một kỷ niệm mới" });
  await dialog.getByLabel("Tên sự kiện", { exact: false }).fill(title);
  await dialog.getByLabel("Ngày diễn ra", { exact: false }).fill("2024-03-10");
  await dialog.getByLabel("Câu chuyện của bạn", { exact: false }).fill("Câu chuyện riêng tư của gia đình");
  await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
  await dialog.getByRole("button", { name: "Lưu kỷ niệm", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function logout(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("real signup, onboarding, event edits, reload, logout and login persist without localStorage", async ({ page, context, request }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/private/tmp/mory-account-login.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => localStorage.setItem("mory-demo-v1", "DEMO_MUST_STAY_LOCAL"));
  const account = await signup(page, "Bé tài khoản A");
  await page.screenshot({ path: "/private/tmp/mory-account-home.png", fullPage: true });
  await createMemory(page, "Kỷ niệm tài khoản A");
  const event = (await pool.query('SELECT * FROM "Event" WHERE "familyId"=$1', [account.familyId])).rows[0];
  await page.goto(`/events/${event.id}`);
  await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên sự kiện", { exact: false }).fill("Kỷ niệm đã sửa A");
  await dialog.getByLabel("Ngày diễn ra", { exact: false }).fill("2024-03-11");
  await dialog.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog).not.toBeVisible(); await page.reload();
  await expect(page.getByRole("heading", { name: "Kỷ niệm đã sửa A", exact: true })).toBeVisible();
  const edited = (await pool.query('SELECT * FROM "Event" WHERE "id"=$1', [event.id])).rows[0];
  expect(edited.createdAt.toISOString()).toBe(event.createdAt.toISOString());
  expect(await page.evaluate(() => localStorage.getItem("mory-demo-v1"))).toBe("DEMO_MUST_STAY_LOCAL");
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "mory.session_token")!;
  expect(session.httpOnly).toBe(true); expect(session.sameSite).toBe("Lax");
  await logout(page);
  await page.goBack(); await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Kỷ niệm đã sửa A", exact: true })).not.toBeVisible();
  const revoked = await request.get("/api/auth/get-session", { headers: { cookie: `${session.name}=${session.value}` } });
  expect(await revoked.json()).toBeNull();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/events/${event.id}`);
  await expect(page.getByRole("main")).toContainText("Kỷ niệm đã sửa A");
});

test("another account and forged child preference cannot read a private event", async ({ page, context }) => {
  const a = await signup(page, "Bé bí mật A");
  await createMemory(page, "PRIVATE_EVENT_A");
  const event = (await pool.query('SELECT "id" FROM "Event" WHERE "familyId"=$1', [a.familyId])).rows[0];
  await logout(page);
  await signup(page, "Bé gia đình B");
  await context.addCookies([{ name: "mory-child", value: a.childId, url: process.env.PLAYWRIGHT_BASE_URL! }]);
  const response = await page.goto(`/events/${event.id}`);
  // Next returns 200 for a notFound boundary after streaming starts, 404 before streaming.
  expect([200, 404]).toContain(response?.status());
  await expect(page.getByRole("heading", { name: "Mình đi lạc một chút rồi." })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("PRIVATE_EVENT_A");
  await page.goto("/home"); await expect(page.getByRole("main")).toContainText("Bé gia đình B");
  await page.goto("/timeline"); await expect(page.getByRole("main")).not.toContainText("PRIVATE_EVENT_A");
});

test("stale UI cannot write after membership is changed to viewer; expired sessions redirect", async ({ page }) => {
  const a = await signup(page, "Bé chỉ xem");
  await pool.query('UPDATE "FamilyMember" SET "role"=\'VIEWER\' WHERE "userId"=$1', [a.userId]);
  await page.getByRole("button", { name: "Lưu kỷ niệm mới", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên sự kiện", { exact: false }).fill("Bị từ chối");
  await dialog.getByRole("button", { name: "Lưu kỷ niệm", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Không tìm thấy|quyền xem/ }).first()).toBeVisible();
  expect((await pool.query('SELECT count(*)::int AS count FROM "Event" WHERE "familyId"=$1', [a.familyId])).rows[0].count).toBe(0);
  await pool.query('UPDATE "AuthSession" SET "expiresAt"=now()-interval \'1 day\' WHERE "userId"=$1', [a.userId]);
  await dialog.getByRole("button", { name: "Lưu kỷ niệm", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("birth confirmation, milestone confirmation and server-side Vietnamese timeline search work", async ({ page }) => {
  const a = await signup(page, "Mây tài khoản", true);
  expect((await pool.query('SELECT "lifecycle" FROM "Child" WHERE "id"=$1', [a.childId])).rows[0].lifecycle).toBe("EXPECTING");
  await page.goto("/children"); await page.getByRole("button", { name: "Xác nhận bé chào đời", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ngày sinh thực tế", { exact: false }).fill("2024-02-10");
  await dialog.getByRole("button", { name: "Lưu ngày chào đời", exact: true }).click();
  await expect(dialog).not.toBeVisible(); await page.reload();
  const row = page.locator(".milestone-row").filter({ has: page.getByRole("heading", { name: "Lễ thôi nôi", exact: true }) });
  await row.getByRole("button", { name: "Lên lịch", exact: true }).click();
  dialog = page.getByRole("dialog"); await dialog.getByLabel("Ngày tổ chức").fill("2027-02-14");
  await dialog.getByRole("button", { name: "Xác nhận và lưu sự kiện" }).click(); await expect(dialog).not.toBeVisible();
  await page.goto("/timeline");
  await page.getByRole("textbox", { name: "Tìm kỷ niệm", exact: true }).fill("thoi noi");
  await expect(page.getByRole("link", { name: "Lễ thôi nôi", exact: true })).toBeVisible();
  const child = (await pool.query('SELECT "lifecycle", "dueDate"::text FROM "Child" WHERE "id"=$1', [a.childId])).rows[0];
  expect(child.lifecycle).toBe("AFTER_BIRTH"); expect(child.dueDate).toBe("2024-12-15");
});
