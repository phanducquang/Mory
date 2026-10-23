"use client";
import { useState } from "react";
import { useJourney } from "@/features/app/journey-provider";
export function NotificationSettings() {
  const { remindersEnabled, notificationsEnabled, saveNotifications } = useJourney();
  const [checked, setChecked] = useState(!!notificationsEnabled);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  return <section className="settings-card">
    <h2>Nhắc lịch qua email</h2>
    <p>Mỗi người tự chọn nhận thư. Mory nhắc trước sự kiện 24 giờ, theo giờ Việt Nam; sự kiện chỉ có ngày dùng 09:00. Nếu bật muộn, thư có thể đến trước giờ diễn ra.</p>
    <p className="form-help">Chỉ gửi cho sự kiện đã lưu và được bật nhắc, khi hồ sơ vẫn đang theo dõi. Không gửi cho ngày cột mốc chưa xác nhận. Thư không chứa tên bé hoặc nội dung kỷ niệm.</p>
    {remindersEnabled ? <label className="checkbox-row"><input type="checkbox" checked={checked} disabled={busy} onChange={async (e) => {
      const previous = checked; const next = e.target.checked; setChecked(next);
      setBusy(true); setError(""); setMessage("");
      try { await saveNotifications?.(next); setMessage("Đã lưu lựa chọn nhắc lịch của bạn."); }
      catch { setChecked(previous); setError("Chưa lưu được lựa chọn. Vui lòng thử lại."); }
      finally { setBusy(false); }
    }} />Nhận nhắc lịch qua email của tôi</label> : <p>Nhắc lịch qua email chưa được bật trên máy chủ này.</p>}
    {message && <p role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
