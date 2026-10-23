"use client";
import { PrivacyControls } from "@/features/auth/privacy-controls";
import { AuditHistory } from "@/features/auth/audit-history";
import { NotificationSettings } from "@/features/auth/notification-settings";
import { AccountMediaManager } from "@/features/media/account-media-manager";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Baby,
  BookHeart,
  CalendarDays,
  Camera,
  ChevronRight,
  Download,
  Flower2,
  Heart,
  ImagePlus,
  Leaf,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  Trash2,
} from "lucide-react";
import { useJourney } from "./journey-provider";
import { useServerTimeline } from "./use-server-timeline";
import { AccountSignOut } from "./server-journey-provider";
import { exportFamilyData } from "@/app/actions/journey";
import type { InitialTimelinePage } from "@/lib/validation/timeline-query";
import {
  addDays,
  childAgeLabel,
  daysBetween,
  formatDate,
  formatLongDate,
  relativeDate,
  todayVN,
} from "@/lib/dates";
import {
  filterTimeline,
  groupTimeline,
  projectTimeline,
} from "@/features/timeline/domain";
import {
  confirmBirth,
  needsBirthConfirmation,
  snoozeBirthConfirmation,
  changeTrackingState,
  resumeTracking,
} from "@/features/children/domain";
import {
  generateMilestones,
  milestoneDate,
  upcomingMilestones,
} from "@/features/milestones";
import {
  lunarDateLabel,
  LUNAR_CALENDAR_RANGE,
} from "@/lib/lunar-calendar/vietnamese-calendar";
import { ChildForm } from "@/features/children/child-form";
import { CustomMilestoneForm } from "@/features/milestones/custom-milestone-form";
import { Dialog } from "@/components/ui/dialog";
import type { ChildMilestone, Event, EventType } from "@/types/domain";
const types: Record<
  EventType,
  { label: string; icon: typeof Heart; className: string }
