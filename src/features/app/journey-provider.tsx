"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Child, ChildMilestone, DemoData, Event } from "@/types/domain";
import {
  confirmMilestoneEvent as buildMilestoneConfirmation,
  createCustomMilestone as buildCustomMilestone,
} from "@/features/milestones";
import type { CustomMilestoneInput } from "@/lib/validation";
import { todayVN } from "@/lib/dates";
import { browserJourneyRepository } from "./demo-repository";
import { EventForm } from "@/features/events/event-form";
import { Dialog } from "@/components/ui/dialog";

export type JourneyContext = {
  mode: "demo" | "server";
  revision?: number;
  mediaEnabled?: boolean;
  remindersEnabled?: boolean;
  notificationsEnabled?: boolean;
  saveNotifications?: (enabled: boolean) => Promise<void>;
  canWrite?: boolean;
  refreshMedia?: (eventId?: string) => Promise<void>;
  data: DemoData;
  child: Child;
  ready: boolean;
  error: string;
  toast: string;
  switchChild: (id: string) => void;
  saveChild: (child: Child) => void;
  openEvent: (event?: Event) => void;
  deleteEvent: (id: string) => void;
  updateChild: (child: Child) => void | boolean | Promise<boolean>;
  reset: () => void;
  notify: (message: string) => void;
  confirmMilestoneEvent: (milestone: ChildMilestone, date: string) => void | boolean | Promise<boolean>;
  createCustomMilestone: (input: CustomMilestoneInput) => void | boolean | Promise<boolean>;
  changeMilestoneState: (
    milestone: ChildMilestone,
    state: "COMPLETED" | "SKIPPED",
  ) => void;
};
export const JourneyContextProvider = createContext<JourneyContext | null>(null);
const Context = JourneyContextProvider;
export function JourneyProvider({
  initialData,
  children,
}: {
  initialData: DemoData;
  children: ReactNode;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [eventOpen, setEventOpen] = useState(false);
  const [editing, setEditing] = useState<Event>();
  useEffect(() => {
    // Read browser storage after hydration so the first client render matches server data.
    const frame = requestAnimationFrame(() => {
      try {
        const stored = browserJourneyRepository.load();
        if (stored?.children.length) setData(stored);
      } catch (e) {
        setError((e as Error).message);
      }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const commit = (next: DemoData) => {
    browserJourneyRepository.save(next);
    setData(next);
    setError("");
  };
  const safeCommit = (next: DemoData) => {
    try {
      commit(next);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const child =
    data.children.find((c) => c.id === data.activeChildId) ?? data.children[0];
  return (
    <Context.Provider
      value={{
        mode: "demo",
        data,
        child,
        ready,
        error,
        toast,
        switchChild: (id) => {
          safeCommit({ ...data, activeChildId: id });
        },
        saveChild: (c) => {
          if (
            safeCommit({
              ...data,
              children: [...data.children.filter((x) => x.id !== c.id), c],
              activeChildId: c.id,
            })
          ) {
            setToast("Hành trình của bé đã được lưu");
            router.push("/home");
          }
        },
        updateChild: (c) => {
          if (
            safeCommit({
              ...data,
              children: data.children.map((x) => (x.id === c.id ? c : x)),
            })
          )
            setToast("Đã cập nhật thông tin của bé");
        },
        openEvent: (e) => {
          setEditing(e);
          setEventOpen(true);
        },
        deleteEvent: (id) => {
          if (
            safeCommit({
              ...data,
              events: data.events.filter((x) => x.id !== id),
              milestones: data.milestones?.map((m) =>
                m.eventId === id ? { ...m, eventId: undefined } : m,
              ),
            })
          ) {
            setToast("Đã xóa sự kiện");
            router.push("/timeline");
          }
        },
        confirmMilestoneEvent: (milestone, date) => {
          commit(
            buildMilestoneConfirmation(data, milestone, date, {
              eventId: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            }),
          );
          setToast("Đã xác nhận ngày và lưu sự kiện cột mốc");
        },
        createCustomMilestone: (input) => {
          commit(
            buildCustomMilestone(data, input, {
              id: crypto.randomUUID(),
              eventId: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            }),
          );
          setToast("Đã lưu cột mốc riêng của con");
        },
        changeMilestoneState: (milestone, state) => {
          if (
            milestone.childId !== child.id ||
            ["PAUSED", "ENDED"].includes(child.lifecycle)
          )
            return;
          const date = milestone.ceremonyDate ?? milestone.confirmedDate;
          if (state === "COMPLETED" && (!date || date > todayVN())) return;
          if (
            state === "SKIPPED" &&
            (milestone.confirmedDate || milestone.ceremonyDate)
          )
            return;
          const next = { ...milestone, state };
          if (
            safeCommit({
              ...data,
              milestones: [
                ...(data.milestones ?? []).filter(
                  (m) => !(m.childId === child.id && m.key === milestone.key),
                ),
                next,
              ],
            })
          )
            setToast(
              state === "COMPLETED"
                ? "Đã lưu cột mốc hoàn thành"
                : "Đã bỏ qua gợi ý này",
            );
        },
        reset: () => {
          try {
            browserJourneyRepository.clear();
            setData(initialData);
            setError("");
            setToast("Đã khôi phục dữ liệu mẫu");
          } catch {
            setError(
              "Không thể truy cập bộ nhớ trình duyệt. Vui lòng kiểm tra quyền lưu trữ.",
            );
          }
        },
        notify: setToast,
      }}
    >
      {children}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>✓</span> {toast}
        </div>
      )}
      <Dialog
        open={eventOpen}
        title={editing ? "Chỉnh sửa kỷ niệm" : "Lưu một kỷ niệm mới"}
        onClose={() => setEventOpen(false)}
        wide
      >
        {eventOpen && (
          <EventForm
            event={editing}
            childId={child.id}
            onClose={() => setEventOpen(false)}
            onSave={(e) => {
              commit({
                ...data,
                events: [...data.events.filter((x) => x.id !== e.id), e],
                milestones: data.milestones?.map((m) =>
                  m.eventId === e.id
                    ? e.type === "milestone"
                      ? {
                          ...m,
                          title: e.title,
                          description:
                            m.kind === "custom" ? e.description : m.description,
                          confirmedDate: e.date,
                          ceremonyDate:
                            m.kind === "full-month" ||
                            m.kind === "first-birthday"
                              ? e.date
                              : m.ceremonyDate,
                        }
                      : { ...m, eventId: undefined }
                    : m,
                ),
              });
              setEventOpen(false);
              setToast(
                editing
                  ? "Đã cập nhật kỷ niệm"
                  : "Đã lưu thêm một câu chuyện đẹp",
              );
            }}
          />
        )}
      </Dialog>
    </Context.Provider>
  );
}
export function useJourney() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("JourneyProvider is required");
  return ctx;
}
