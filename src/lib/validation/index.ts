import { z } from "zod";
import { isDateOnly, todayVN } from "@/lib/dates";
import type { DemoData } from "@/types/domain";

export const dateOnlySchema = z
  .string()
  .refine(isDateOnly, "Vui lòng chọn ngày hợp lệ.");
const optionalDate = z.union([dateOnlySchema, z.literal("")]).optional();
const optionalTime = z
  .union([
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ."),
    z.literal(""),
  ])
  .optional();

export const eventSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Tên sự kiện cần ít nhất 2 ký tự.")
    .max(120, "Tên sự kiện tối đa 120 ký tự."),
  date: dateOnlySchema,
  time: optionalTime,
  type: z.enum(["memory", "milestone", "health", "activity"]),
  description: z.string().trim().max(5000, "Mô tả tối đa 5.000 ký tự."),
  images: z
    .array(z.string().max(3_000_000))
    .max(3, "Mỗi sự kiện tối đa 3 ảnh.")
    .default([]),
  reminder: z.boolean().default(false),
});
export type EventInput = z.infer<typeof eventSchema>;

export const childSchema = z
  .object({
    name: z.string().trim().max(80, "Tên bé tối đa 80 ký tự."),
    nickname: z.string().trim().max(40).optional(),
    lifecycle: z.enum(["EXPECTING", "AFTER_BIRTH", "PAUSED", "ENDED"]),
    dueDate: optionalDate,
    birthDate: optionalDate,
    birthTime: optionalTime,
    gender: z.enum(["female", "male", "other", "unspecified"]).optional(),
    calendarRule: z.enum(["SAME_DAY", "MINUS_ONE", "MINUS_TWO"]).optional(),
    leapMonthRule: z
      .enum(["REGULAR_MONTH", "LEAP_MONTH", "NEXT_AVAILABLE"])
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.lifecycle === "EXPECTING" && !value.dueDate)
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Vui lòng nhập ngày dự sinh.",
      });
    if (value.lifecycle === "EXPECTING" && value.birthDate)
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message:
          "Hồ sơ đã có ngày sinh thực tế không thể chuyển về giai đoạn thai kỳ.",
      });
    if (value.lifecycle === "AFTER_BIRTH") {
      if (!value.name)
        ctx.addIssue({
          code: "custom",
          path: ["name"],
          message: "Vui lòng nhập tên bé.",
        });
      if (!value.birthDate)
        ctx.addIssue({
          code: "custom",
          path: ["birthDate"],
          message: "Vui lòng nhập ngày sinh thực tế.",
        });
      else if (value.birthDate > todayVN())
        ctx.addIssue({
          code: "custom",
          path: ["birthDate"],
          message: "Ngày sinh thực tế không thể ở tương lai.",
        });
    }
  });

export const birthConfirmationSchema = z
  .object({ birthDate: dateOnlySchema, birthTime: optionalTime })
  .refine((value) => value.birthDate <= todayVN(), {
    path: ["birthDate"],
    message: "Ngày sinh thực tế không thể ở tương lai.",
  });

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/);
const timestampSchema = z.string().max(50).datetime({ offset: true });
const storedDate = dateOnlySchema.optional();

/** Demo accepts bundled photos and the same raster formats accepted by the forms. */
export const imageReferenceSchema = z
  .string()
  .max(2_800_000)
  .refine((value) => {
    if (/^\/images\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|svg)$/i.test(value))
      return true;
    const data =
      /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!data || data[2].length % 4 !== 0) return false;
    const byteLength =
      (data[2].length * 3) / 4 -
      (data[2].endsWith("==") ? 2 : data[2].endsWith("=") ? 1 : 0);
    if (byteLength > 2 * 1024 * 1024) return false;
    try {
      const header = atob(data[2].slice(0, 24));
      if (data[1] === "jpeg")
        return (
          header.charCodeAt(0) === 255 &&
          header.charCodeAt(1) === 216 &&
          header.charCodeAt(2) === 255
        );
      if (data[1] === "png") return header.startsWith("\x89PNG\r\n\x1a\n");
      return header.slice(0, 4) === "RIFF" && header.slice(8, 12) === "WEBP";
    } catch {
      return false;
    }
  }, "Dữ liệu hình ảnh không hợp lệ.");

