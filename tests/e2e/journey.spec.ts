import { expect, test, type Page } from "@playwright/test";

type SavedJourney = {
  activeChildId: string;
  children: Array<{
    id: string;
    name: string;
    lifecycle: string;
    dueDate?: string;
    birthDate?: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    date: string;
    images: string[];
    createdAt: string;
    updatedAt: string;
  }>;
};

function vietnamToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function savedJourney(page: Page): Promise<SavedJourney> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("mory-demo-v1") ?? "null"),
  );
}

async function startPregnancy(page: Page, name = "Mây nhỏ E2E") {
  await page.goto("/onboarding");
  const form = page.locator(".onboarding-wrap:visible");
  await form.getByLabel("Bé chưa chào đời", { exact: true }).check();
  await form.getByLabel("Tên gọi của bé", { exact: false }).fill(name);
  // An overdue due date must remain EXPECTING until the parent confirms birth.
  await form.getByLabel("Ngày dự sinh", { exact: false }).fill("2024-12-15");
  await form
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Chào ba mẹ, hôm nay thật đẹp" })).toBeVisible();
  await expect(page.locator(".onboarding-wrap:visible")).toHaveCount(0);
  await expect(form).not.toBeVisible();
  await expect
    .poll(async () =>
      (await savedJourney(page)).children.some((child) => child.name === name),
    )
    .toBe(true);
}

test("home renders the active child and a working memory action", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Một khoảnh khắc bình yên của Minh An",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Lưu kỷ niệm mới", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Lưu một kỷ niệm mới" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Ngày diễn ra", { exact: false })).toHaveValue(
    vietnamToday(),
  );
  await dialog
    .getByRole("button", { name: "Lưu kỷ niệm", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Đóng hộp thoại", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Lưu kỷ niệm", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lưu kỷ niệm mới", exact: true }),
  ).toBeFocused();
});

test("onboarding saves a born child, rejects future birth dates, and keeps it after reload", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await page.locator(".onboarding-wrap:visible").getByLabel("Bé đã chào đời", { exact: true }).check();
  await page.locator(".onboarding-wrap:visible").getByLabel("Tên bé", { exact: false }).fill("Bình An E2E");
  await page.locator(".onboarding-wrap:visible")
    .getByLabel("Ngày sinh thực tế", { exact: false })
    .fill("2099-02-20");
  await page
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Ngày sinh không thể ở tương lai." }),
  ).toBeVisible();
  await page.locator(".onboarding-wrap:visible")
    .getByLabel("Ngày sinh thực tế", { exact: false })
    .fill("2024-02-29");
  await page.locator(".onboarding-wrap:visible").getByLabel("Giờ sinh", { exact: false }).fill("08:35");
  await page.locator(".onboarding-wrap:visible").getByLabel("Giới tính", { exact: false }).selectOption("female");
  await page
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Chào ba mẹ, hôm nay thật đẹp" })).toBeVisible();
  await expect(page.locator(".onboarding-wrap:visible")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("main")).toContainText("Bình An E2E");
  const journey = await savedJourney(page);
  expect(
    journey.children.find((child) => child.id === journey.activeChildId),
  ).toMatchObject({
    name: "Bình An E2E",
    lifecycle: "AFTER_BIRTH",
    birthDate: "2024-02-29",
  });
});

