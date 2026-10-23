import "server-only";
import { createHmac, createHash } from "node:crypto";
import type { PrismaClient } from "../db/generated/client";
import { sealMail } from "./crypto";
import { readMailQueueConfig } from "./config";
export interface AuthMailer { enqueue(purpose: "VERIFY" | "RESET", input: { email: string; token: string; userId?: string }): Promise<void> }
export function createAuthMailer(db: PrismaClient, origin: string, config = readMailQueueConfig()): AuthMailer {
  return { async enqueue(purpose, { email, token, userId }) {
    if (userId && (await db.user.findUnique({ where: { id: userId }, select: { deletionRequestedAt: true } }))?.deletionRequestedAt) return;
    const to = email.trim().toLowerCase();
    const budgetKey = createHmac("sha256", config.key).update(`${purpose}:${to}`).digest("hex");
    const minutes = purpose === "RESET" ? 15 : 60;
    const link = `${origin}/${purpose === "RESET" ? "reset-password" : "verify-email"}#token=${encodeURIComponent(token)}`;
    const payload = sealMail({ to, from: config.from, subject: purpose === "RESET" ? "Đặt lại mật khẩu Mory" : "Xác minh email Mory",
      text: `${purpose === "RESET" ? "Bạn vừa yêu cầu đặt lại mật khẩu Mory." : "Xác minh địa chỉ email để mở tài khoản Mory."}\n\nMở liên kết và bấm xác nhận:\n${link}\n\nLiên kết có hiệu lực tối đa ${minutes} phút. Nếu bạn không yêu cầu, hãy bỏ qua thư này. Không chia sẻ liên kết cho người khác.` }, config.key, purpose);
    await db.$transaction(async (tx) => {
      // One message/minute and at most five/hour per recipient/purpose, shared across instances.
      await tx.$executeRaw`INSERT INTO "AuthMailBudget" ("key") VALUES (${budgetKey}) ON CONFLICT ("key") DO NOTHING`;
      const budgets = await tx.$queryRaw<{ count: number; startedAt: Date; lastQueuedAt: Date | null }[]>`SELECT * FROM "AuthMailBudget" WHERE "key" = ${budgetKey} FOR UPDATE`;
      const budget = budgets[0]; const now = new Date();
      const reset = budget.startedAt.getTime() <= now.getTime() - 3_600_000;
      if ((!reset && budget.count >= 5) || (budget.lastQueuedAt && budget.lastQueuedAt.getTime() > now.getTime() - 60_000)) return;
      await tx.authMailJob.create({ data: { purpose, payload, subjectUserId: userId, verificationHash: purpose === "VERIFY" && userId ? createHash("sha256").update(token).digest("hex") : null, expiresAt: new Date(now.getTime() + minutes * 60_000) } });
      await tx.authMailBudget.update({ where: { key: budgetKey }, data: { count: reset ? 1 : budget.count + 1,
        startedAt: reset ? now : budget.startedAt, lastQueuedAt: now } });
    });
  } };
}
