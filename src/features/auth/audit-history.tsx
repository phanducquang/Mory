"use client";
import { useState } from "react";
import { readAudit } from "@/app/actions/audit";
import { useJourney } from "@/features/app/journey-provider";
type Page = Awaited<ReturnType<typeof readAudit>>;
const labels: Record<string, string> = { Family: "gia đình", FamilyMember: "thành viên", Child: "hồ sơ bé", Event: "sự kiện", ChildMilestone: "cột mốc", MediaAsset: "ảnh" };
const actions: Record<string, string> = { INSERT: "Tạo", UPDATE: "Cập nhật", DELETE: "Xóa" };
export function AuditHistory() {
  const { canWrite } = useJourney(); const [entries, setEntries] = useState<Page["entries"]>([]); const [next, setNext] = useState<string>();
  const [opened, setOpened] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!canWrite) return null;
  return <section className="settings-card"><h2>Hoạt động của gia đình</h2><p>Lịch sử chỉ ghi loại thay đổi và thời gian, không ghi nội dung kỷ niệm, ngày sinh hoặc ảnh. Metadata được giữ tối đa 90 ngày.</p>
    <ul className="audit-list">{entries.map((item) => <li key={item.id}><strong>{actions[item.action] ?? "Thay đổi"} {labels[item.resourceKind] ?? "dữ liệu"}</strong><br /><small>{item.actor} · {new Date(item.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</small></li>)}</ul>
    {(!opened || next) && <button className="button button-secondary" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { const page = await readAudit(opened ? next : undefined); setEntries((values) => opened ? [...values, ...page.entries] : page.entries); setNext(page.nextCursor); setOpened(true); }
      catch { setError("Chưa đọc được lịch sử. Vui lòng tải lại."); }
      finally { setBusy(false); }
    }}>{busy ? "Đang đọc…" : opened ? "Xem thêm hoạt động" : "Xem hoạt động gia đình"}</button>}
    {opened && !entries.length && <p>Chưa có hoạt động được ghi nhận.</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
