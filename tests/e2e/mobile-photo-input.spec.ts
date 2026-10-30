import { expect, test } from "@playwright/test";
import { galleryPhotos } from "./photo-fixture";

test("avatar selection can recover from unsupported files and cancellation without losing the photo", async ({ page }) => {
  await page.goto("/children");
  await page.getByRole("button", { name: "Chỉnh sửa hồ sơ", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Chỉnh sửa hồ sơ của bé" });
  const input = dialog.locator('input[type="file"]');
  const photo = (await galleryPhotos())[0];
  await input.setInputFiles(photo);
  const preview = dialog.getByRole("img", { name: "Ảnh đại diện của bé", exact: true });
  await expect(preview).toBeVisible();
  const source = await preview.getAttribute("src");
  await input.setInputFiles({ name: "phone.heic", mimeType: "image/heic", buffer: Buffer.from("unsupported test image") });
  await expect(dialog.getByRole("alert")).toContainText("HEIC/HEIF");
  await expect(preview).toHaveAttribute("src", source!);
  await expect(input).toHaveValue("");
  await input.setInputFiles([]);
  await expect(preview).toHaveAttribute("src", source!);
  await input.setInputFiles(photo);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(input).toHaveValue("");
  await dialog.getByRole("button", { name: "Lưu hồ sơ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".profile-avatar:visible img")).toHaveAttribute("src", source!);
});
