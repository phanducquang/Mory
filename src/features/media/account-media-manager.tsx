"use client";
import { useId, useState } from "react";
import { useJourney } from "@/features/app/journey-provider";
import { ImagePlus, ImageOff } from "lucide-react";
import { EventPhotoGallery } from "./event-photo-gallery";

export function AccountMediaManager({ purpose, targetId, images, eventTitle = "Kỷ niệm" }: { purpose: "event" | "avatar"; targetId: string; images: string[]; eventTitle?: string }) {
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
  const fileInput = <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy || (purpose === "event" && images.length >= 12)} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        if (!file.size || file.size > 8 * 1024 * 1024) { setError("Chọn ảnh có dung lượng từ 1 byte đến 8 MB."); return; }
        void mutate(`/api/media/${purpose}/${targetId}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      }} />;
  const help = <p className="form-help media-help">Chỉ thành viên gia đình được xem. JPEG, PNG, WebP hoặc AVIF tĩnh, tối đa 8 MB/ảnh. Ảnh được tối ưu và bỏ metadata, gồm vị trí GPS.</p>;
  return <section className={`settings-card media-manager${purpose === "event" ? " event-media-manager" : ""}`} aria-label={purpose === "event" ? "Ảnh của kỷ niệm" : "Ảnh đại diện của bé"}>
    <div className="media-heading">
      <h2>{purpose === "event" ? `Ảnh của kỷ niệm (${images.length}/12)` : "Ảnh đại diện của bé"}</h2>
      {purpose === "event" && canWrite && <label className={`photo-upload-control${busy || images.length >= 12 ? " is-disabled" : ""}`} htmlFor={inputId}><ImagePlus size={18} aria-hidden="true" /><span>Thêm ảnh</span>{fileInput}</label>}
    </div>
    {purpose === "event" && (images.length ? <EventPhotoGallery images={images} title={eventTitle} busy={busy} onRemove={canWrite ? url => { void mutate(url, { method: "DELETE" }); } : undefined} /> : <div className="photo-empty"><ImageOff size={32} aria-hidden="true" /><strong>Chưa có ảnh cho kỷ niệm này</strong><span>{canWrite ? "Thêm một khoảnh khắc để câu chuyện trọn vẹn hơn." : "Ảnh gia đình lưu sẽ xuất hiện tại đây."}</span></div>)}
    {help}
    {purpose === "avatar" && canWrite && <>
      <label className="form-field" htmlFor={inputId}>{images.length ? "Thay ảnh đại diện" : "Thêm ảnh"}</label>
      {fileInput}
      {images.length > 0 && <div className="media-remove-list">{images.map(url => <button key={url} className="button button-secondary" disabled={busy} onClick={() => { void mutate(url, { method: "DELETE" }); }}>Xóa ảnh đại diện</button>)}</div>}
    </>}
    {busy && <p role="status">Đang xử lý ảnh…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
