"use client";
import { useState } from "react";
import { privacySummary, familyPrivacyMembers, requestAccountDeletion, requestFamilyDeletion, transferFamilyOwnership } from "@/app/actions/privacy";
export function PrivacyControls({ family = false }: { family?: boolean }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [owned, setOwned] = useState<{ id: string; name: string; members: number }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [shared, setShared] = useState(false); const [recipient, setRecipient] = useState("");
  async function load() {
    setBusy(true); setError("");
    try {
      if (family) { const result = await familyPrivacyMembers(); setMembers(result.members.filter((m) => m.id !== result.userId)); }
      else setOwned(await privacySummary());
      setOpen(true);
    } catch { setError(family ? "Chỉ chủ gia đình có thể quản lý quyền sở hữu và xóa gia đình." : "Chưa tải được thông tin tài khoản."); }
    finally { setBusy(false); }
  }
  async function run(transfer = false) {
    setBusy(true); setError("");
    try {
      if (transfer) { const result = await transferFamilyOwnership({ password, recipientId: recipient }); if (!result.ok) throw new Error(result.error); window.location.replace("/settings"); }
      else if (family) { const result = await requestFamilyDeletion({ password, confirmation }); if (!result.ok) throw new Error(result.error); window.location.replace("/home"); }
      else { const result = await requestAccountDeletion({ password, confirmation, deleteSharedOwnedFamilies: shared }); if (!result.ok) throw new Error(result.error); window.location.replace("/account-deleted"); }
    } catch (e) { setPassword(""); setError(e instanceof Error && !/Server Components|Minified React|NEXT_/.test(e.message) ? e.message : "Chưa thực hiện được. Kiểm tra mật khẩu, quyền sở hữu và thử lại."); setBusy(false); }
  }
  return <section className="settings-card"><h2>{family ? "Quyền sở hữu gia đình" : "Xóa tài khoản"}</h2><p>{family ? "Chủ gia đình có thể chuyển quyền cho thành viên hiện có hoặc xóa toàn bộ dữ liệu gia đình." : "Xác thực lại bằng mật khẩu để đóng tài khoản. Gia đình còn chủ khác được giữ lại; gia đình chỉ có mình bạn sẽ được xóa."}</p>
    {!open && <button className="button button-secondary" disabled={busy} onClick={load}>Xem lựa chọn {family ? "gia đình" : "xóa tài khoản"}</button>}
    {open && <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="form-stack">
      {!family && owned.length > 0 && <><p>Gia đình bạn đang sở hữu:</p><ul>{owned.map((f) => <li key={f.id}>{f.name} · {f.members} thành viên</li>)}</ul><label className="checkbox-row"><input disabled={busy} type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Tôi đồng ý xóa cả gia đình có thành viên khác nếu tôi là chủ duy nhất. Tôi có thể quay lại Cài đặt để chuyển quyền trước.</label></>}
      <label className="form-field"><span className="form-label">Mật khẩu hiện tại</span><input className="form-input" disabled={busy} type="password" autoComplete="current-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {family && members.length > 0 && <><label className="form-field"><span className="form-label">Chuyển quyền cho</span><select className="form-select" disabled={busy} value={recipient} onChange={(e) => setRecipient(e.target.value)}><option value="">Chọn thành viên</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}</select></label><button type="button" className="button button-secondary" disabled={busy || !recipient || !password} onClick={() => void run(true)}>Xác nhận chuyển quyền sở hữu</button></>}
      <p>Dữ liệu được đóng truy cập ngay, dọn ảnh và dữ liệu sớm nhất sau 24 giờ; backup lưu tối đa 30 ngày. Thao tác này không thể hoàn tác trong ứng dụng.</p>
      <label className="form-field"><span className="form-label">Nhập {family ? "XÓA GIA ĐÌNH" : "XÓA TÀI KHOẢN"}</span><input className="form-input" disabled={busy} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required autoComplete="off" /></label>
      <button className="button button-danger" disabled={busy || confirmation !== (family ? "XÓA GIA ĐÌNH" : "XÓA TÀI KHOẢN")}>{busy ? "Đang thực hiện…" : family ? "Xóa toàn bộ gia đình" : "Xóa tài khoản của tôi"}</button>
    </form>}{error && <p role="alert">{error}</p>}
  </section>;
}