> = {
  memory: { label: "Kỷ niệm", icon: Heart, className: "rose" },
  milestone: { label: "Cột mốc", icon: Sparkles, className: "purple" },
  health: { label: "Sức khỏe", icon: Leaf, className: "sage" },
  activity: { label: "Hoạt động", icon: Camera, className: "peach" },
};
function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function EmptyState({
  title = "Chờ một câu chuyện mới",
  description = "Những điều nhỏ bé hôm nay sẽ là ký ức đẹp mai sau.",
}: {
  title?: string;
  description?: string;
}) {
  const { openEvent } = useJourney();
  return (
    <div className="empty-state">
      <BookHeart size={35} />
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="button button-primary" onClick={() => openEvent()}>
        <Plus size={16} /> Lưu kỷ niệm đầu tiên
      </button>
    </div>
  );
}
function EventTypeBadge({ type }: { type: EventType }) {
  const t = types[type];
  return (
    <span className={`badge ${t.className}`}>
      <t.icon size={12} />
      {t.label}
    </span>
  );
}
function MemoryCard({ event }: { event: Event }) {
  return (
    <Link
      className={`memory-card ${!event.images.length ? "memory-no-image" : ""}`}
      href={`/events/${event.id}`}
    >
      <div className={`memory-image ${types[event.type].className}`}>
        {event.images[0] ? (
          <Image
            width={800}
            height={600}
            unoptimized
            src={event.images[0]}
            alt={event.title}
            loading="lazy"
          />
        ) : (
          <div className="memory-illustration">
            <span>✧</span>
            <typesPlaceholder.Icon />
            <span>✦</span>
          </div>
        )}
        <span className="photo-count">
          {event.images.length ? (
            <>
              <Camera size={12} />
              {event.images.length}
            </>
          ) : (
            <Heart size={14} />
          )}
        </span>
      </div>
      <div className="memory-body">
        <div className="memory-meta">
          <EventTypeBadge type={event.type} />
          <span>{relativeDate(event.date)}</span>
        </div>
        <h3>{event.title}</h3>
        <p>{event.description}</p>
      </div>
    </Link>
  );
}
const typesPlaceholder = { Icon: () => <Heart size={46} strokeWidth={1.3} /> };
function BirthConfirmation() {
  const { child, updateChild } = useJourney();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayVN());
  const [error, setError] = useState("");
  if (child.lifecycle !== "EXPECTING") return null;
  return (
    <>
      <div
        className={`birth-banner ${needsBirthConfirmation(child) ? "is-due" : ""}`}
      >
        <Baby size={25} />
        <div>
          <strong>
            {needsBirthConfirmation(child)
              ? "Đã đến ngày dự kiến gặp con"
              : "Sẵn sàng đón một điều kỳ diệu"}
          </strong>
          <p>Chỉ chuyển sang hành trình sau sinh khi gia đình xác nhận.</p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => setOpen(true)}
        >
          Xác nhận bé chào đời
        </button>
        {needsBirthConfirmation(child) && (
          <div className="birth-options">
            <button
              onClick={() =>
                updateChild(snoozeBirthConfirmation(child, todayVN(), 3))
              }
            >
              Bé chưa chào đời
            </button>
            <button onClick={() => updateChild(snoozeBirthConfirmation(child))}>
              Nhắc tôi sau
            </button>
          </div>
        )}
      </div>
      <Dialog
        open={open}
        title="Chào mừng con đến với thế giới"
        onClose={() => setOpen(false)}
      >
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              if (await updateChild(confirmBirth(child, date)) !== false) setOpen(false);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <p className="form-help">
            Ngày dự sinh và những kỷ niệm thai kỳ sẽ được giữ lại.
          </p>
          <label className="form-field">
            Ngày sinh thực tế
            <input
              className="form-input"
              type="date"
              value={date}
              max={todayVN()}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-primary" type="submit">
            Lưu ngày chào đời
          </button>
        </form>
      </Dialog>
    </>
  );
}
export function HomeView() {
  const { child, data, openEvent, mode } = useJourney();
  const events = filterTimeline(data.events, {
    childId: child.id,
    period: "past",
  });
  const upcoming = filterTimeline(data.events, {
    childId: child.id,
    period: "upcoming",
    order: "asc",
  }).filter((e) => e.date > todayVN());
  const milestones = generateMilestones(child, data.milestones);
  const age = childAgeLabel(child);
  const isExpecting = child.lifecycle === "EXPECTING";
  const tracking = !["PAUSED", "ENDED"].includes(child.lifecycle);
  const ageDays = child.birthDate ? daysBetween(child.birthDate, todayVN()) : 0;
  const ceremonyKind =
    ageDays < 45 ? "full-month" : ageDays < 400 ? "first-birthday" : undefined;
  const pendingCeremony = milestones.find(
    (m) =>
      m.kind === ceremonyKind &&
      m.state === "PENDING_CONFIRMATION" &&
      !milestoneDate(m),
  );
  const nextMilestone = isExpecting
    ? milestones.find((m) => m.kind === "due")
    : (pendingCeremony ??
      upcomingMilestones(milestones).find((m) => m.kind !== "due"));
  const nextDate = nextMilestone ? milestoneDate(nextMilestone) : undefined;
  return (
    <>
      <PageHeading
        eyebrow="MỖI NGÀY BÊN CON, MỘT ĐIỀU ĐÁNG NHỚ"
        title="Chào ba mẹ, hôm nay thật đẹp"
        description="Cùng Mory cất giữ những mảnh ghép yêu thương của gia đình."
        action={
          <button className="button button-primary" onClick={() => openEvent()}>
            <Plus size={18} />
            Thêm kỷ niệm
          </button>
        }
      />
      <section className="journey-hero">
        <div className="hero-copy">
          <span className="hero-badge">
            <span />
            HÀNH TRÌNH CỦA{" "}
            {child.nickname?.toUpperCase() ?? child.name.toUpperCase()}
          </span>
          <h2>
            Những điều nhỏ bé,
            <br />
            thành ký ức <em>lớn lao.</em>
          </h2>
          <p>
            {isExpecting
              ? "Một nhịp tim nhỏ, một tình yêu lớn. Cùng lưu lại những ngày mong con."
              : "Một cái nắm tay, một nụ cười, một lần đầu tiên.\nĐể không khoảnh khắc yêu thương nào trôi qua."}
          </p>
          <Link href="/timeline" className="hero-link">
            Mở hành trình của con <ArrowRight size={17} />
          </Link>
          <span className="hero-flower">
            <Flower2 size={36} strokeWidth={1} />
          </span>
        </div>
        <div className="hero-art">
          <span className="doodle-star star-one">✧</span>
          <span className="doodle-star star-two">✦</span>
          <div className="polaroid">
            <span className="tape" />
            <Image
              width={800}
              height={600}
              unoptimized
              loading="eager"
              src={child.avatar ?? "/images/baby.jpg"}
              alt={`Một khoảnh khắc bình yên của ${child.name}`}
            />
            <span>little moments, big love ♡</span>
          </div>
          <div className="hero-age">
            <span className="age-icon">
              <Sprout size={23} />
            </span>
            <div>
              <small>{child.nickname ?? child.name} hôm nay</small>
              <strong>{age}</strong>
            </div>
            <Heart size={15} />
          </div>
          <span className="doodle-heart">♡</span>
        </div>
      </section>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon purple">
            <BookHeart size={21} />
          </span>
          <div>
            <strong>
              {events.length}
              <small>kỷ niệm</small>
            </strong>
            <span>Những câu chuyện đã lưu</span>
          </div>
          <span className="stat-decoration">↗</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon peach">
            <Sparkles size={21} />
          </span>
          <div>
            <strong>
              {
                data.events.filter(
                  (e) => e.childId === child.id && e.type === "milestone",
                ).length
              }
              <small>cột mốc</small>
            </strong>
            <span>Mỗi bước lớn khôn của con</span>
          </div>
          <span className="stat-decoration">✧</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon sage">
            <Heart size={21} />
          </span>
          <div>
            <strong>
              {child.birthDate
                ? Math.max(0, daysBetween(child.birthDate, todayVN()))
                : child.dueDate
                  ? Math.max(0, daysBetween(todayVN(), child.dueDate))
                  : 0}
              <small>{isExpecting ? "ngày chờ con" : "ngày bên nhau"}</small>
            </strong>
            <span>Một hành trình đầy yêu thương</span>
          </div>
          <span className="stat-decoration">♡</span>
        </div>
      </div>
      <BirthConfirmation />
      <div className="dashboard-columns">
        <div className="dashboard-main">
          <section>
            <div className="section-heading">
              <div>
                <h2>
                  Kỷ niệm gần đây <span className="tiny-flower">✳</span>
                </h2>
                <p>Những khoảnh khắc muốn giữ thật lâu.</p>
              </div>
              <Link className="text-link" href="/timeline">
                Xem tất cả <ArrowUpRight size={15} />
              </Link>
            </div>
            {events.length ? (
              <div className="memories-grid">
                {events.slice(0, 3).map((e) => (
                  <MemoryCard event={e} key={e.id} />
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </section>
          <section className="quick-section">
            <div className="section-heading">
              <h2>Hôm nay, mình lưu gì nhỉ?</h2>
              <span className="handwritten">a little something ♡</span>
            </div>
            <div className="quick-grid">
              <button onClick={() => openEvent()}>
                <span className="quick-icon purple">
                  <ImagePlus size={22} />
                </span>
                <strong>Thêm một tấm ảnh</strong>
                <small>Giữ lại một khoảnh khắc</small>
                <Plus size={15} />
              </button>
              <button onClick={() => openEvent()}>
                <span className="quick-icon peach">
                  <Pencil size={22} />
                </span>
                <strong>Viết đôi dòng cho con</strong>
                <small>Những điều ba mẹ muốn kể</small>
                <Plus size={15} />
              </button>
              <button onClick={() => openEvent()}>
                <span className="quick-icon sage">
                  <Star size={22} />
                </span>
                <strong>Đánh dấu lần đầu</strong>
                <small>Một bước lớn khôn mới</small>
                <Plus size={15} />
              </button>
            </div>
          </section>
          <div className="quote-card">
            <span>“</span>
            <p>
              Con sẽ lớn, những ngày này sẽ qua.
              <br />
              <strong>Nhưng tình yêu thì ở lại.</strong>
            </p>
            <Flower2 size={45} strokeWidth={1} />
          </div>
        </div>
        <aside className="dashboard-aside">
          <section className="upcoming-panel">
            <div className="section-heading">
              <h2>
                {tracking ? "Sắp đến rồi" : "Một khoảng bình yên"}{" "}
                <span>✧</span>
              </h2>
              <CalendarDays size={18} />
            </div>
            {tracking ? (
              <>
                <div className="milestone-highlight">
                  <span className="milestone-icon">
                    <Sparkles size={24} />
                  </span>
                  <span className="eyebrow">CỘT MỐC YÊU THƯƠNG</span>
                  <h3>{nextMilestone?.title ?? "Mỗi bước, một câu chuyện"}</h3>
                  <p>
                    {nextDate
                      ? formatLongDate(nextDate)
                      : nextMilestone
                        ? "Gia đình cùng chọn một ngày thật ý nghĩa."
                        : "Những lần đầu của con được lưu theo nhịp riêng của gia đình."}
                  </p>
                  <span className="badge purple">
                    {nextMilestone?.state === "CONFIRMED"
                      ? "Ngày đã xác nhận"
                      : nextDate
                        ? "Ngày tham khảo"
                        : nextMilestone
                          ? "Gia đình chọn ngày tổ chức"
                          : "Theo nhịp của con"}
                  </span>
                  <Link href="/children" className="milestone-link">
                    {isExpecting
                      ? "Xem hành trình thai kỳ"
                      : nextMilestone?.needsDateConfirmation
                        ? "Chọn ngày của gia đình"
                        : "Xem cột mốc của con"}
                    <ChevronRight size={16} />
                  </Link>
                </div>
                {upcoming.slice(0, 2).map((e) => (
                  <Link
                    className="upcoming-event"
                    href={`/events/${e.id}`}
                    key={e.id}
                  >
                    <div className={`date-box ${types[e.type].className}`}>
                      <strong>{e.date.slice(8)}</strong>
                      <small>TH{Number(e.date.slice(5, 7))}</small>
                    </div>
                    <div>
                      <h3>{e.title}</h3>
                      <span>
                        {relativeDate(e.date)} · {types[e.type].label}
                      </span>
                    </div>
                    <ChevronRight size={15} />
                  </Link>
                ))}
                {!upcoming.length && (
                  <p className="subtle-text">Chưa có cuộc hẹn sắp tới.</p>
                )}
                <Link className="all-events" href="/events">
                  Xem lịch của gia đình <ArrowRight size={15} />
                </Link>
              </>
            ) : (
              <div className="milestone-highlight">
                <span className="milestone-icon">
                  <Heart size={24} />
                </span>
                <h3>Những kỷ niệm vẫn ở đây.</h3>
                <p>
                  Hành trình và các nhắc nhở đang được nghỉ ngơi. Gia đình có
                  thể tiếp tục khi sẵn sàng.
                </p>
                <Link href="/children" className="milestone-link">
                  Xem hồ sơ của con
                  <ChevronRight size={16} />
                </Link>
              </div>
            )}
          </section>
          <div className="gentle-card">
            <span>
              <ShieldCheck size={19} />
              GÓC NHỎ AN TOÀN
            </span>
            <h3>Ký ức là của gia đình mình.</h3>
            <p>
              {mode === "server" ? "Dữ liệu hành trình được lưu trong tài khoản gia đình của bạn." : "Bản trải nghiệm lưu dữ liệu trên trình duyệt này. Hãy dùng dữ liệu mẫu và xuất bản sao trước khi đặt lại."}
            </p>
            <Link href="/settings">
              Tìm hiểu về dữ liệu <ArrowUpRight size={14} />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
export function TimelineView({ eventsOnly = false, initialPage }: { eventsOnly?: boolean; initialPage?: InitialTimelinePage }) {
  const { data, child, openEvent, mode, revision } = useJourney();
  const [type, setType] = useState<EventType | "all">("all");
  const [period, setPeriod] = useState<"all" | "past" | "upcoming">(
    eventsOnly ? "upcoming" : "all",
  );
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<"asc" | "desc">(
    eventsOnly ? "asc" : "desc",
  );
  const [limit, setLimit] = useState(12);
  const serverPage = useServerTimeline(mode === "server", child.id, { type, period, search, order }, revision, initialPage);
  const result = filterTimeline(projectTimeline(mode === "server" ? { ...data, events: serverPage.events } : data, child), {
    childId: child.id,
    type,
    period,
    search,
    order,
  });
  const groups = groupTimeline(result.slice(0, limit));
  return (
    <>
      <PageHeading
        eyebrow={eventsOnly ? "CÙNG NHAU MONG CHỜ" : "MỘT CUỐN PHIM VỀ CON"}
        title={
          eventsOnly
            ? "Lịch yêu thương của gia đình"
            : `Hành trình của ${child.nickname ?? child.name}`
        }
        description={
          eventsOnly
            ? "Dành thời gian cho những điều và những người quan trọng."
            : "Từng ngày một, con viết nên câu chuyện của chính mình."
        }
        action={
          <button className="button button-primary" onClick={() => openEvent()}>
            <Plus size={17} />
            Thêm sự kiện
          </button>
        }
      />
      <div className="timeline-toolbar">
        <div
          className="filter-tabs"
          role="group"
          aria-label="Lọc theo loại sự kiện"
        >
          {(["all", "memory", "milestone", "health", "activity"] as const).map(
            (t) => (
              <button
                className={type === t ? "selected" : ""}
                key={t}
                onClick={() => {
                  setType(t);
                  setLimit(12);
                }}
              >
                {t === "all" ? "Tất cả" : types[t].label}
              </button>
            ),
          )}
        </div>
        <div className="timeline-search">
          <Search size={17} />
          <input
            aria-label="Tìm kỷ niệm"
            placeholder="Tìm một kỷ niệm..."
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="timeline-options">
        <span>
          {result.length} mục trên hành trình của {child.nickname ?? child.name}
        </span>
        <div>
          <select
            aria-label="Lọc theo thời gian"
            value={period}
            onChange={(e) => setPeriod(e.target.value as typeof period)}
          >
            <option value="all">Mọi thời điểm</option>
            <option value="past">Đã diễn ra</option>
            <option value="upcoming">Sắp tới</option>
          </select>
          <button
            className="text-link"
            onClick={() => setOrder(order === "desc" ? "asc" : "desc")}
          >
            <ArrowDownUp size={15} />
            {order === "desc" ? "Mới nhất" : "Cũ nhất"}
          </button>
        </div>
      </div>
      {groups.length ? (
        groups.map((group) => (
          <section className="timeline-group" key={group.key}>
            <h2>
              <span />
              {group.label}
            </h2>
            <div className="timeline-list">
              {group.events.map((event) => (
                <article
                  className={`timeline-entry ${event.source === "milestone" ? "suggestion-entry" : ""}`}
                  key={event.id}
                >
                  <span
                    className={`timeline-node ${types[event.type].className}`}
                  >
                    {event.type === "milestone" ? (
                      <Star size={15} />
                    ) : (
                      <Heart size={15} />
                    )}
                  </span>
                  <div className="timeline-entry-date">
                    {formatDate(event.date)}
                    {event.date > todayVN() && (
                      <span className="badge sage">Sắp tới</span>
                    )}
                  </div>
                  <div className="timeline-entry-content">
                    <div className="section-heading">
                      <EventTypeBadge type={event.type} />
                      {event.source === "event" ? (
                        <button
                          className="icon-button"
                          aria-label={`Chỉnh sửa ${event.title}`}
                          onClick={() => openEvent(event.event)}
                        >
                          <Pencil size={16} />
                        </button>
                      ) : (
                        <span className="badge purple">
                          Gợi ý tự động · Chưa xác nhận
                        </span>
                      )}
                    </div>
                    <Link
                      href={
                        event.source === "event"
                          ? `/events/${event.id}`
                          : `/children#milestone-${event.milestone.id}`
                      }
                    >
                      <h3>{event.title}</h3>
                    </Link>
                    <p>{event.description}</p>
                    {event.images.length > 0 && (
                      <Link
                        href={`/events/${event.id}`}
                        className="timeline-photos"
                      >
                        {event.images.slice(0, 3).map((img, i) => (
                          <Image
                            width={800}
                            height={600}
                            unoptimized
                            src={img}
                            key={i}
                            alt={`${event.title} - ảnh ${i + 1}`}
                            loading="lazy"
                          />
                        ))}
                      </Link>
                    )}
                    <Link
                      className="text-link"
                      href={
                        event.source === "event"
                          ? `/events/${event.id}`
                          : `/children#milestone-${event.milestone.id}`
                      }
                    >
                      {event.source === "event"
                        ? "Mở câu chuyện"
                        : "Xem gợi ý và chọn ngày"}{" "}
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      ) : (
        <EmptyState
          title="Chưa có câu chuyện ở đây"
          description="Thử bộ lọc khác hoặc thêm một khoảnh khắc mới của con."
        />
      )}
      {mode === "server" && serverPage.loading && <p role="status">Đang tải hành trình…</p>}
      {mode === "server" && serverPage.error && <p className="form-error" role="alert">{serverPage.error}</p>}
      {(result.length > limit || (mode === "server" && serverPage.nextCursor)) && (
        <button
          className="button button-secondary load-more"
          disabled={mode === "server" && serverPage.loadingMore}
          onClick={async () => {
            if (mode === "server" && result.length <= limit) await serverPage.loadMore();
            setLimit(limit + 12);
          }}
        >
          Xem thêm câu chuyện
        </button>
      )}
    </>
  );
}
export function EventDetailView({ id, initialEvent }: { id: string; initialEvent?: Event }) {
  const { data, child, openEvent, deleteEvent, ready, mode } = useJourney();
  const [confirm, setConfirm] = useState(false);
  const event = data.events.find((e) => e.id === id && e.childId === child.id) ?? initialEvent;
  if (!ready) return <div className="loading-state">Đang mở câu chuyện…</div>;
  if (!event)
    return (
      <>
        <PageHeading
          eyebrow="CUỐN SỔ CỦA CON"
          title="Không tìm thấy câu chuyện"
          description="Kỷ niệm có thể thuộc hồ sơ bé khác hoặc đã được xóa."
        />
        <Link className="button button-secondary" href="/timeline">
          Về hành trình
        </Link>
      </>
    );
  return (
    <>
      <Link className="text-link back-link" href="/timeline">
        ← Trở về hành trình
      </Link>
      <PageHeading
        eyebrow="MỘT MẢNH GHÉP YÊU THƯƠNG"
        title={event.title}
        description={`${formatLongDate(event.date)}${event.time ? ` · ${event.time}` : ""}`}
        action={
          <button
            className="button button-secondary"
            onClick={() => openEvent(event)}
          >
            <Pencil size={16} />
            Chỉnh sửa
          </button>
        }
      />
      <article className="detail-card">
        <EventTypeBadge type={event.type} />
        {event.images.length > 0 && (
          <div className="detail-photos">
            {event.images.map((src, i) => (
              <Image
                width={800}
                height={600}
                unoptimized
                key={i}
                src={src}
                alt={`${event.title} - ảnh ${i + 1}`}
              />
            ))}
          </div>
        )}
        <div className="detail-journal">
          <span className="eyebrow">NHỮNG ĐIỀU MÌNH MUỐN NHỚ</span>
          <p>
            {event.description ||
              "Một khoảnh khắc nhỏ, mang theo thật nhiều yêu thương."}
          </p>
          <div className="detail-date">
            <CalendarDays size={17} />
            <span>
              Ngày diễn ra: <strong>{formatDate(event.date)}</strong>
            </span>
          </div>
          <small>
            Đã lưu lúc{" "}
            {new Date(event.createdAt).toLocaleString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
            })}
          </small>
        </div>
      </article>
      {mode === "server" && <AccountMediaManager purpose="event" targetId={event.id} images={event.images} />}
      <button className="delete-event" onClick={() => setConfirm(true)}>
        <Trash2 size={16} />
        Xóa sự kiện
      </button>
      <Dialog
        open={confirm}
        title="Xóa kỷ niệm này?"
        onClose={() => setConfirm(false)}
      >
        <p>
          {mode === "server" ? "Kỷ niệm sẽ được xóa khỏi tài khoản gia đình." : "Kỷ niệm và ảnh đính kèm sẽ được xóa khỏi bản demo trên trình duyệt này."}
        </p>
        <div className="form-actions">
          <button
            className="button button-secondary"
            onClick={() => setConfirm(false)}
          >
            Giữ lại
          </button>
          <button
            className="button button-danger"
            onClick={() => deleteEvent(event.id)}
          >
            Xác nhận xóa
          </button>
        </div>
      </Dialog>
    </>
  );
}
export function OnboardingView() {
  const { saveChild, mode } = useJourney();
  return (
    <div className="onboarding-wrap">
      <div className="onboarding-intro">
        <span className="onboarding-symbol">
          <Sprout size={37} />
        </span>
        <div className="eyebrow">MỖI HÀNH TRÌNH BẮT ĐẦU BẰNG YÊU THƯƠNG</div>
        <h1>Chào con, một thế giới mới.</h1>
        <p>Thêm một thành viên nhỏ, mở một cuốn sách đầy kỷ niệm.</p>
      </div>
      <div className="form-card">
        <ChildForm onSave={saveChild} mediaEnabled={mode !== "server"} />
      </div>
      <p className="onboarding-privacy">
        <ShieldCheck size={15} />
        {mode === "server" ? "Hồ sơ được lưu vào không gian gia đình của tài khoản đang đăng nhập." : "Bản demo lưu trên trình duyệt. Vui lòng dùng thông tin giả lập."}
      </p>
    </div>
  );
}
export function ChildProfileView() {
  const {
    child,
    data,
    updateChild,
    notify,
    changeMilestoneState,
    createCustomMilestone,
    mode,
  } = useJourney();
  const tracking = !["PAUSED", "ENDED"].includes(child.lifecycle);
  const [edit, setEdit] = useState(false);
  const [ceremony, setCeremony] = useState<ChildMilestone>();
  const [date, setDate] = useState(addDays(todayVN(), 7));
  const [pause, setPause] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="THẾ GIỚI NHỎ CỦA BA MẸ"
        title={`Một chút về ${child.nickname ?? child.name}`}
        description="Mỗi đứa trẻ là một câu chuyện riêng, lớn lên theo nhịp của mình."
        action={
          <Link className="button button-secondary" href="/onboarding">
            <Plus size={17} />
            Thêm bé
          </Link>
        }
      />
      <section className="profile-card">
        <div className="profile-avatar">
          {child.avatar ? (
            <Image
              width={800}
              height={600}
              unoptimized
              src={child.avatar}
              alt={child.name}
            />
          ) : (
            <Baby size={44} />
          )}
        </div>
        <div>
          <span className="badge purple">
            {child.lifecycle === "AFTER_BIRTH"
              ? "Hành trình lớn khôn"
              : child.lifecycle === "EXPECTING"
                ? "Hành trình thai kỳ"
                : "Đang lưu giữ"}
          </span>
          <h2>{child.name}</h2>
          <p>{childAgeLabel(child)}</p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => setEdit(true)}
        >
          <Pencil size={16} />
          Chỉnh sửa hồ sơ
        </button>
      </section>
      {mode === "server" && <AccountMediaManager purpose="avatar" targetId={child.id} images={child.avatar ? [child.avatar] : []} />}
      <BirthConfirmation />
      <div className="profile-columns">
        <section className="settings-card">
          <h2>Những ngày đặc biệt</h2>
          <div className="info-row">
            <span>Ngày dự sinh</span>
            <strong>
              {child.dueDate ? formatDate(child.dueDate) : "Chưa ghi nhận"}
            </strong>
          </div>
          <div className="info-row">
            <span>Ngày sinh thực tế</span>
            <strong>
              {child.birthDate
                ? formatDate(child.birthDate)
                : "Chờ ngày gặp con"}
            </strong>
          </div>
          {child.birthDate && (
            <div className="info-row">
              <span>Ngày sinh âm lịch</span>
              <strong>
                {lunarDateLabel(child.birthDate) ?? "Ngoài phạm vi lịch hỗ trợ"}
              </strong>
            </div>
          )}
          {child.birthTime && (
            <div className="info-row">
              <span>Giờ sinh</span>
              <strong>{child.birthTime}</strong>
            </div>
          )}
          <div className="info-row">
            <span>Phạm vi riêng tư</span>
            <strong>Chỉ gia đình</strong>
          </div>
          <p className="form-help">
            Ngày dự sinh là tham khảo. Kỷ niệm thai kỳ luôn được giữ lại sau khi
            bé chào đời.
          </p>
        </section>
        <section className="settings-card">
          <h2>Cách gia đình đón cột mốc</h2>
          <label className="form-field">
            Quy tắc lễ âm lịch
            <select
              className="form-input"
              value={child.calendarRule ?? "SAME_DAY"}
              onChange={(e) =>
                updateChild({
                  ...child,
                  calendarRule: e.target.value as typeof child.calendarRule,
                })
              }
            >
              <option value="SAME_DAY">Giữ nguyên ngày</option>
              <option value="MINUS_ONE">Lùi một ngày</option>
              <option value="MINUS_TWO">Lùi hai ngày</option>
            </select>
          </label>
          <label className="form-field">
            Khi có tháng nhuận
            <select
              className="form-input"
              value={child.leapMonthRule ?? "REGULAR_MONTH"}
              onChange={(e) =>
                updateChild({
                  ...child,
                  leapMonthRule: e.target.value as typeof child.leapMonthRule,
                })
              }
            >
              <option value="REGULAR_MONTH">Ưu tiên tháng thường</option>
              <option value="LEAP_MONTH">Ưu tiên tháng nhuận</option>
              <option value="NEXT_AVAILABLE">Tháng phù hợp kế tiếp</option>
            </select>
          </label>
          <label className="form-field">
            Theo dõi đến độ tuổi
            <input
              className="form-input"
              type="number"
              min={2}
              max={100}
              value={child.trackingUntilAge ?? 18}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 2 && n <= 100)
                  updateChild({ ...child, trackingUntilAge: n });
              }}
            />
          </label>
          <p className="form-help">
            Gợi ý theo lịch Việt Nam UTC+7, hỗ trợ năm âm lịch{" "}
            {LUNAR_CALENDAR_RANGE.minYear}–{LUNAR_CALENDAR_RANGE.maxYear}. Gia
            đình luôn chọn và xác nhận ngày tổ chức; ngoài phạm vi này Mory
            không tự gợi ý ngày.
          </p>
        </section>
      </div>
      <section className="settings-card">
        <div className="section-heading">
          <h2>Cột mốc của con</h2>
          {tracking && (
            <button
              className="button button-secondary"
              onClick={() => setCustomOpen(true)}
            >
              <Plus size={15} />
              Thêm cột mốc riêng
            </button>
          )}
        </div>
        <div className="milestone-list">
          {generateMilestones(child, data.milestones).map((m) => {
            const chosenDate = milestoneDate(m);
            const labels = {
              SUGGESTED: "Gợi ý",
              PENDING_CONFIRMATION: "Chờ gia đình xác nhận",
              CONFIRMED: "Đã xác nhận",
              COMPLETED: "Đã hoàn thành",
              SKIPPED: "Đã bỏ qua",
            };
            return (
              <div
                className="milestone-row"
                key={m.id}
                id={`milestone-${m.id}`}
              >
                <span className="stat-icon purple">
                  <Star size={18} />
                </span>
                <div>
                  <h3>{m.title}</h3>
                  <p>
                    {chosenDate
                      ? formatDate(chosenDate)
                      : ["full-month", "first-birthday"].includes(m.kind)
                        ? "Gia đình chọn ngày tổ chức"
                        : "Chưa chọn ngày"}
                  </p>
                  {chosenDate &&
                    ["full-month", "first-birthday"].includes(m.kind) && (
                      <p className="milestone-lunar-date">
                        {lunarDateLabel(chosenDate)}
                      </p>
                    )}
                  <span
                    className={`badge ${m.state === "COMPLETED" ? "sage" : "purple"}`}
                  >
                    {labels[m.state]}
                  </span>
                </div>
                {tracking && m.kind !== "due" && (
                  <div className="form-actions">
                    <button
                      className="button button-secondary"
                      onClick={() => {
                        setCeremony(m);
                        setDate(chosenDate ?? todayVN());
                      }}
                    >
                      {m.state === "SKIPPED"
                        ? "Chọn lại ngày"
                        : m.confirmedDate || m.ceremonyDate
                          ? "Đổi ngày"
                          : "Lên lịch"}
                    </button>
                    {m.state === "CONFIRMED" &&
                      chosenDate &&
                      chosenDate <= todayVN() && (
                        <button
                          className="text-link"
                          aria-label={`Hoàn thành ${m.title}`}
                          onClick={() => changeMilestoneState(m, "COMPLETED")}
                        >
                          Hoàn thành
                        </button>
                      )}
                    {["SUGGESTED", "PENDING_CONFIRMATION"].includes(
                      m.state,
                    ) && (
                      <button
                        className="text-link"
                        aria-label={`Bỏ qua ${m.title}`}
                        onClick={() => changeMilestoneState(m, "SKIPPED")}
                      >
                        Bỏ qua
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="form-help">
          Mốc phát triển là những gợi ý để lưu kỷ niệm, không phải thời hạn con
          cần đạt được.
        </p>
      </section>
      <section className="settings-card tracking-settings">
        <h2>Nhắc nhở & hành trình</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={child.reminderEnabled ?? true}
            onChange={(e) =>
              updateChild({ ...child, reminderEnabled: e.target.checked })
            }
          />
          Lưu tùy chọn nhắc nhở của bé
        </label>
        <p className="form-help">Mory hiện chưa gửi thông báo tự động.</p>
        {["PAUSED", "ENDED"].includes(child.lifecycle) ? (
          <button
            className="button button-secondary"
            onClick={() => updateChild(resumeTracking(child))}
          >
            Tiếp tục hành trình
          </button>
        ) : (
          <button className="text-link" onClick={() => setPause(true)}>
            Tạm dừng hoặc kết thúc theo dõi
          </button>
        )}
      </section>
      <Dialog
        open={edit}
        title="Chỉnh sửa hồ sơ của bé"
        onClose={() => setEdit(false)}
        wide
      >
        <ChildForm
          child={child}
          mediaEnabled={mode !== "server"}
          onSave={async (c) => {
            if (await updateChild(c) !== false) setEdit(false);
          }}
          onClose={() => setEdit(false)}
        />
      </Dialog>
      <Dialog
        open={customOpen}
        title="Cột mốc theo nhịp riêng của con"
        onClose={() => setCustomOpen(false)}
      >
        {customOpen && (
          <CustomMilestoneForm
            onClose={() => setCustomOpen(false)}
            onSave={async (input) => {
              if (await createCustomMilestone(input) !== false) setCustomOpen(false);
            }}
          />
        )}
      </Dialog>
      <CeremonyDialog
        milestone={ceremony}
        date={date}
        setDate={setDate}
        close={() => setCeremony(undefined)}
      />
      <Dialog
        open={pause}
        title="Dành một khoảng lặng"
        onClose={() => setPause(false)}
      >
        <p>
          Bạn có thể tạm dừng hoặc khép lại việc theo dõi. Những kỷ niệm đã lưu
          sẽ ở lại và các nhắc nhở sẽ tắt.
        </p>
        <div className="form-actions">
          <button
            className="button button-secondary"
            onClick={() => {
              updateChild(changeTrackingState(child, "PAUSED"));
              setPause(false);
            }}
          >
            Tạm dừng
          </button>
          <button
            className="button button-secondary"
            onClick={() => {
              updateChild(changeTrackingState(child, "ENDED"));
              setPause(false);
              notify("Hành trình đã được lưu giữ");
            }}
          >
            Kết thúc theo dõi
          </button>
        </div>
      </Dialog>
    </>
  );
}
function CeremonyDialog({
  milestone,
  date,
  setDate,
  close,
}: {
  milestone?: ChildMilestone;
  date: string;
  setDate: (s: string) => void;
  close: () => void;
}) {
  const { confirmMilestoneEvent } = useJourney();
  const [error, setError] = useState("");
  const ceremony =
    milestone?.kind === "full-month" || milestone?.kind === "first-birthday";
  return (
    <Dialog
      open={!!milestone}
      title={`Xác nhận ${milestone?.title ?? "cột mốc"}`}
      onClose={close}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            if (!milestone) return;
            if (await confirmMilestoneEvent(milestone, date) !== false) close();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label className="form-field">
          {ceremony ? "Ngày tổ chức" : "Ngày diễn ra"}
          <input
            className="form-input"
            type="date"
            min="1900-01-01"
            max="2200-12-31"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setError("");
            }}
            required
          />
        </label>
        <p className="form-help">
          Ngày này do gia đình chọn. Mory lưu ngày đã xác nhận và một sự kiện
          trong hành trình; thay đổi quy tắc lịch sẽ không ghi đè ngày này.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" type="submit">
          Xác nhận và lưu sự kiện
        </button>
      </form>
    </Dialog>
  );
}
export function SettingsView() {
  const { data, reset, mode, notify } = useJourney();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="CHĂM CHÚT GÓC NHỎ"
        title="Cài đặt của gia đình"
        description="Để hành trình luôn vừa vặn với gia đình mình."
      />
      <div className="settings-layout">
        {mode === "server" && <><NotificationSettings /><AuditHistory /><PrivacyControls family /><Link className="button button-secondary" href="/account">Quản lý tài khoản</Link></>}
        <section className="settings-card">
          <ShieldCheck className="settings-feature-icon" size={30} />
          <h2>Dữ liệu & quyền riêng tư</h2>
          {mode === "server" ? <><p>Dữ liệu hành trình được lưu trong tài khoản gia đình trên máy chủ. Trình duyệt không lưu dữ liệu tài khoản vào localStorage.</p><p>Ảnh và xác minh/khôi phục email khả dụng khi được bật trên máy chủ. Bạn có thể quản lý lựa chọn nhận nhắc lịch ở bên dưới.</p><AccountSignOut /></> : <><p>
            Mory hiện là bản trải nghiệm, chưa có tài khoản hay đồng bộ máy chủ.
            Dữ liệu và ảnh được lưu trong localStorage của trình duyệt này; có
            thể mất khi xóa bộ nhớ, đổi thiết bị hoặc dùng chế độ riêng tư.
          </p></>}
          {mode !== "server" && <p>
            Chế độ demo không phải nơi lưu trữ an toàn cho dữ liệu trẻ em. Vui
            lòng dùng dữ liệu giả lập.
          </p>}
          <button
            className="button button-secondary"
            onClick={async () => {
              let exported: unknown = data;
              if (mode === "server") {
                try { const result = await exportFamilyData(); if (!result.ok) { notify(result.error); return; } exported = result.data; }
                catch { notify("Chưa xuất được dữ liệu. Vui lòng thử lại."); return; }
              }
              const blob = new Blob([JSON.stringify(exported, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `mory-ky-niem-${todayVN()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={17} />
            Xuất bản sao dữ liệu
          </button>
        </section>
        <section className="settings-card">
          <h2>Về Mory</h2>
          <div className="info-row">
            <span>Phiên bản</span>
            <strong>{mode === "server" ? "0.1 · Tài khoản gia đình" : "0.1 · Bản trải nghiệm"}</strong>
          </div>
          <div className="info-row">
            <span>Ngôn ngữ</span>
            <strong>Tiếng Việt</strong>
          </div>
          <div className="info-row">
            <span>Múi giờ</span>
            <strong>Asia/Ho_Chi_Minh</strong>
          </div>
          <p>Memory + Story. Mỗi kỷ niệm, một câu chuyện.</p>
          <p className="form-help">
            Trên thiết bị hỗ trợ, cài Mory từ menu trình duyệt hoặc nút cài đặt
            khi xuất hiện.
          </p>
        </section>
        {mode !== "server" && <section className="settings-card">
          <h2>Bắt đầu lại bản trải nghiệm</h2>
          <p>
            Xóa dữ liệu đang lưu và khôi phục gia đình mẫu. Hãy xuất bản sao nếu
            bạn muốn giữ những câu chuyện đã tạo.
          </p>
          <button
            className="button button-danger"
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={16} />
            Đặt lại dữ liệu demo
          </button>
        </section>}
      </div>
      <Dialog
        open={confirm}
        title="Đặt lại dữ liệu demo?"
        onClose={() => setConfirm(false)}
      >
        <p>
          Tất cả hồ sơ và kỷ niệm bạn đã thêm trên trình duyệt này sẽ được thay
          bằng dữ liệu mẫu.
        </p>
        <div className="form-actions">
          <button
            className="button button-secondary"
            onClick={() => setConfirm(false)}
          >
            Giữ dữ liệu
          </button>
          <button
            className="button button-danger"
            onClick={() => {
              reset();
              setConfirm(false);
            }}
          >
            Xác nhận đặt lại
          </button>
        </div>
      </Dialog>
    </>
  );
}
