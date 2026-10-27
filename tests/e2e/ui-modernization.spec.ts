import { expect, test } from "@playwright/test";

test("all existing journal screens reflow at the seven review widths", async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of ["home", "timeline", "events", "children", "onboarding", "settings"]) {
      await page.goto(`/${route}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} at ${width}px`).toBe(true);
      const navigation = page.getByRole("navigation", { name: width < 768 ? "Điều hướng di động" : "Điều hướng chính", exact: true });
      for (const href of ["/home", "/timeline", "/events", "/children"]) {
        await expect(navigation.locator(`a[href="${href}"]`)).toBeVisible();
      }
    }
    await page.getByRole("button", { name: "Lưu kỷ niệm mới", exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const save = dialog.getByRole("button", { name: "Lưu kỷ niệm", exact: true });
    await save.scrollIntoViewIfNeeded();
    const bounds = await save.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(960);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
  }
});

test("keyboard users can skip navigation and identify the active filter", async ({ page, browserName }) => {
  await page.goto("/timeline");
  // WebKit on macOS uses Option+Tab to include links in keyboard navigation.
  await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
  await expect(page.getByRole("link", { name: "Đến nội dung chính" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const filters = page.getByRole("group", { name: "Lọc theo loại sự kiện" });
  await expect(filters.getByRole("button", { name: "Tất cả", exact: true })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "Sức khỏe", exact: true }).click();
  await expect(filters.getByRole("button", { name: "Sức khỏe", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(filters.getByRole("button", { name: "Tất cả", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  await expect(page.getByRole("region", { name: "Nhắc nhở của gia đình" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Thông báo", exact: true })).toBeFocused();
});

test("long Vietnamese content and enlarged text keep actions reachable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  await page.getByRole("button", { name: "Lưu kỷ niệm mới", exact: true }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  const title = "Một buổi chiều bên gia đình — con kể câu chuyện đầu tiên và cùng ba mẹ lưu lại những điều thật đáng nhớ";
  await dialog.getByLabel("Tên sự kiện", { exact: false }).fill(title);
  await dialog.getByLabel("Câu chuyện", { exact: false }).fill("Kỷ niệm của gia đình. ".repeat(30));
  await dialog.getByRole("button", { name: "Lưu kỷ niệm", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/timeline");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  // Text enlargement, separately from the viewport reflow checks above.
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).scrollIntoViewIfNeeded();
  expect(await page.locator(".modal-panel").count()).toBe(0);
  expect(await page.locator(".button").first().evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
});
