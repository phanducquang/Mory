import "server-only";
import type { PrismaClient } from "../db/generated/client";
import { eventInstant, reminderInstant } from "./time";
/** Check again immediately before SMTP, including current membership and recipient address. */
export async function reminderAllowed(db: PrismaClient, id: string, to: string, enabled: boolean, now = new Date()) {
  if (!enabled) return false;
  const job = await db.authMailJob.findFirst({ where: { id, purpose: "REMINDER", status: "QUEUED" },
    include: { reminder: { include: { event: true, child: { include: { family: true } } } }, recipient: { include: { user: { include: { preference: true } } } } } });
  const r = job?.reminder; const e = r?.event; const user = job?.recipient?.user;
  if (!r?.enabled || r.child.family.deletionRequestedAt || user?.deletionRequestedAt || !e?.reminder || !r.child.reminderEnabled || !["EXPECTING", "AFTER_BIRTH"].includes(r.child.lifecycle) ||
    !user?.emailVerified || user.email !== to || !user.preference?.notificationsEnabled) return false;
  const date = e.date.toISOString().slice(0, 10);
  return eventInstant(date, e.time) > now && reminderInstant(date, e.time).getTime() === r.scheduledAt.getTime();
}
