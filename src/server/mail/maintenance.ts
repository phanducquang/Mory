import "server-only";
import { randomUUID } from "node:crypto";
import { reminderAllowed } from "../reminders/preflight";
import nodemailer from "nodemailer";
import type { PrismaClient } from "../db/generated/client";
import { openMail, type MailPayload } from "./crypto";
import { readMailQueueConfig, readSmtpConfig } from "./config";
export function smtpSender(config = readSmtpConfig()) {
  const transport = nodemailer.createTransport(config);
  return { async send(payload: MailPayload, id: string) {
    const result = await transport.sendMail({ ...payload, from: { name: "Mory", address: payload.from },
      messageId: `<${id}@${payload.from.split("@").at(-1)}>`, disableFileAccess: true, disableUrlAccess: true });
    if (!result.accepted?.length || result.rejected?.length) throw new Error("Mail rejected.");
  }, close() { transport.close(); } };
}
export async function maintainAuthMail(db: PrismaClient, key: Buffer, send: (payload: MailPayload, id: string) => Promise<void>, allowReminders = process.env.MORY_REMINDERS_ENABLED === "true") {
  const stats = { sent: 0, expired: 0, retry: 0, failed: 0, cancelled: 0 };
  // Bounded cleanup; wipe bearer links and email addresses as soon as the job finishes/expires.
  const expired = await db.$executeRaw`UPDATE "AuthMailJob" SET "status"='EXPIRED', "payload"=NULL, "completedAt"=now(), "leaseToken"=NULL, "leaseUntil"=NULL
    WHERE "id" IN (SELECT "id" FROM "AuthMailJob" WHERE "status"='QUEUED' AND "expiresAt"<=now()
      AND ("leaseUntil" IS NULL OR "leaseUntil"<now()) ORDER BY "expiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED)`;
  stats.expired = expired;
  const lease = randomUUID();
  const jobs = await db.$queryRaw<{ id: string; purpose: string; payload: string; attempts: number; expiresAt: Date; subjectUserId: string | null }[]>`
    UPDATE "AuthMailJob" SET "leaseToken"=${lease}::uuid, "leaseUntil"=now()+interval '5 minutes', "attempts"="attempts"+1
    WHERE "id" IN (SELECT "id" FROM "AuthMailJob" WHERE "status"='QUEUED' AND "notBefore"<=now() AND "expiresAt">now()
      AND ("leaseUntil" IS NULL OR "leaseUntil"<now()) ORDER BY "createdAt", "id" LIMIT 10 FOR UPDATE SKIP LOCKED)
    RETURNING "id", "purpose", "payload", "attempts", "expiresAt", "subjectUserId"`;
  for (const job of jobs) {
    try {
      const payload = openMail(job.payload, key, job.purpose);
      if (job.purpose !== "REMINDER") {
        const subject = await db.user.findFirst({ where: { ...(job.subjectUserId ? { id: job.subjectUserId } : { email: payload.to }), deletionRequestedAt: null }, select: { email: true, emailVerified: true } });
        if (!subject || subject.email !== payload.to || (job.purpose === "VERIFY" && subject.emailVerified)) {
          await db.authMailJob.updateMany({ where: { id: job.id, leaseToken: lease }, data: { status: "CANCELLED", payload: null, completedAt: new Date(), leaseToken: null, leaseUntil: null } });
          stats.cancelled++; continue;
        }
      }
      if (job.purpose === "REMINDER" && !await reminderAllowed(db, job.id, payload.to, allowReminders)) {
        await db.authMailJob.updateMany({ where: { id: job.id, leaseToken: lease }, data: { status: "CANCELLED", payload: null, completedAt: new Date(), leaseToken: null, leaseUntil: null } });
        stats.cancelled++; continue;
      }
      if (job.expiresAt.getTime() <= Date.now()) throw new Error("Expired mail.");
      await send(payload, job.id);
      await db.authMailJob.updateMany({ where: { id: job.id, leaseToken: lease }, data: { status: "SENT", payload: null, completedAt: new Date(), leaseToken: null, leaseUntil: null } });
      stats.sent++;
    } catch {
      const terminal = job.attempts >= 5 || job.expiresAt.getTime() <= Date.now();
      await db.authMailJob.updateMany({ where: { id: job.id, leaseToken: lease }, data: { leaseToken: null, leaseUntil: null,
        ...(terminal ? { status: "FAILED", payload: null, completedAt: new Date() } : { notBefore: new Date(Date.now() + Math.min(300_000, 15_000 * 2 ** job.attempts)) }) } });
      if (terminal) stats.failed++; else stats.retry++;
    }
  }
  return stats;
}
export async function configuredMailPass(db: PrismaClient) {
  const config = readMailQueueConfig(); const smtp = smtpSender();
  try { return await maintainAuthMail(db, config.key, (payload, id) => smtp.send(payload, id)); }
  finally { smtp.close(); }
}
