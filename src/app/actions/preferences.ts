"use server";
import { z } from "zod";
import { accountServices, loadAccountSnapshot } from "@/server/services/account-journey";
import { readAuthConfig } from "@/server/auth/config";
export async function setEmailNotifications(raw: unknown) {
  const { account, db, authorization } = await accountServices();
  await authorization.requireFamilyAccess(account, "read");
  const enabled = z.boolean().parse(raw);
  if (enabled && (process.env.MORY_REMINDERS_ENABLED !== "true" || !readAuthConfig().emailEnabled)) throw new Error("Nhắc lịch email chưa được bật.");
  await db.$transaction(async (tx) => {
    await tx.userPreference.upsert({ where: { userId: account.userId }, create: { userId: account.userId, notificationsEnabled: enabled }, update: { notificationsEnabled: enabled } });
    if (!enabled) await tx.authMailJob.updateMany({ where: { recipientUserId: account.userId, purpose: "REMINDER", status: "QUEUED" }, data: { status: "CANCELLED", payload: null, completedAt: new Date(), leaseToken: null, leaseUntil: null } });
  });
  return loadAccountSnapshot();
}
