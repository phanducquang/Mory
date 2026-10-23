import { addDays, addMonths, todayVN } from "@/lib/dates";
import type { DemoData, Event, EventType } from "@/types/domain";

/** Fictional sample data only. No real family or child is represented. */
export function createDemoData(at = todayVN()): DemoData {
  const babyId = "demo-an";
  const createdAt = `${at}T05:00:00.000Z`;
  const event = (
    id: string,
    title: string,
    days: number,
    type: EventType,
    description: string,
    images: string[] = [],
  ): Event => ({
    id,
    childId: babyId,
    title,
    date: addDays(at, days),
    type,
    description,
    images,
    reminder: days > 0,
    createdAt,
    updatedAt: createdAt,
  });
  return {
    children: [
      {
        id: babyId,
        name: "Minh An",
        nickname: "Bé An",
        lifecycle: "AFTER_BIRTH",
        birthDate: addMonths(at, -7),
        gender: "female",
        avatar: "/images/baby.jpg",
        calendarRule: "SAME_DAY",
        leapMonthRule: "REGULAR_MONTH",
        reminderEnabled: true,
        trackingUntilAge: 18,
        privacy: "FAMILY_ONLY",
      },
      {
        id: "demo-may",
        name: "Em bé Mây",
        nickname: "Mây",
        lifecycle: "EXPECTING",
        dueDate: addDays(at, 28),
        calendarRule: "SAME_DAY",
        reminderEnabled: true,
        privacy: "FAMILY_ONLY",
      },
    ],
    activeChildId: babyId,
    events: [
      event(
        "demo-first-picnic",
        "Một ngày thật xanh cùng con",
        -2,
        "memory",
        "Nắng dịu, gió khẽ và nụ cười trong veo của An. Chỉ cần những buổi chiều bình yên như thế này là đủ.",
        ["/images/family.jpg"],
      ),
      event(
        "demo-first-word",
        "Tiếng “ba” đầu tiên",
        -6,
        "milestone",
        "Hôm nay con gọi ba thật rõ. Cả nhà đã nghe đi nghe lại đoạn ghi âm nhỏ ấy, rồi cùng bật cười.",
        ["/images/baby.jpg"],
      ),
      event(
        "demo-breakfast",
        "Bữa sáng của đầu bếp nhí",
        -10,
        "activity",
        "Con đã tự cầm chiếc thìa bé xíu, khám phá từng miếng bơ mềm. Một chút lộn xộn, thật nhiều niềm vui.",
        [],
      ),
      event(
        "demo-checkup",
        "Hẹn khám sức khỏe định kỳ",
        7,
        "health",
        "Mang theo sổ theo dõi sức khỏe của con. Ghi lại những điều gia đình muốn trao đổi với bác sĩ.",
      ),
      event(
        "demo-photo-day",
        "Buổi chụp ảnh cả nhà",
        14,
        "activity",
        "Lưu lại một buổi sáng bên nhau. Áo màu sáng và thật nhiều nụ cười.",
      ),
    ],
    milestones: [],
  };
}
