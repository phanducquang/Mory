"use client";

import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Baby, Camera, Heart, LoaderCircle, X } from "lucide-react";
import { isDateOnly, todayVN } from "@/lib/dates";
import type { Child } from "@/types/domain";

const childSchema = z
  .object({
    lifecycle: z.enum(["EXPECTING", "AFTER_BIRTH"]),
    name: z.string().trim().max(80, "Tên bé tối đa 80 ký tự."),
    dueDate: z.string(),
    birthDate: z.string(),
    birthTime: z
      .string()
      .refine(
        (value) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
        "Giờ sinh chưa hợp lệ.",
      ),
    gender: z.enum(["", "female", "male", "other", "unspecified"]),
  })
  .superRefine((values, context) => {
    if (values.lifecycle === "EXPECTING") {
      if (!isDateOnly(values.dueDate))
        context.addIssue({
          code: "custom",
          path: ["dueDate"],
          message: "Bạn hãy chọn ngày dự sinh hợp lệ.",
        });
    } else {
      if (!values.name)
        context.addIssue({
          code: "custom",
          path: ["name"],
          message: "Bạn hãy nhập tên của bé.",
        });
      if (!isDateOnly(values.birthDate)) {
        context.addIssue({
          code: "custom",
          path: ["birthDate"],
          message: "Bạn hãy chọn ngày sinh hợp lệ.",
        });
      } else if (values.birthDate > todayVN()) {
        context.addIssue({
          code: "custom",
          path: ["birthDate"],
          message: "Ngày sinh không thể ở tương lai.",
        });
      }
    }
  });

type ChildValues = z.infer<typeof childSchema>;

