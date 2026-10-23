"use client";
import { useId, useState } from "react";
import { useJourney } from "@/features/app/journey-provider";

export function AccountMediaManager({ purpose, targetId, images }: { purpose: "event" | "avatar"; targetId: string; images: string[] }) {
  const { mediaEnabled, canWrite, refreshMedia } = useJourney();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inputId = useId();
  if (!mediaEnabled) return null;
  async function mutate(url: string, options: RequestInit) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "Chưa thể lưu ảnh. Vui lòng thử lại.");
      }
      await refreshMedia?.(purpose === "event" ? targetId : undefined);
      setMessage(options.method === "DELETE" ? "Đã xóa ảnh." : "Đã lưu ảnh riêng tư cho gia đình.");
    } catch (err) { setError(err instanceof Error ? err.message : "Chưa thể lưu ảnh."); }
    finally { setBusy(false); }
  }
  return <section className="settings-card media-manager" aria-label={purpose === "event" ? "Ảnh của kỷ niệm" : "Ảnh đại diện của bé"}>
    <h2>{purpose === "event" ? `Ảnh của kỷ niệm (${images.length}/12)` : "Ảnh đại diện của bé"}</h2>
    <p className="form-help">Chỉ thành viên gia đình được xem. JPEG, PNG, WebP hoặc AVIF tĩnh, tối đa 8 MB/ảnh. Ảnh được tối ưu và bỏ metadata, gồm vị trí GPS.</p>
    {canWrite && <>
      <label className="form-field" htmlFor={inputId}>{purpose === "avatar" && images.length ? "Thay ảnh đại diện" : "Thêm ảnh"}</label>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy || (purpose === "event" && images.length >= 12)} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        if (!file.size || file.size > 8 * 1024 * 1024) { setError("Chọn ảnh có dung lượng từ 1 byte đến 8 MB."); return; }
        void mutate(`/api/media/${purpose}/${targetId}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      }} />
      {images.length > 0 && <div className="media-remove-list">{images.map((url, index) => <button key={url} className="button button-secondary" disabled={busy} onClick={() => { void mutate(url, { method: "DELETE" }); }}>
        {purpose === "avatar" ? "Xóa ảnh đại diện" : `Xóa ảnh ${index + 1}`}
      </button>)}</div>}
    </>}
    {busy && <p role="status">Đang xử lý ảnh…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
