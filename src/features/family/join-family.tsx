"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination -- Joining changes family authority and must discard the previous family's client state. */
import { useEffect, useId, useRef, useState } from "react";
import { acceptFamilyInvitation, previewFamilyInvitation } from "@/app/actions/family-sharing";

export function JoinFamily() {
  const id = useId(); const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ familyName: string; inviterName: string; role: string; expiresAt: string }>();
  const [token, setToken] = useState("");
  useEffect(() => {
    const value = window.location.hash.slice(1);
    if (value && input.current) { input.current.value = value; window.history.replaceState(null, "", window.location.pathname); }
  }, []);
  return <div className="form-stack">
    <form className="form-stack" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(""); setPreview(undefined);
      let value = input.current?.value.trim() ?? "";
      if (value.includes("#")) value = value.slice(value.lastIndexOf("#") + 1);
      try {
        const result = await previewFamilyInvitation(value);
        if (!result.ok) throw new Error(result.error);
        setToken(value); setPreview(result.data);
      } catch (err) { setError(err instanceof Error ? err.message : "Chưa mở được lời mời."); }
      finally { setBusy(false); }
    }}>
      <label className="form-field" htmlFor={`${id}-code`}><span className="form-label">Mã hoặc liên kết mời</span>
        <input id={`${id}-code`} ref={input} className="form-input" required maxLength={2048} autoComplete="off" spellCheck={false} disabled={busy} onChange={() => setPreview(undefined)} />
      </label>
      <button className="button button-secondary" disabled={busy} aria-busy={busy}>{busy ? "Đang kiểm tra…" : "Xem lời mời"}</button>
    </form>
    {preview && <section className="family-preview" aria-label="Thông tin lời mời">
      <h2>{preview.familyName}</h2>
      <p>{preview.inviterName} mời bạn tham gia với quyền <strong>{preview.role === "PARENT" ? "Bố/mẹ · xem và ghi sự kiện" : "Chỉ xem"}</strong>.</p>
      <p>Hết hạn: {new Date(preview.expiresAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} (giờ Việt Nam).</p>
      <button className="button button-primary" disabled={busy} aria-busy={busy} onClick={async () => {
        setBusy(true); setError("");
        try { const result = await acceptFamilyInvitation(token); if (!result.ok) throw new Error(result.error); window.location.assign("/home"); }
        catch (err) { setPreview(undefined); setError(err instanceof Error ? err.message : "Chưa tham gia được gia đình."); setBusy(false); }
      }}>Xác nhận tham gia</button>
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
