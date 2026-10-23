"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Heart,
  House,
  Leaf,
  Plus,
  Settings,
  Sprout,
  X,
} from "lucide-react";
import { useJourney } from "@/features/app/journey-provider";
import { PwaSupport } from "@/components/pwa/pwa-support";
const navigation = [
  { href: "/home", label: "Tổ ấm", icon: House },
  { href: "/timeline", label: "Hành trình", icon: BookOpen },
  { href: "/events", label: "Sự kiện", icon: CalendarDays },
  { href: "/children", label: "Hồ sơ của bé", icon: Heart },
];
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data, child, switchChild, openEvent, mode } = useJourney();
  const [notifications, setNotifications] = useState(false);
  const title = path.startsWith("/timeline")
    ? "Hành trình của con"
    : path.startsWith("/events")
      ? "Những cuộc hẹn yêu thương"
      : path.startsWith("/children")
        ? "Hồ sơ của bé"
        : path.startsWith("/settings")
          ? "Cài đặt"
          : path.startsWith("/onboarding")
            ? "Một hành trình mới"
            : "Tổ ấm của bạn";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/home" className="brand" aria-label="Mory - về tổ ấm">
          <span className="brand-symbol">
            <Sprout size={27} />
          </span>
          mory<span className="brand-dot">.</span>
        </Link>
        <p className="brand-tagline">Mỗi kỷ niệm, một câu chuyện.</p>
        <div className="family-label">KHÔNG GIAN GIA ĐÌNH</div>
        <div className="child-switcher">
          <div className="child-avatar">
            {child.avatar ? (
              <Image
                src={child.avatar}
                alt=""
                width={38}
                height={38}
                unoptimized
              />
            ) : (
              <span>{child.name.slice(0, 1)}</span>
            )}
          </div>
          <div>
            <small>Đồng hành cùng</small>
            <select
              aria-label="Chọn bé"
              value={child.id}
              onChange={(e) => switchChild(e.target.value)}
            >
              {data.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nickname ?? c.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={16} />
        </div>
        <nav className="desktop-nav" aria-label="Điều hướng chính">
          {navigation.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`nav-link ${path.startsWith(n.href) ? "active" : ""}`}
              aria-current={path.startsWith(n.href) ? "page" : undefined}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {path.startsWith(n.href) && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <button className="sidebar-add" onClick={(event) => { event.currentTarget.focus(); openEvent(); }}>
          <Plus size={18} /> Lưu kỷ niệm mới
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={22} />
            <p>
              Con lớn lên mỗi ngày.
              <br />
              <strong>Ký ức ở lại mãi.</strong>
            </p>
            <span>✧</span>
          </div>
          <Link
            href="/settings"
            className={`nav-link ${path === "/settings" ? "active" : ""}`}
          >
            <Settings size={19} /> Cài đặt
          </Link>
          <div className="family-profile">
            <div className="parent-avatar">G</div>
            <div>
              <strong>Gia đình nhỏ</strong>
              <small>Góc bình yên của chúng mình</small>
            </div>
            <Heart size={15} />
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-location">
            <Link
              href="/home"
              className="mobile-brand"
              aria-label="Mory - về tổ ấm"
            >
              mory.
            </Link>
            <div className="mobile-child-select">
              <select
                aria-label="Chọn bé trên điện thoại"
                value={child.id}
                onChange={(e) => switchChild(e.target.value)}
              >
                {data.children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nickname ?? c.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
            <span className="desktop-location">
              Không gian của bạn <span>/</span> <strong>{title}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="private-label">
              <span />
              Riêng tư & yêu thương
            </span>
            <div className="notification-wrap">
              <button
                className="icon-button"
                aria-label="Thông báo"
                onClick={() => setNotifications(!notifications)}
                aria-expanded={notifications}
              >
                <Bell size={20} />
                <i />
              </button>
              {notifications && (
                <div className="notification-panel">
                  <div className="section-heading">
                    <h3>Nhắc nhở của gia đình</h3>
                    <button
                      className="icon-button"
                      aria-label="Đóng thông báo"
                      onClick={() => setNotifications(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p>
                    Các cuộc hẹn sắp tới được hiển thị trong mục Sự kiện. Bản
                    hiện chưa gửi thông báo tự động.
                  </p>
                  <Link href="/events" onClick={() => setNotifications(false)}>
                    Xem các cuộc hẹn <ArrowUpRight size={15} />
                  </Link>
                </div>
              )}
            </div>
            <Link
              href="/settings"
              className="header-avatar"
              aria-label="Cài đặt gia đình"
            >
              G
            </Link>
          </div>
        </header>
        <main className="main-content">
          {children}
          <PwaSupport />
          <footer className="page-footer">
            <Sprout size={16} />
            <span>Để mai này, mình cùng kể lại.</span>
            <span className="demo-tag">
              {mode === "server" ? "Không gian gia đình · Đã đăng nhập" : "Bản trải nghiệm · Lưu trên trình duyệt"}
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Điều hướng di động">
        {navigation.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={path.startsWith(n.href) ? "active" : ""}
          >
            <n.icon size={21} />
            <span>{n.label === "Hồ sơ của bé" ? "Hồ sơ" : n.label}</span>
          </Link>
        ))}
        <button onClick={(event) => { event.currentTarget.focus(); openEvent(); }} aria-label="Lưu kỷ niệm mới">
          <Plus size={23} />
        </button>
      </nav>
    </div>
  );
}
