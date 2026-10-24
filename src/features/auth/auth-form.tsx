"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Sprout } from "lucide-react";

const inputSchema = z.object({
  name: z.string().trim().max(120), email: z.email("Email chưa hợp lệ.").max(320),
  password: z.string().min(12, "Mật khẩu cần ít nhất 12 ký tự.").max(128),
});
export function AuthForm({ registerAccount = false, allowSignup, emailEnabled = false }: { registerAccount?: boolean; allowSignup: boolean; emailEnabled?: boolean }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const fieldId = useId();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof inputSchema>>({ resolver: zodResolver(inputSchema), defaultValues: { name: "", email: "", password: "" } });
  return <main className="auth-page"><div className="auth-card">
    <Link href="/" className="brand"><Sprout /> mory.</Link>
    <h1>{registerAccount ? "Bắt đầu câu chuyện gia đình" : "Trở về tổ ấm"}</h1>
    <p>{registerAccount ? "Tạo tài khoản riêng để lưu hành trình của con." : "Đăng nhập để mở những kỷ niệm của gia đình."}</p>
    {sent ? <><p role="status">Nếu tài khoản cần xác minh, thư sẽ được gửi tới email đã nhập. Hãy kiểm tra hộp thư và thư rác.</p><p><Link href="/verify-email">Gửi lại thư xác minh</Link></p><Link href="/login">Trở về đăng nhập</Link></> : <form className="form-stack" onSubmit={handleSubmit(async (values) => {
      setError("");
      if (registerAccount && !values.name) { setError("Vui lòng nhập tên của bạn."); return; }
      try {
        const response = await fetch(`/api/auth/${registerAccount ? "sign-up" : "sign-in"}/email`, {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
          body: JSON.stringify({ ...values, email: values.email.trim().toLowerCase() }),
        });
        if (!response.ok) { setError(response.status === 429 ? "Bạn thử quá nhiều lần. Vui lòng chờ một phút." : registerAccount ? "Chưa thể tạo tài khoản. Kiểm tra thông tin hoặc thử đăng nhập." : response.status === 403 && emailEnabled ? "Email chưa được xác minh. Hãy yêu cầu gửi lại thư xác minh." : "Email hoặc mật khẩu chưa đúng."); return; }
        if (registerAccount && emailEnabled) { reset(); setSent(true); return; }
        // Full navigation clears every previous account's client state.
        window.location.assign(registerAccount ? "/welcome" : "/home");
      } catch { setError("Chưa kết nối được máy chủ. Vui lòng thử lại."); }
    })} noValidate>
      {registerAccount && <label className="form-field"><span className="form-label">Tên của bạn</span><input className="form-input" autoComplete="name" maxLength={120} {...register("name")} required /></label>}
      <label className="form-field"><span className="form-label">Email</span><input className="form-input" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? `${fieldId}-email-error` : undefined} {...register("email")} required /></label>
      {errors.email && <p className="form-error" role="alert" id={`${fieldId}-email-error`}>{errors.email.message}</p>}
      <label className="form-field"><span className="form-label">Mật khẩu</span><input className="form-input" type="password" autoComplete={registerAccount ? "new-password" : "current-password"} aria-invalid={!!errors.password} aria-describedby={errors.password ? `${fieldId}-password-error` : registerAccount ? `${fieldId}-password-help` : undefined} {...register("password")} required /></label>
      {errors.password && <p className="form-error" role="alert" id={`${fieldId}-password-error`}>{errors.password.message}</p>}
      {registerAccount && <p className="form-help" id={`${fieldId}-password-help`}>{errors.password ? "" : "Dùng ít nhất 12 ký tự. "}{emailEnabled ? "Xác minh email trước khi đăng nhập. Bạn có thể đặt lại mật khẩu qua email." : "Bạn có thể đăng ký và đăng nhập ngay. Gửi email xác minh và khôi phục mật khẩu hiện chưa được bật."}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary" disabled={isSubmitting || (registerAccount && !allowSignup)}>{isSubmitting ? "Đang kết nối…" : registerAccount ? "Tạo tài khoản" : "Đăng nhập"}</button>
    </form>}
    {emailEnabled && !sent && <p><Link href="/forgot-password">Quên mật khẩu?</Link> · <Link href="/verify-email">Gửi lại thư xác minh</Link></p>}
    {allowSignup && <p>{registerAccount ? <Link href="/login">Đã có tài khoản? Đăng nhập</Link> : <Link href="/register">Tạo tài khoản gia đình</Link>}</p>}
  </div></main>;
}
