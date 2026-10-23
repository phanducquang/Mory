import { type Page } from "@playwright/test";
export async function inboxLink(email: string, purpose: "VERIFY" | "RESET" | "REMINDER") {
  const inbox = process.env.MORY_TEST_INBOX;
  if (!inbox) throw new Error("Disposable SMTP inbox is required.");
  for (let attempt = 0; attempt < 100; attempt++) {
    const messages = await (await fetch(`${inbox}/messages`)).json() as { id: number; recipients: string[]; subject: string }[];
    const message = messages.findLast((m) => m.recipients.some((to) => to.includes(email)) && m.subject === (purpose === "VERIFY" ? "Xác minh email Mory" : purpose === "RESET" ? "Đặt lại mật khẩu Mory" : "Nhắc lịch gia đình Mory"));
    if (message) {
      const mail = await (await fetch(`${inbox}/messages/${message.id}.json`)).json() as { source: string; text?: string };
      // The plain-text part is decoded by Mailcatcher. Never print mail content or the bearer link.
      const text = mail.text ?? await (await fetch(`${inbox}/messages/${message.id}.plain`)).text();
      const link = text.split(/\r?\n/).find((line) => line.startsWith(process.env.PLAYWRIGHT_BASE_URL!) && (purpose === "REMINDER" ? line.includes("/events/") : line.includes("#token=")));
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("No matching local authentication email was delivered.");
}
export async function openMailLink(page: Page, link: string) {
  try { await page.goto(link); } catch { throw new Error("Could not open a local authentication email link."); }
}
export async function completeVerification(page: Page, email: string, password: string) {
  if (process.env.AUTH_EMAIL_ENABLED !== "true") return;
  const link = await inboxLink(email, "VERIFY");
  await openMailLink(page, link);
  await page.getByRole("button", { name: "Xác minh email", exact: true }).click();
  await page.getByRole("link", { name: "Đăng nhập", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}
