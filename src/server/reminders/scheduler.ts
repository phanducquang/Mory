import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type PrismaClient } from "../db/generated/client";
import { sealMail } from "../mail/crypto";
import { readMailQueueConfig } from "../mail/config";
import { eventInstant, reminderInstant } from "./time";
const cursorSchema = z.object({ eventId: z.uuid(), userId: z.uuid() });
/** Bounded, resumable scan over (event,user), not an unbounded per-family fanout. */
export async function scheduleReminders(db: PrismaClient, origin: string, config = readMailQueueConfig(), now = new Date()) {
  const key = "event-email-reminders"; const token = randomUUID();
  await db.$executeRaw`INSERT INTO "WorkerCheckpoint" ("key", "updatedAt") VALUES (${key}, now()) ON CONFLICT ("key") DO NOTHING`;
  const claimed = await db.workerCheckpoint.updateMany({ where: { key, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 300_000) } });
  const stats = { scanned: 0, queued: 0 };
  if (!claimed.count) return stats;
  try {
    const state = await db.workerCheckpoint.findUniqueOrThrow({ where: { key } });
    let cursor: z.infer<typeof cursorSchema> | undefined;
    try { cursor = state.cursor ? cursorSchema.parse(JSON.parse(state.cursor)) : undefined; } catch { /* Invalid old cursor restarts the bounded scan. */ }
    const after = cursor ? Prisma.sql`AND (e."id", u."id") > (${cursor.eventId}::uuid, ${cursor.userId}::uuid)` : Prisma.empty;
    const rows = await db.$queryRaw<{ eventId: string; userId: string; familyId: string; childId: string }[]>(Prisma.sql`
      SELECT e."id" AS "eventId", u."id" AS "userId", e."familyId", e."childId"
      FROM "Event" e JOIN "Family" f ON f."id"=e."familyId" JOIN "Child" c ON c."familyId"=e."familyId" AND c."id"=e."childId"
      JOIN "FamilyMember" m ON m."familyId"=e."familyId" JOIN "User" u ON u."id"=m."userId"
      JOIN "UserPreference" p ON p."userId"=u."id"
      WHERE f."deletionRequestedAt" IS NULL AND u."deletionRequestedAt" IS NULL AND e."reminder" AND c."reminderEnabled" AND c."lifecycle" IN ('EXPECTING','AFTER_BIRTH')
        AND p."notificationsEnabled" AND u."emailVerified" AND u."email" IS NOT NULL
        AND e."date" BETWEEN (${now}::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND (${now}::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1
        AND ((e."date" + coalesce(nullif(e."time",''),'09:00')::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') > ${now}
        AND ((e."date" + coalesce(nullif(e."time",''),'09:00')::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '1 day' <= ${now}
        ${after} ORDER BY e."id", u."id" LIMIT 101`);
    const page = rows.slice(0, 100);
    for (const row of page) {
      stats.scanned++;
      const queued = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Child" WHERE "familyId"=${row.familyId}::uuid AND "id"=${row.childId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "familyId"=${row.familyId}::uuid AND "id"=${row.eventId}::uuid FOR UPDATE`;
        const event = await tx.event.findFirst({ where: { id: row.eventId, familyId: row.familyId, childId: row.childId }, include: { child: true } });
        const member = await tx.familyMember.findUnique({ where: { familyId_userId: { familyId: row.familyId, userId: row.userId } }, include: { user: { include: { preference: true } } } });
        if (!event?.reminder || !event.child.reminderEnabled || !["EXPECTING", "AFTER_BIRTH"].includes(event.child.lifecycle) || !member?.user.emailVerified || !member.user.email || !member.user.preference?.notificationsEnabled) return false;
        if (!await tx.family.findFirst({ where: { id: row.familyId, deletionRequestedAt: null }, select: { id: true } }) || member.user.deletionRequestedAt) return false;
        const date = event.date.toISOString().slice(0, 10); const expiry = eventInstant(date, event.time); const scheduledAt = reminderInstant(date, event.time);
        if (expiry <= now || scheduledAt > now) return false;
        const reminder = await tx.reminder.upsert({ where: { familyId_eventId_scheduledAt: { familyId: row.familyId, eventId: row.eventId, scheduledAt } },
          create: { familyId: row.familyId, childId: row.childId, eventId: row.eventId, scheduledAt }, update: { enabled: true } });
        const existing = await tx.authMailJob.findUnique({ where: { reminderId_recipientUserId: { reminderId: reminder.id, recipientUserId: row.userId } } });
        if (existing && existing.status !== "CANCELLED") return false;
        const payload = sealMail({ to: member.user.email, from: config.from, subject: "Nhắc lịch gia đình Mory",
          text: `Bạn có một sự kiện gia đình đến lịch nhắc. Mở Mory để xem trong không gian riêng tư:\n\n${origin}/events/${row.eventId}\n\nBạn nhận thư vì đã bật nhắc lịch qua email trong Cài đặt. Có thể tắt bất kỳ lúc nào. Thư không chứa tên bé hoặc nội dung kỷ niệm.` }, config.key, "REMINDER");
        const values = { purpose: "REMINDER", payload, expiresAt: expiry, notBefore: now, familyId: row.familyId, reminderId: reminder.id, recipientUserId: row.userId };
        if (existing) await tx.authMailJob.update({ where: { id: existing.id }, data: { ...values, status: "QUEUED", attempts: 0, completedAt: null, leaseToken: null, leaseUntil: null } });
        else await tx.authMailJob.create({ data: values });
        return true;
      }, { maxWait: 10_000, timeout: 15_000 });
      if (queued) stats.queued++;
    }
    await db.workerCheckpoint.updateMany({ where: { key, leaseToken: token }, data: { cursor: rows.length > 100 ? JSON.stringify({ eventId: page.at(-1)!.eventId, userId: page.at(-1)!.userId }) : null, leaseUntil: null, leaseToken: null } });
    return stats;
  } catch (error) {
    await db.workerCheckpoint.updateMany({ where: { key, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } });
    throw error;
  }
}
