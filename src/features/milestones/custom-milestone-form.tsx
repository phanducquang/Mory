"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  customMilestoneSchema,
  type CustomMilestoneInput,
} from "@/lib/validation";
export function CustomMilestoneForm({
  onSave,
  onClose,
}: {
  onSave: (input: CustomMilestoneInput) => void;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomMilestoneInput>({
    resolver: zodResolver(customMilestoneSchema),
    defaultValues: { title: "", description: "", date: "" },
  });
  const [error, setError] = useState("");
  return (
    <form
      className="form-stack"
      noValidate
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSave(values);
        } catch (e) {
          setError((e as Error).message);
        }
      })}
    >
      <p className="form-help">
        Mỗi bé lớn lên theo nhịp riêng. Bạn có thể để trống ngày; đây không phải
        thời hạn con cần đạt được.
      </p>
      <label className="form-field">
        <span className="form-label">Tên cột mốc</span>
        <input
          className="form-input"
          {...register("title")}
          maxLength={120}
          placeholder="Ví dụ: Bước chân đầu tiên"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "custom-title-error" : undefined}
        />
      </label>
      {errors.title && (
        <p id="custom-title-error" className="form-error" role="alert">
          {errors.title.message}
        </p>
      )}
      <label className="form-field">
        <span className="form-label">
          Ngày diễn ra <span className="form-optional">(tùy chọn)</span>
        </span>
        <input
          className="form-input"
          type="date"
          {...register("date")}
          aria-invalid={!!errors.date}
        />
      </label>
      {errors.date && (
        <p className="form-error" role="alert">
          {errors.date.message}
        </p>
      )}
      <label className="form-field">
        <span className="form-label">Ghi chú cho cột mốc</span>
        <textarea
          className="form-textarea"
          {...register("description")}
          maxLength={5000}
        />
      </label>
      {errors.description && (
        <p className="form-error" role="alert">
          {errors.description.message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          className="button button-secondary"
          type="button"
          onClick={onClose}
        >
          Hủy
        </button>
        <button
          className="button button-primary"
          type="submit"
          disabled={isSubmitting}
        >
          Lưu cột mốc
        </button>
      </div>
    </form>
  );
}
