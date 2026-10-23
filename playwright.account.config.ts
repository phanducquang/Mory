import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/account-e2e", workers: 1, fullyParallel: false, retries: 0,
  timeout: 90_000, reporter: "list",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", trace: "off", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
