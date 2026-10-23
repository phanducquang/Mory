import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: externalBaseURL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Asia/Ho_Chi_Minh",
    locale: "vi-VN",
  },
  projects: process.env.MORY_BROWSER_MATRIX === "1" ? [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "android-chromium", use: { ...devices["Pixel 7"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 14"] } },
  ] : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseURL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
