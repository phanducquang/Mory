"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

async function authPost(path: string, body: unknown) {
  const response = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(response.status === 429 ? "Bạn thử quá nhiều lần. Vui lòng chờ một phút." : "Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu gửi lại.");
}
export function EmailRequestForm({ purpose }: { purpose: "VERIFY" | "RESET" }) {
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [sent, setSent] = useState(false);
  return <>
    <p>{purpose === "RESET" ? "Nhập email để nhận liên kết đặt lại mật khẩu." : "Kiểm tra hộp thư để xác minh email trước khi đăng nhập. Bạn cũng có thể yêu cầu gửi lại thư."}</p>
    <form className="form-stack" onSubmit={async (event) => {
      event.preventDefault(); setError("");
      const input = z.email().max(320).safeParse(email.trim().toLowerCase());
      if (!input.success) { setError("Email chưa hợp lệ."); return; }
      setBusy(true);
      try { await authPost(purpose === "RESET" ? "request-password-reset" : "send-verification-email", { email: input.data }); setSent(true); setEmail(""); }
      catch (err) { setError(err instanceof Error ? err.message : "Chưa thể gửi yêu cầu."); }
      finally { setBusy(false); }
    }}>
      <label className="form-field"><span className="form-label">Email</span><input className="form-input" type="email" autoComplete="email" maxLength={320} required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <button className="button button-primary" disabled={busy}>{busy ? "Đang gửi yêu cầu…" : purpose === "RESET" ? "Gửi liên kết đặt lại mật khẩu" : "Gửi lại thư xác minh"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
      {sent && <p role="status">Nếu tài khoản phù hợp tồn tại, thư sẽ được gửi tới email đó. Hãy kiểm tra cả thư rác. Mỗi email nhận tối đa một thư mỗi phút.</p>}
    </form>
    <p><Link href="/login">Trở về đăng nhập</Link></p>
  </>;
}
/** Bearer tokens stay in component memory; fragments never reach HTTP logs/referrers. */
export function EmailLinkForm({ purpose }: { purpose: "VERIFY" | "RESET" }) {
  const token = useRef(""); const [hasToken, setHasToken] = useState(false); const [ready, setReady] = useState(false);
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);
  useEffect(() => {
    let frame = 0;
    function capture(initial = false) {
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (value && value.length <= 2048) token.current = value;
      else if (!initial || window.location.hash) token.current = "";
      window.history.replaceState(null, "", window.location.pathname);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { setHasToken(!!token.current); setReady(true); setDone(false); setError(""); setPassword(""); setConfirmation(""); });
    }
    const changed = () => capture();
    capture(true); window.addEventListener("hashchange", changed);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", changed); };
  }, []);
  if (!ready) return <p role="status">Đang mở liên kết…</p>;
  if (done) return <><p role="status">{purpose === "RESET" ? "Đã đặt lại mật khẩu và đăng xuất các phiên trước đó. Hãy đăng nhập bằng mật khẩu mới." : "Đã xác minh email. Bạn có thể đăng nhập."}</p><Link className="button button-primary" href="/login">Đăng nhập</Link></>;
  if (!hasToken) return purpose === "VERIFY" ? <EmailRequestForm purpose="VERIFY" /> : <><p role="alert">Liên kết không hợp lệ hoặc đã hết hạn.</p><Link href="/forgot-password">Yêu cầu liên kết mới</Link></>;
  return <form className="form-stack" onSubmit={async (event) => {
    event.preventDefault(); setError("");
    if (purpose === "RESET" && (password.length < 12 || password.length > 128 || password !== confirmation)) {
      setError("Mật khẩu cần từ 12 đến 128 ký tự và hai lần nhập phải giống nhau."); return;
    }
    setBusy(true); const activeToken = token.current;
    try {
      await authPost(purpose === "VERIFY" ? "verify-email" : "reset-password", purpose === "VERIFY" ? { token: token.current } : { token: token.current, newPassword: password });
      if (token.current !== activeToken) return;
      token.current = ""; setPassword(""); setConfirmation(""); setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Chưa thể xác nhận liên kết."); }
    finally { setBusy(false); }
  }}>
    <p>{purpose === "VERIFY" ? "Bấm xác nhận để xác minh địa chỉ email của bạn. Thao tác này không tự đăng nhập." : "Chọn mật khẩu mới từ 12 đến 128 ký tự. Các phiên đăng nhập trước đó sẽ được thu hồi."}</p>
    {purpose === "RESET" && <>
      <label className="form-field"><span className="form-label">Mật khẩu mới</span><input className="form-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label className="form-field"><span className="form-label">Nhập lại mật khẩu mới</span><input className="form-input" type="password" autoComplete="new-password" maxLength={128} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
    </>}
    <button className="button button-primary" disabled={busy}>{busy ? "Đang xác nhận…" : purpose === "VERIFY" ? "Xác minh email" : "Đặt lại mật khẩu"}</button>
    {error && <><p className="form-error" role="alert">{error}</p><Link href={purpose === "VERIFY" ? "/verify-email" : "/forgot-password"}>Yêu cầu liên kết mới</Link></>}
  </form>;
}
