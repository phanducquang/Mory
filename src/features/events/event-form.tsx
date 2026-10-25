"use client";

import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bell, ImagePlus, LoaderCircle, X } from "lucide-react";
import { isDateOnly, todayVN } from "@/lib/dates";
import { eventSchema as sharedEventSchema } from "@/lib/validation";
import type { Event } from "@/types/domain";

const eventSchema = sharedEventSchema
  .pick({ title: true, date: true, type: true, description: true })
  .extend({
    date: z.string().refine(isDateOnly, "Bạn hãy chọn ngày diễn ra hợp lệ."),
    time: z
      .string()
      .refine(
        (value) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
        "Giờ diễn ra chưa hợp lệ.",
      ),
    reminder: z.boolean(),
  });

type EventValues = z.infer<typeof eventSchema>;

async function readImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.");
  }
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Mỗi ảnh cần nhỏ hơn hoặc bằng 2 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png =
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    );
  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const webp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(
    (file.type === "image/png" && png) ||
    (file.type === "image/jpeg" && jpeg) ||
    (file.type === "image/webp" && webp)
  )) {
    throw new Error(
      "Nội dung ảnh không khớp định dạng. Bạn hãy chọn một ảnh khác.",
    );
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Không thể đọc ảnh này."));
    reader.onerror = () =>
      reject(new Error("Không thể đọc ảnh này. Bạn hãy thử lại."));
    reader.readAsDataURL(file);
  });
}