async function readAvatar(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.");
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Ảnh đại diện cần nhỏ hơn hoặc bằng 2 MB.");
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

export function ChildForm({
  child,
  onSave,
  onClose,
  mediaEnabled = true,
}: {
  child?: Child;
  onSave: (child: Child) => void;
  onClose?: () => void;
  mediaEnabled?: boolean;
}) {
  const formId = useId();
  const [avatar, setAvatar] = useState(child?.avatar ?? "");
  const [uploadError, setUploadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [uploading, setUploading] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ChildValues>({
    resolver: zodResolver(childSchema),
    defaultValues: {
      lifecycle:
        child?.lifecycle === "AFTER_BIRTH" || child?.birthDate
          ? "AFTER_BIRTH"
          : "EXPECTING",
      name: child?.name ?? "",
      dueDate: child?.dueDate ?? "",
      birthDate: child?.birthDate ?? "",
      birthTime: child?.birthTime ?? "",
      gender: child?.gender ?? "",
    },
  });
  const lifecycle = useWatch({ control, name: "lifecycle" });

  async function save(values: ChildValues) {
    setSaveError("");
    try {
      await onSave({
        ...child,
        id: child?.id ?? crypto.randomUUID(),
        name: values.name || "Bé yêu",
        lifecycle:
          child?.lifecycle === "PAUSED" || child?.lifecycle === "ENDED"
            ? child.lifecycle
            : values.lifecycle,
        dueDate: isDateOnly(values.dueDate) ? values.dueDate : child?.dueDate,
        birthDate:
          values.lifecycle === "AFTER_BIRTH"
            ? values.birthDate
            : child?.birthDate,
        birthTime:
          values.lifecycle === "AFTER_BIRTH"
            ? values.birthTime || undefined
            : child?.birthTime,
        gender: values.gender || undefined,
        avatar: avatar || undefined,
        privacy: "FAMILY_ONLY",
      });
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Chưa thể lưu hồ sơ của bé. Bạn hãy thử lại.",
      );
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit(save)} noValidate>
      <fieldset className="form-fieldset">
        <legend className="form-legend">Hành trình của gia đình mình</legend>
        <div className="segmented-options">
          <label
            className={`segment${lifecycle === "EXPECTING" ? " is-selected" : ""}${child?.birthDate ? " is-disabled" : ""}`}
          >
            <input
              type="radio"
              value="EXPECTING"
              disabled={!!child?.birthDate}
              {...register("lifecycle")}
            />
            <Heart size={21} aria-hidden="true" />
            <span>Bé chưa chào đời</span>
          </label>
          <label
            className={`segment${lifecycle === "AFTER_BIRTH" ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              value="AFTER_BIRTH"
              {...register("lifecycle")}
            />
            <Baby size={21} aria-hidden="true" />
            <span>Bé đã chào đời</span>
          </label>
        </div>
        {(child?.lifecycle === "PAUSED" || child?.lifecycle === "ENDED") && (
          <p className="form-help">
            Trạng thái theo dõi:{" "}
            {child.lifecycle === "PAUSED" ? "đang tạm dừng" : "đã kết thúc"}.
            Bạn có thể tiếp tục hành trình trong hồ sơ của bé.
          </p>
        )}
      </fieldset>

      <div className="form-field">
        <label className="form-label" htmlFor={`${formId}-name`}>
          {lifecycle === "EXPECTING" ? "Tên gọi của bé" : "Tên bé"}
          {lifecycle === "EXPECTING" ? (
            <span className="form-optional"> (tùy chọn)</span>
          ) : (
            <span aria-hidden="true"> *</span>
          )}
        </label>
        <input
          id={`${formId}-name`}
          className="form-input"
          placeholder={
            lifecycle === "EXPECTING"
              ? "Tên gọi thân thương ở nhà…"
              : "Nhập tên của bé"
          }
          maxLength={80}
          autoComplete="off"
          required={lifecycle === "AFTER_BIRTH"}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${formId}-name-error` : undefined}
          {...register("name")}
        />
        {errors.name && (
          <p id={`${formId}-name-error`} className="form-error" role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      {lifecycle === "EXPECTING" ? (
        <div className="form-field">
          <label className="form-label" htmlFor={`${formId}-dueDate`}>
            Ngày dự sinh <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-dueDate`}
            type="date"
            min="1900-01-01"
            max="2200-12-31"
            className="form-input"
            required
            aria-invalid={!!errors.dueDate}
            aria-describedby={`${formId}-dueDate-help${errors.dueDate ? ` ${formId}-dueDate-error` : ""}`}
            {...register("dueDate")}
          />
          <p id={`${formId}-dueDate-help`} className="form-help">
            Đây là ngày tham khảo. Bạn có thể cập nhật bất cứ lúc nào.
          </p>
          {errors.dueDate && (
            <p
              id={`${formId}-dueDate-error`}
              className="form-error"
              role="alert"
            >
              {errors.dueDate.message}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label" htmlFor={`${formId}-birthDate`}>
                Ngày sinh thực tế <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${formId}-birthDate`}
                type="date"
                min="1900-01-01"
                max={todayVN()}
                className="form-input"
                required
                aria-invalid={!!errors.birthDate}
                aria-describedby={
                  errors.birthDate ? `${formId}-birthDate-error` : undefined
                }
                {...register("birthDate")}
              />
              {errors.birthDate && (
                <p
                  id={`${formId}-birthDate-error`}
                  className="form-error"
                  role="alert"
                >
                  {errors.birthDate.message}
                </p>
              )}
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor={`${formId}-birthTime`}>
                Giờ sinh <span className="form-optional">(tùy chọn)</span>
              </label>
              <input
                id={`${formId}-birthTime`}
                type="time"
                className="form-input"
                aria-invalid={!!errors.birthTime}
                aria-describedby={
                  errors.birthTime ? `${formId}-birthTime-error` : undefined
                }
                {...register("birthTime")}
              />
              {errors.birthTime && (
                <p
                  id={`${formId}-birthTime-error`}
                  className="form-error"
                  role="alert"
                >
                  {errors.birthTime.message}
                </p>
              )}
            </div>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor={`${formId}-gender`}>
              Giới tính <span className="form-optional">(tùy chọn)</span>
            </label>
            <select
              id={`${formId}-gender`}
              className="form-select"
              aria-invalid={!!errors.gender}
              aria-describedby={
                errors.gender ? `${formId}-gender-error` : undefined
              }
              {...register("gender")}
            >
              <option value="">Chưa chọn</option>
              <option value="female">Bé gái</option>
              <option value="male">Bé trai</option>
              <option value="other">Khác</option>
              <option value="unspecified">Không chia sẻ</option>
            </select>
            {errors.gender && (
              <p
                id={`${formId}-gender-error`}
                className="form-error"
                role="alert"
              >
                Bạn hãy chọn một tùy chọn hợp lệ.
              </p>
            )}
          </div>
          {mediaEnabled ? <div className="form-field">
            <label className="form-label" htmlFor={`${formId}-avatar`}>
              Ảnh đại diện <span className="form-optional">(tùy chọn)</span>
            </label>
            <div className="avatar-upload">
              {avatar ? (
                <div className="avatar-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatar} alt="Ảnh đại diện của bé" />
                  <button
                    type="button"
                    className="upload-remove"
                    aria-label="Xóa ảnh đại diện"
                    onClick={() => setAvatar("")}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
              <label className="upload-zone" htmlFor={`${formId}-avatar`}>
                {uploading ? (
                  <LoaderCircle
                    size={22}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Camera size={22} aria-hidden="true" />
                )}
                <span>
                  {uploading
                    ? "Đang đọc ảnh…"
                    : avatar
                      ? "Đổi ảnh của bé"
                      : "Chọn ảnh của bé"}
                </span>
                <input
                  id={`${formId}-avatar`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  aria-describedby={`${formId}-avatar-help${uploadError ? ` ${formId}-avatar-error` : ""}`}
                  aria-invalid={!!uploadError}
                  onChange={async (changeEvent) => {
                    const input = changeEvent.currentTarget;
                    const file = input.files?.[0];
                    if (!file) return;
                    setUploadError("");
                    setUploading(true);
                    try {
                      setAvatar(await readAvatar(file));
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
            </div>
            <p className="form-help" id={`${formId}-avatar-help`}>
              Ảnh JPG, PNG hoặc WEBP · tối đa 2 MB.
            </p>
            {uploadError && (
              <p
                id={`${formId}-avatar-error`}
                className="form-error"
                role="alert"
              >
                {uploadError}
              </p>
            )}
          </div>
          : <p className="form-help">Sau khi lưu hồ sơ, bạn có thể quản lý ảnh đại diện trong trang hồ sơ khi tính năng ảnh của gia đình được bật.</p>}
        </>
      )}

      {saveError && (
        <p className="form-error" role="alert">
          {saveError}
        </p>
      )}
      <div className="form-actions">
        {onClose && (
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
          >
            Hủy
          </button>
        )}
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
          {child ? "Lưu hồ sơ" : "Bắt đầu hành trình"}
        </button>
      </div>
    </form>
  );
}