test("an overdue pregnancy stays expecting until actual birth is explicitly confirmed", async ({
  page,
}) => {
  await startPregnancy(page);
  let journey = await savedJourney(page);
  expect(
    journey.children.find((child) => child.id === journey.activeChildId),
  ).toMatchObject({ lifecycle: "EXPECTING", dueDate: "2024-12-15" });
  await page.goto("/children");
  await page
    .getByRole("button", { name: "Xác nhận bé chào đời", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Chào mừng con đến với thế giới",
  });
  await dialog
    .getByLabel("Ngày sinh thực tế", { exact: false })
    .fill(vietnamToday());
  await dialog
    .getByRole("button", { name: "Lưu ngày chào đời", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  journey = await savedJourney(page);
  expect(
    journey.children.find((child) => child.id === journey.activeChildId),
  ).toMatchObject({
    lifecycle: "AFTER_BIRTH",
    dueDate: "2024-12-15",
    birthDate: vietnamToday(),
  });
  await page.reload();
  await expect(page.getByRole("main")).toContainText("Mây nhỏ E2E");
});

test("pregnancy onboarding accepts an optional name", async ({ page }) => {
  await page.goto("/onboarding");
  await page.locator(".onboarding-wrap:visible").getByLabel("Ngày dự sinh", { exact: false }).fill("2027-01-15");
  await page
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Chào ba mẹ, hôm nay thật đẹp" })).toBeVisible();
  await expect(page.locator(".onboarding-wrap:visible")).toHaveCount(0);
  const journey = await savedJourney(page);
  expect(
    journey.children.find((child) => child.id === journey.activeChildId),
  ).toMatchObject({
    name: "Bé yêu",
    lifecycle: "EXPECTING",
    dueDate: "2027-01-15",
  });
});

test("event upload checks image contents, then create and edit preserve the event date and creation time", async ({
  page,
}) => {
  await page.goto("/home");
  await page
    .getByRole("button", { name: "Lưu kỷ niệm mới", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Lưu một kỷ niệm mới" });
  await dialog
    .getByLabel("Tên sự kiện", { exact: false })
    .fill("Buổi dạo chơi E2E");
  await dialog.getByLabel("Ngày diễn ra", { exact: false }).fill("2024-03-10");
  await dialog.getByLabel("Giờ diễn ra", { exact: false }).fill("16:45");
  await dialog
    .getByLabel("Loại sự kiện", { exact: true })
    .selectOption("memory");
  await dialog
    .getByLabel("Câu chuyện của bạn", { exact: false })
    .fill("Cả nhà cùng lưu một buổi chiều bình yên.");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "phone-photo.heic", mimeType: "image/heic", buffer: Buffer.from("unsupported test image"),
  });
  await expect(dialog.getByRole("alert")).toContainText("HEIC/HEIF");
  await expect(dialog.getByRole("img", { name: "Ảnh sự kiện 1" })).toHaveCount(0);
  await expect(dialog.locator('input[type="file"]')).toHaveValue("");
  await dialog.locator('input[type="file"]').setInputFiles([]);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "spoof.png",
    mimeType: "image/png",
    buffer: Buffer.from("this is not an image"),
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "Nội dung ảnh không khớp định dạng.",
  );
  const validPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=",
    "base64",
  );
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "memory.png",
    mimeType: "image/png",
    buffer: validPng,
  });
  await expect(
    dialog.getByRole("img", { name: "Ảnh sự kiện 1" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Lưu kỷ niệm", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const created = (await savedJourney(page)).events.find(
    (event) => event.title === "Buổi dạo chơi E2E",
  );
  expect(created).toMatchObject({ date: "2024-03-10" });
  expect(created?.images[0]).toMatch(/^data:image\/png;base64,/);
  await page.goto("/timeline");
  await page
    .getByRole("link", { name: "Buổi dạo chơi E2E", exact: true })
    .click();
  await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Tên sự kiện", { exact: false })
    .fill("Buổi dạo chơi đáng nhớ E2E");
  await dialog.getByLabel("Ngày diễn ra", { exact: false }).fill("2024-03-11");
  await dialog
    .getByRole("button", { name: "Lưu thay đổi", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("main")).toContainText(
    "Buổi dạo chơi đáng nhớ E2E",
  );
  const updated = (await savedJourney(page)).events.find(
    (event) => event.id === created?.id,
  );
  expect(updated).toMatchObject({
    title: "Buổi dạo chơi đáng nhớ E2E",
    date: "2024-03-11",
    createdAt: created?.createdAt,
  });
  expect(updated).toBeDefined();
  expect(updated!.updatedAt >= (created?.createdAt ?? "")).toBe(true);
});

test("timeline type filters show matching events", async ({ page }) => {
  await page.goto("/timeline");
  await page.getByRole("button", { name: "Sức khỏe", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Hẹn khám sức khỏe định kỳ", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Một ngày thật xanh cùng con",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Kỷ niệm", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: "Một ngày thật xanh cùng con",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Hẹn khám sức khỏe định kỳ", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Tất cả", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Hẹn khám sức khỏe định kỳ", exact: true }),
  ).toBeVisible();
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`responsive home and event form fit a ${width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/home");
    await expect(page.getByRole("main")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Lưu kỷ niệm mới", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Lưu một kỷ niệm mới" });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    for (const route of [
      "/children",
      "/timeline",
      "/onboarding",
      "/settings",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        )
        .toBe(true);
    }
  });
}

test("family confirms a ceremony, can reschedule it, and the timeline retains the chosen date", async ({
  page,
}) => {
  await page.goto("/children");
  const row = page.locator(".milestone-row").filter({
    has: page.getByRole("heading", { name: "Lễ thôi nôi", exact: true }),
  });
  await row.getByRole("button", { name: "Lên lịch", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Xác nhận Lễ thôi nôi" });
  await dialog.getByLabel("Ngày tổ chức").fill("2027-02-14");
  await dialog.getByRole("button", { name: "Xác nhận và lưu sự kiện" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(row).toContainText("14/02/2027");
  await expect(row).toContainText("Đã xác nhận");
  await row.getByRole("button", { name: "Đổi ngày", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Xác nhận Lễ thôi nôi" });
  await dialog.getByLabel("Ngày tổ chức").fill("2027-02-15");
  await dialog.getByRole("button", { name: "Xác nhận và lưu sự kiện" }).click();
  await page.goto("/timeline");
  await page.getByRole("link", { name: "Lễ thôi nôi", exact: true }).click();
  await expect(page.getByRole("main")).toContainText("15/02/2027");
  await page.getByRole("button", { name: "Xóa sự kiện", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Giữ lại", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Lễ thôi nôi", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa sự kiện", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận xóa", exact: true })
    .click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(
    page.getByRole("link", { name: "Lễ thôi nôi", exact: true }),
  ).toHaveCount(0);
});

test("pausing a journey silences upcoming reminders while keeping the child profile", async ({
  page,
}) => {
  await page.goto("/children");
  await page
    .getByRole("button", { name: "Tạm dừng hoặc kết thúc theo dõi" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tạm dừng", exact: true })
    .click();
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Một khoảng bình yên" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sắp đến rồi" })).toHaveCount(
    0,
  );
  await page.goto("/children");
  await page.getByRole("button", { name: "Tiếp tục hành trình" }).click();
  const journey = await savedJourney(page);
  expect(
    journey.children.find((child) => child.id === journey.activeChildId)
      ?.lifecycle,
  ).toBe("AFTER_BIRTH");
});

test("mobile child switcher changes the active journey and settings remain reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  await page.getByLabel("Chọn bé trên điện thoại").selectOption("demo-may");
  await expect(
    page.getByRole("button", { name: "Xác nhận bé chào đời", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Cài đặt gia đình", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  expect((await savedJourney(page)).activeChildId).toBe("demo-may");
});

test("lunar suggestions appear automatically on the timeline and family-confirmed dates survive rule changes", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await page.locator(".onboarding-wrap:visible").getByLabel("Bé đã chào đời", { exact: true }).check();
  await page.locator(".onboarding-wrap:visible").getByLabel("Tên bé", { exact: false }).fill("Bé Lịch E2E");
  await page.locator(".onboarding-wrap:visible")
    .getByLabel("Ngày sinh thực tế", { exact: false })
    .fill("2024-02-10");
  await page
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Chào ba mẹ, hôm nay thật đẹp" })).toBeVisible();
  await expect(page.locator(".onboarding-wrap:visible")).toHaveCount(0);
  await page.goto("/timeline");
  await page.getByRole("button", { name: "Cột mốc", exact: true }).click();
  await page.getByRole("textbox", { name: "Tìm kỷ niệm", exact: true }).fill("thoi noi");
  const suggestion = page
    .locator(".timeline-entry")
    .filter({
      has: page.getByRole("heading", { name: "Lễ thôi nôi", exact: true }),
    });
  await expect(suggestion).toContainText("29/01/2025");
  await expect(suggestion).toContainText("Gợi ý tự động");
  await suggestion
    .getByRole("link", { name: "Lễ thôi nôi", exact: true })
    .click();
  const row = page
    .locator(".milestone-row")
    .filter({
      has: page.getByRole("heading", { name: "Lễ thôi nôi", exact: true }),
    });
  await page.getByLabel("Quy tắc lễ âm lịch").selectOption("MINUS_ONE");
  await expect(row).toContainText("28/01/2025");
  await row.getByRole("button", { name: "Lên lịch", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Xác nhận Lễ thôi nôi" });
  await expect(dialog.getByLabel("Ngày tổ chức")).toHaveValue("2025-01-28");
  await dialog.getByLabel("Ngày tổ chức").fill("2025-01-30");
  await dialog.getByRole("button", { name: "Xác nhận và lưu sự kiện" }).click();
  await page.getByLabel("Quy tắc lễ âm lịch").selectOption("MINUS_TWO");
  await expect(row).toContainText("30/01/2025");
  await page.reload();
  await expect(row).toContainText("30/01/2025");
  await expect(row).toContainText("Đã xác nhận");
  await page.goto("/timeline");
  await page.getByRole("textbox", { name: "Tìm kỷ niệm", exact: true }).fill("thoi noi");
  await expect(page.locator(".timeline-entry")).toHaveCount(1);
  await expect(page.locator(".timeline-entry")).not.toContainText(
    "Gợi ý tự động",
  );
});

test("a custom milestone may stay undated, then be confirmed and completed without imposing a deadline", async ({
  page,
}) => {
  await page.goto("/children");
  await page
    .getByRole("button", { name: "Thêm cột mốc riêng", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Cột mốc theo nhịp riêng của con",
  });
  await dialog.getByLabel("Tên cột mốc").fill("Bước chân của con E2E");
  await dialog
    .getByLabel("Ghi chú cho cột mốc")
    .fill("Ba mẹ ở đây, chờ con theo nhịp riêng.");
  await dialog
    .getByRole("button", { name: "Lưu cột mốc", exact: true })
    .click();
  const row = page
    .locator(".milestone-row")
    .filter({
      has: page.getByRole("heading", {
        name: "Bước chân của con E2E",
        exact: true,
      }),
    });
  await expect(row).toContainText("Chưa chọn ngày");
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mory-demo-v1")!),
  );
  expect(
    before.events.some(
      (e: { title: string }) => e.title === "Bước chân của con E2E",
    ),
  ).toBe(false);
  await row.getByRole("button", { name: "Lên lịch", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Xác nhận Bước chân của con E2E" });
  await dialog.getByLabel("Ngày diễn ra").fill(vietnamToday());
  await dialog.getByRole("button", { name: "Xác nhận và lưu sự kiện" }).click();
  await row
    .getByRole("button", {
      name: "Hoàn thành Bước chân của con E2E",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(row).toContainText("Đã hoàn thành");
  await page.goto("/timeline");
  await page.getByRole("textbox", { name: "Tìm kỷ niệm", exact: true }).fill("Bước chân của con E2E");
  await expect(page.locator(".timeline-entry")).toHaveCount(1);
  await expect(page.locator(".timeline-entry")).toContainText(
    "Ba mẹ ở đây, chờ con theo nhịp riêng.",
  );
});