export function EventForm({
  event,
  onSave,
  onClose,
  childId,
  imageMode = "local",
  remindersAvailable = false,
}: {
  event?: Event;
  onSave: (event: Event) => void;
  onClose: () => void;
  childId: string;
  imageMode?: "local" | "after-save" | "disabled";
  remindersAvailable?: boolean;
}) {
  const formId = useId();
  const [images, setImages] = useState<string[]>(event?.images ?? []);
  const [uploadError, setUploadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [uploading, setUploading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EventValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: event?.title ?? "",
      date: event?.date ?? todayVN(),
      time: event?.time ?? "",
      type: event?.type ?? "memory",
      description: event?.description ?? "",
      reminder: event?.reminder ?? false,
    },
  });

  async function save(values: EventValues) {
    setSaveError("");
    const timestamp = new Date().toISOString();
    try {
      await onSave({
        ...event,
        id: event?.id ?? crypto.randomUUID(),
        childId,
        title: values.title,
        date: values.date,
        time: values.time || undefined,
        type: values.type,
        description: values.description,
        images,
        reminder: values.reminder,
        createdAt: event?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Chưa thể lưu sự kiện. Bạn hãy thử lại.",
      );
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit(save)} noValidate>
      <div className="form-field">
        <label className="form-label" htmlFor={`${formId}-title`}>
          Tên sự kiện <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${formId}-title`}
          className="form-input"
          placeholder="Một điều thật đáng nhớ…"
          maxLength={120}
          required
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? `${formId}-title-error` : undefined}
          {...register("title")}
        />
        {errors.title && (
          <p id={`${formId}-title-error`} className="form-error" role="alert">
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="form-grid">
        <div className="form-field">
          <label className="form-label" htmlFor={`${formId}-date`}>
            Ngày diễn ra <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-date`}
            type="date"
            min="1900-01-01"
            max="2200-12-31"
            className="form-input"
            required
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? `${formId}-date-error` : undefined}
            {...register("date")}
          />
          {errors.date && (
            <p id={`${formId}-date-error`} className="form-error" role="alert">
              {errors.date.message}
            </p>
          )}
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor={`${formId}-time`}>
            Giờ diễn ra <span className="form-optional">(tùy chọn)</span>
          </label>
          <input
            id={`${formId}-time`}
            type="time"
            className="form-input"
            aria-invalid={!!errors.time}
            aria-describedby={errors.time ? `${formId}-time-error` : undefined}
            {...register("time")}
          />
          {errors.time && (
            <p id={`${formId}-time-error`} className="form-error" role="alert">
              {errors.time.message}
            </p>
          )}
        </div>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor={`${formId}-type`}>
          Loại sự kiện
        </label>
        <select
          id={`${formId}-type`}
          className="form-select"
          aria-invalid={!!errors.type}
          aria-describedby={errors.type ? `${formId}-type-error` : undefined}
          {...register("type")}
        >
          <option value="memory">Kỷ niệm</option>
          <option value="milestone">Cột mốc</option>
          <option value="health">Sức khỏe</option>
          <option value="activity">Hoạt động</option>
        </select>
        {errors.type && (
          <p id={`${formId}-type-error`} className="form-error" role="alert">
            Bạn hãy chọn loại sự kiện hợp lệ.
          </p>
        )}
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor={`${formId}-description`}>
          Câu chuyện của bạn <span className="form-optional">(tùy chọn)</span>
        </label>
        <textarea
          id={`${formId}-description`}
          rows={4}
          className="form-textarea"
          placeholder="Lưu lại những cảm xúc, những chi tiết nhỏ mà bạn muốn nhớ mãi…"
          maxLength={5000}
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description ? `${formId}-description-error` : undefined
          }
          {...register("description")}
        />
        {errors.description && (
          <p
            id={`${formId}-description-error`}
            className="form-error"
            role="alert"
          >
            {errors.description.message}
          </p>
        )}
      </div>

      {imageMode === "local" ? <div className="form-field">
        <label className="form-label" htmlFor={`${formId}-images`}>
          Hình ảnh <span className="form-optional">(tùy chọn)</span>
        </label>
        {images.length > 0 && (
          <div className="upload-preview-grid">
            {images.map((source, index) => (
              <div
                className="upload-preview"
                key={`${index}-${source.slice(-24)}`}
              >
                {/* User-selected data URLs are stored locally in the demo. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={source} alt={`Ảnh sự kiện ${index + 1}`} />
                <button
                  type="button"
                  className="upload-remove"
                  aria-label={`Xóa ảnh ${index + 1}`}
                  onClick={() =>
                    setImages((current) =>
                      current.filter((_, imageIndex) => imageIndex !== index),
                    )
                  }
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="upload-zone" htmlFor={`${formId}-images`}>
          {uploading ? (
            <LoaderCircle
              size={22}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <ImagePlus size={22} aria-hidden="true" />
          )}
          <span>
            {uploading
              ? "Đang đọc ảnh…"
              : images.length >= 3
                ? "Đã chọn đủ 3 ảnh"
                : "Chọn ảnh kỷ niệm"}
          </span>
          <input
            id={`${formId}-images`}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading || images.length >= 3}
            aria-describedby={`${formId}-images-help${uploadError ? ` ${formId}-images-error` : ""}`}
            aria-invalid={!!uploadError}
            onChange={async (changeEvent) => {
              const input = changeEvent.currentTarget;
              const files = Array.from(input.files ?? []);
              if (!files.length) return;
              setUploadError("");
              if (images.length + files.length > 3) {
                setUploadError(
                  "Mỗi sự kiện có tối đa 3 ảnh. Bạn hãy chọn ít ảnh hơn.",
                );
                input.value = "";
                return;
              }
              setUploading(true);
              try {
                const addedImages = await Promise.all(files.map(readImage));
                setImages((current) =>
                  [...current, ...addedImages].slice(0, 3),
                );
              } catch (error) {
                setUploadError(
                  error instanceof Error
                    ? error.message
                    : "Không thể đọc ảnh. Bạn hãy thử lại.",
                );
              } finally {
                setUploading(false);
                input.value = "";
              }
            }}
          />
        </label>
        <p className="form-help" id={`${formId}-images-help`}>
          Tối đa 3 ảnh JPG, PNG hoặc WEBP · 2 MB mỗi ảnh.
        </p>
        {uploadError && (
          <p id={`${formId}-images-error`} className="form-error" role="alert">
            {uploadError}
          </p>
        )}
      </div>

      : <p className="form-help">{imageMode === "after-save"
        ? event ? "Thêm hoặc xóa ảnh trong trang chi tiết sự kiện." : "Lưu sự kiện để mở trang chi tiết và thêm ảnh."
        : "Tính năng ảnh chưa được bật trên máy chủ này."}</p>}

      <div className="reminder-note">
        <label className="checkbox-row" htmlFor={`${formId}-reminder`}>
          <input
            id={`${formId}-reminder`}
            type="checkbox"
            {...register("reminder")}
          />
          <Bell size={17} aria-hidden="true" />
          <span>Ghi nhớ nhắc nhở cho sự kiện này</span>
        </label>
        <p className="form-help">
          {remindersAvailable ? "Nhắc trước 24 giờ theo giờ Việt Nam (09:00 nếu chưa chọn giờ). Người nhận cần bật email nhắc lịch trong Cài đặt." : "Mory hiện chỉ lưu cấu hình nhắc nhở; gửi email cần được bật cho tài khoản và máy chủ."}
        </p>
      </div>

      {saveError && (
        <p className="form-error" role="alert">
          {saveError}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={onClose}
        >
          Hủy
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={isSubmitting || uploading}
        >
          {isSubmitting && (
            <LoaderCircle
              size={17}
              className="animate-spin"
              aria-hidden="true"
            />
          )}
          {event ? "Lưu thay đổi" : "Lưu kỷ niệm"}
        </button>
      </div>
    </form>
  );
}
