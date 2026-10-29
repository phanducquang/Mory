import { expect, type Page } from "@playwright/test";
import sharp from "sharp";

export async function galleryPhotos() {
  return Promise.all([
    { width: 1200, height: 1800, color: "#f3ebe0" },
    { width: 1800, height: 1200, color: "#e5eee5" },
    { width: 1200, height: 1200, color: "#eae5f2" },
  ].map(async ({ width, height, color }, index) => ({
    name: `demo-${index + 1}.png`, mimeType: "image/png",
    buffer: await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/><rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="20" fill="none" stroke="#7962ab" stroke-width="8"/><text x="70" y="130" font-size="52" fill="#302d38" font-family="sans-serif">PHOTO ${index + 1} / DEMO ONLY</text><path d="M70 200 H${width - 70} M70 260 H${width - 70} M70 320 H${width - 200}" stroke="#a99db9" stroke-width="8"/><circle cx="${width / 2}" cy="${height / 2}" r="200" fill="white"/><text x="${width / 2}" y="${height / 2 + 25}" text-anchor="middle" font-size="90" fill="#7962ab" font-family="sans-serif">${index + 1}</text><text x="70" y="${height - 70}" font-size="40" fill="#655b70" font-family="sans-serif">FULL IMAGE / BOTTOM EDGE</text></svg>`)).png().toBuffer(),
  })));
}

export async function createPhotoEvent(page: Page, count = 3) {
  await page.goto("/home");
  await page.getByRole("button", { name: "Lưu kỷ niệm mới", exact: true }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  const title = "Một ngày thật đáng nhớ — những điều gia đình muốn kể lại";
  await dialog.getByLabel("Tên sự kiện", { exact: false }).fill(title);
  await dialog.getByLabel("Câu chuyện của bạn", { exact: false }).fill("Nội dung minh họa để kiểm tra giao diện. Gia đình cùng lưu lại những điều nhỏ bé trong ngày.\n\nMột câu chuyện dài vẫn cần đọc trọn vẹn trên điện thoại, bên cạnh những bức ảnh dọc và ngang.");
  if (count) await dialog.locator('input[type="file"]').setInputFiles((await galleryPhotos()).slice(0, count));
  await dialog.getByRole("button", { name: "Lưu kỷ niệm", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/timeline");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  return title;
}
