"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination -- Full navigation discards the previous family's client state after authority changes. */
import Link from "next/link";
import { useId, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { changeFamilyMemberRole, createFamilyInvitation, readFamilySharing, removeFamilyMember, renameSharedFamily, revokeFamilyInvitation, selectSharedFamily } from "@/app/actions/family-sharing";
import type { FamilySharingOverview } from "@/server/family/invitations";

const roles: Record<string, string> = { OWNER: "Chủ gia đình", PARENT: "Bố/mẹ", VIEWER: "Chỉ xem" };
export function FamilyMembers({ initial }: { initial: FamilySharingOverview }) {
  const [data, setData] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [message, setMessage] = useState(""); const [link, setLink] = useState("");
  const [removing, setRemoving] = useState<{ userId: string; name: string }>(); const id = useId();
  const owner = data.role === "OWNER";
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : "Chưa thực hiện được. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }
  async function reload() { const result = await readFamilySharing(); if (!result.ok) throw new Error(result.error); setData(result.data); }
  return <div className="form-stack">
    <p>Bạn đang ở <strong>{data.family.name}</strong> · {roles[data.role]}.</p>
    {data.families.length > 1 && <form className="form-stack" onSubmit={event => {
      event.preventDefault(); const value = new FormData(event.currentTarget).get("family") as string;
      void run(async () => { const result = await selectSharedFamily(value); if (!result.ok) throw new Error(result.error); window.location.assign("/home"); });
    }}><div className="form-field"><label className="form-label" htmlFor={`${id}-family`}>Chọn không gian gia đình</label><select id={`${id}-family`} className="form-select" name="family" defaultValue={data.family.id} disabled={busy}>{data.families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div><button className="button button-secondary" disabled={busy}>Mở gia đình</button></form>}
    {owner && <form className="form-stack" onSubmit={event => {
      event.preventDefault(); const name = new FormData(event.currentTarget).get("name") as string;
      void run(async () => { const result = await renameSharedFamily(name); if (!result.ok) throw new Error(result.error); await reload(); setMessage("Đã cập nhật tên gia đình."); });
    }}><label className="form-field"><span className="form-label">Tên không gian gia đình</span><input className="form-input" name="name" defaultValue={data.family.name} required maxLength={120} disabled={busy} /></label><button className="button button-secondary" disabled={busy}>Lưu tên gia đình</button></form>}
    <section className="family-section" aria-labelledby={`${id}-members`}><h2 id={`${id}-members`}>Thành viên ({data.members.length})</h2>
      <ul className="family-member-list">{data.members.map(member => <li key={member.userId}>
        <div><strong>{member.name}{member.userId === data.userId ? " (Bạn)" : ""}</strong><span>{roles[member.role]}</span></div>
        {owner && member.role !== "OWNER" && <form className="family-member-controls" onSubmit={event => {
          event.preventDefault(); const role = new FormData(event.currentTarget).get("role");
          void run(async () => { const result = await changeFamilyMemberRole(member.userId, role); if (!result.ok) throw new Error(result.error); await reload(); setMessage("Đã cập nhật quyền thành viên."); });
        }}><label className="sr-only" htmlFor={`${id}-${member.userId}`}>Quyền của {member.name}</label><select id={`${id}-${member.userId}`} className="form-select" name="role" defaultValue={member.role} disabled={busy}><option value="PARENT">Bố/mẹ</option><option value="VIEWER">Chỉ xem</option></select><button className="button button-secondary" disabled={busy}>Lưu quyền</button><button type="button" className="button button-danger" disabled={busy} onClick={() => setRemoving({ userId: member.userId, name: member.name })}>Xóa thành viên</button></form>}
      </li>)}</ul>
      {!owner && <button className="button button-secondary" disabled={busy} onClick={() => setRemoving({ userId: data.userId, name: "bạn" })}>Rời gia đình</button>}
      {owner && <p className="form-help">Chuyển quyền chủ gia đình trong Cài đặt → Quyền sở hữu gia đình. Quyền Bố/mẹ cho phép ghi sự kiện và ảnh; Chỉ xem không được chỉnh sửa.</p>}
    </section>
    {owner && <section className="family-section" aria-labelledby={`${id}-invite`}><h2 id={`${id}-invite`}>Mời người thân</h2>
      <p>Tạo liên kết dùng một lần, có hiệu lực 7 ngày. Chỉ chia sẻ riêng cho người bạn muốn mời; người nhận liên kết có thể tham gia bằng tài khoản của họ.</p>
      <form className="form-stack" onSubmit={event => {
        event.preventDefault(); const role = new FormData(event.currentTarget).get("role");
        void run(async () => { setLink(""); const result = await createFamilyInvitation(role); if (!result.ok) throw new Error(result.error); setLink(result.data.link); await reload(); });
      }}><div className="form-field"><label className="form-label" htmlFor={`${id}-invite-role`}>Quyền của người được mời</label><select id={`${id}-invite-role`} className="form-select" name="role" disabled={busy}><option value="PARENT">Bố/mẹ · cùng ghi sự kiện</option><option value="VIEWER">Chỉ xem</option></select></div><button className="button button-primary" disabled={busy} aria-busy={busy}>Tạo lời mời</button></form>
      {link && <div className="form-stack family-invite-result"><label className="form-field"><span className="form-label">Liên kết mời mới</span><input className="form-input" value={link} readOnly autoComplete="off" onFocus={event => event.currentTarget.select()} /></label>
        <button className="button button-secondary" onClick={() => void run(async () => { try { await navigator.clipboard.writeText(link); setMessage("Đã sao chép liên kết mời."); } catch { throw new Error("Hãy chọn và sao chép liên kết trong ô phía trên."); } })} disabled={busy}>Sao chép liên kết</button>
        <p className="form-help">Liên kết chỉ hiển thị lần này. Nếu mất liên kết, thu hồi lời mời cũ và tạo lại. Không tự gửi email.</p></div>}
      {data.invitations.length > 0 && <ul className="family-invitation-list">{data.invitations.map(invite => <li key={invite.id}><span>{roles[invite.role]} · hết hạn {new Date(invite.expiresAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span><button className="button button-secondary" disabled={busy} onClick={() => void run(async () => { const result = await revokeFamilyInvitation(invite.id); if (!result.ok) throw new Error(result.error); setLink(""); await reload(); setMessage("Đã thu hồi lời mời."); })}>Thu hồi lời mời</button></li>)}</ul>}
    </section>}
    <Link className="account-back-link" href="/join">Tham gia bằng lời mời khác</Link>
    {message && <p role="status">{message}</p>}{error && !removing && <p className="form-error" role="alert">{error}</p>}
    <Dialog open={!!removing} title={removing?.userId === data.userId ? "Rời gia đình?" : "Xóa thành viên?"} onClose={() => { if (!busy) setRemoving(undefined); }}>
      <p>{removing?.name} sẽ mất quyền truy cập gia đình này. Sự kiện và ảnh đã lưu vẫn được giữ lại.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="settings-actions"><button className="button button-secondary" disabled={busy} onClick={() => setRemoving(undefined)}>Giữ lại</button><button className="button button-danger" disabled={busy} aria-busy={busy} onClick={() => void run(async () => {
        if (!removing) return; const result = await removeFamilyMember(removing.userId); if (!result.ok) throw new Error(result.error);
        if (removing.userId === data.userId) { window.location.assign("/home"); return; }
        setRemoving(undefined); await reload(); setMessage("Đã xóa thành viên khỏi gia đình.");
      })}>Xác nhận</button></div>
    </Dialog>
  </div>;
}
