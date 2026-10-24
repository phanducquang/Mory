"use client";
import { SessionBoundary } from "@/features/auth/session-boundary";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AccountSnapshot } from "@/server/services/account-journey";
import type { Child, Event } from "@/types/domain";
import { setEmailNotifications } from "@/app/actions/preferences";
import { mutateJourney, selectChild, refreshAccountMedia } from "@/app/actions/journey";
import { daysBetween, todayVN } from "@/lib/dates";
import { JourneyContextProvider } from "./journey-provider";
import { ChildForm } from "@/features/children/child-form";
import { EventForm } from "@/features/events/event-form";
import { Dialog } from "@/components/ui/dialog";
import { Toast } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { AccountSignOut } from "@/features/auth/account-sign-out";
export { AccountSignOut } from "@/features/auth/account-sign-out";

export function ServerJourneyProvider({ initialSnapshot, children }: { initialSnapshot: AccountSnapshot; children: ReactNode }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState("");
  const [toast, setToast] = useToast();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [revision, setRevision] = useState(0);
  const [eventOpen, setEventOpen] = useState(false);
  const [editing, setEditing] = useState<Event>();
  const data = snapshot.data;
  const child = data.children.find((c) => c.id === data.activeChildId) ?? data.children[0];
  async function execute(operation: unknown) {
    if (locked.current) return false;
    if (!snapshot.canWrite) { setError("Bạn có quyền xem. Cần thành viên có quyền chỉnh sửa để lưu thay đổi."); return false; }
    locked.current = true; setBusy(true); setError(""); setToast("");
    try {
      const result = await mutateJourney(operation);
      if (!result.ok) { setError(result.error); return false; }
      setSnapshot(result.snapshot); setRevision((v) => v + 1); setToast("Đã lưu thay đổi vào tài khoản gia đình");
      router.refresh();
      if (snapshot.mediaEnabled && "createdEventId" in result && result.createdEventId) router.push(`/events/${result.createdEventId}`);
      return true;
    } catch { setError("Chưa thể kết nối. Vui lòng tải lại hoặc đăng nhập lại."); return false; }
    finally { locked.current = false; setBusy(false); }
  }
  async function saveChild(value: Child) {
    if (await execute({ kind: "createChild", input: value })) router.push("/home");
  }
  async function updateChild(value: Child) {
    const previous = data.children.find((c) => c.id === value.id);
    if (!previous) return false;
    if (previous.lifecycle !== value.lifecycle) {
      if (previous.lifecycle === "EXPECTING" && value.lifecycle === "AFTER_BIRTH")
        return execute({ kind: "birth", childId: value.id, input: { birthDate: value.birthDate, birthTime: value.birthTime } });
      return execute({ kind: "tracking", childId: value.id, state: ["PAUSED", "ENDED"].includes(value.lifecycle) ? value.lifecycle : "RESUME" });
    }
    if (value.dueReminderSnoozedUntil !== previous.dueReminderSnoozedUntil && value.dueReminderSnoozedUntil)
      return execute({ kind: "snooze", childId: value.id, days: daysBetween(todayVN(), value.dueReminderSnoozedUntil) });
    return execute({ kind: "updateChild", childId: value.id, input: value });
  }
  if (!child) return <main className="auth-page"><div className="auth-card" style={{ maxWidth: 680 }}>
    <h1>Bắt đầu hành trình của con</h1><p>Thêm hồ sơ đầu tiên vào không gian gia đình.</p>
    <ChildForm mediaEnabled={false} onSave={saveChild} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <AccountSignOut />
  </div></main>;
  return <JourneyContextProvider.Provider value={{
    mode: "server", accountName: snapshot.displayName, revision, remindersEnabled: snapshot.remindersEnabled, notificationsEnabled: snapshot.notificationsEnabled,
    saveNotifications: async (enabled) => { setSnapshot(await setEmailNotifications(enabled)); setRevision((v) => v + 1); }, mediaEnabled: snapshot.mediaEnabled, canWrite: snapshot.canWrite,
    refreshMedia: async (eventId) => { setSnapshot(await refreshAccountMedia(eventId)); setRevision((v) => v + 1); router.refresh(); }, data, child, ready: true, error, toast,
    switchChild: async (id) => {
      try { setSnapshot(await selectChild(id)); setRevision((v) => v + 1); router.push("/home"); }
      catch { setError("Chưa mở được hồ sơ. Vui lòng tải lại."); }
    },
    saveChild, updateChild, openEvent: (event) => { setEditing(event); setEventOpen(true); },
    deleteEvent: async (eventId) => { if (await execute({ kind: "deleteEvent", eventId })) router.push("/timeline"); },
    confirmMilestoneEvent: (m, date) => execute({ kind: "confirm", childId: m.childId, key: m.key, date }),
    createCustomMilestone: (input) => execute({ kind: "custom", childId: child.id, input }),
    changeMilestoneState: (m, state) => { void execute({ kind: "milestoneState", childId: m.childId, key: m.key, state }); },
    reset: () => {}, notify: setToast,
  }}>
    <SessionBoundary />{children}
    {busy && <div className="toast" role="status">Đang lưu thay đổi…</div>}
    {!busy && toast && <Toast message={toast} onClose={() => setToast("")} />}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!snapshot.canWrite && <div className="error-banner" role="status">Bạn đang xem với quyền chỉ đọc.</div>}
    <Dialog open={eventOpen} title={editing ? "Chỉnh sửa kỷ niệm" : "Lưu một kỷ niệm mới"} onClose={() => { if (!busy) setEventOpen(false); }} wide>
      {eventOpen && <EventForm event={editing} childId={editing?.childId ?? child.id} mediaEnabled={false} remindersAvailable={snapshot.remindersEnabled} onClose={() => setEventOpen(false)} onSave={async (event) => {
        const operation = editing ? { kind: "updateEvent", eventId: editing.id, input: { ...event, images: [] } } : { kind: "createEvent", childId: event.childId, input: { ...event, images: [] } };
        if (await execute(operation)) setEventOpen(false);
        else throw new Error("Chưa lưu được sự kiện. Kiểm tra thông báo và thử lại.");
      }} />}
    </Dialog>
  </JourneyContextProvider.Provider>;
}