export const persistedChildSchema = childSchema.safeExtend({
  id: identifierSchema,
  familyId: identifierSchema.optional(),
  dueDate: storedDate,
  birthDate: storedDate,
  birthTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  avatar: imageReferenceSchema.optional(),
  reminderEnabled: z.boolean().optional(),
  trackingUntilAge: z.number().int().min(2).max(100).optional(),
  privacy: z.literal("FAMILY_ONLY").optional(),
  dueReminderSnoozedUntil: storedDate,
});

export const persistedEventSchema = eventSchema
  .extend({
    id: identifierSchema,
    childId: identifierSchema,
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    images: z.array(imageReferenceSchema).max(3),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .refine(
    (event) => Date.parse(event.updatedAt) >= Date.parse(event.createdAt),
    {
      path: ["updatedAt"],
      message: "Ngày cập nhật phải sau ngày tạo.",
    },
  );

export const persistedMilestoneSchema = z
  .object({
    id: identifierSchema,
    childId: identifierSchema,
    key: identifierSchema,
    title: z.string().trim().min(1).max(120),
    kind: z.enum([
      "due",
      "full-month",
      "first-birthday",
      "birthday",
      "development",
      "custom",
    ]),
    state: z.enum([
      "SUGGESTED",
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "COMPLETED",
      "SKIPPED",
    ]),
    suggestedDate: storedDate,
    confirmedDate: storedDate,
    ceremonyDate: storedDate,
    needsDateConfirmation: z.boolean(),
    description: z.string().max(5000),
    age: z.number().int().min(0).max(100).optional(),
    eventId: identifierSchema.optional(),
  })
  .refine(
    (milestone) =>
      milestone.state !== "CONFIRMED" ||
      !!milestone.confirmedDate ||
      !!milestone.ceremonyDate,
    {
      path: ["confirmedDate"],
      message: "Cột mốc đã xác nhận cần có ngày được gia đình chọn.",
    },
  );

export const demoDataSchema = z
  .object({
    children: z.array(persistedChildSchema).min(1).max(100),
    events: z.array(persistedEventSchema).max(50_000),
    activeChildId: identifierSchema,
    milestones: z.array(persistedMilestoneSchema).max(10_000).optional(),
  })
  .superRefine((data, context) => {
    const children = new Set(data.children.map((child) => child.id));
    if (children.size !== data.children.length)
      context.addIssue({
        code: "custom",
        path: ["children"],
        message: "Hồ sơ bé bị trùng mã.",
      });
    if (!children.has(data.activeChildId))
      context.addIssue({
        code: "custom",
        path: ["activeChildId"],
        message: "Không tìm thấy hồ sơ bé đang chọn.",
      });
    for (const [collection, entries] of [
      ["events", data.events],
      ["milestones", data.milestones ?? []],
    ] as const) {
      const ids = new Set<string>();
      entries.forEach((entry, index) => {
        if (!children.has(entry.childId))
          context.addIssue({
            code: "custom",
            path: [collection, index, "childId"],
            message: "Dữ liệu tham chiếu tới hồ sơ bé không tồn tại.",
          });
        if (ids.has(entry.id))
          context.addIssue({
            code: "custom",
            path: [collection, index, "id"],
            message: "Dữ liệu bị trùng mã.",
          });
        ids.add(entry.id);
      });
    }
    const milestoneKeys = new Set<string>();
    (data.milestones ?? []).forEach((milestone, index) => {
      const key = `${milestone.childId}:${milestone.key}`;
      if (milestoneKeys.has(key))
        context.addIssue({
          code: "custom",
          path: ["milestones", index, "key"],
          message: "Cột mốc của bé bị trùng.",
        });
      milestoneKeys.add(key);
      if (
        milestone.eventId &&
        !data.events.some(
          (event) =>
            event.id === milestone.eventId &&
            event.childId === milestone.childId &&
            event.type === "milestone",
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["milestones", index, "eventId"],
          message: "Sự kiện cột mốc không thuộc cùng hồ sơ bé.",
        });
      }
    });
  });

export function parseDemoData(value: unknown): DemoData {
  return demoDataSchema.parse(value);
}

export const customMilestoneSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Tên cột mốc cần ít nhất 2 ký tự.")
    .max(120, "Tên cột mốc tối đa 120 ký tự."),
  description: z.string().trim().max(5000, "Ghi chú tối đa 5.000 ký tự."),
  date: z
    .string()
    .refine(
      (value) => !value || isDateOnly(value),
      "Vui lòng chọn ngày hợp lệ.",
    ),
});
export type CustomMilestoneInput = z.infer<typeof customMilestoneSchema>;
