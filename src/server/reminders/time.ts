import "server-only";
import { isDateOnly } from "@/lib/dates";
/** Family event wall time is always Asia/Ho_Chi_Minh. Undated suggestions never enter the scheduler. */
export function eventInstant(date: string, time = "") {
  if (!isDateOnly(date) || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error("Ngày/giờ nhắc lịch không hợp lệ.");
  return new Date(`${date}T${time || "09:00"}:00+07:00`);
}
export function reminderInstant(date: string, time = "") { return new Date(eventInstant(date, time).getTime() - 86_400_000); }
