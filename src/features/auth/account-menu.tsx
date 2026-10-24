"use client";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { ChevronDown, Settings, UserRound } from "lucide-react";
import { AccountSignOut } from "./account-sign-out";

export function AccountMenu({ name }: { name?: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const panelId = useId();
  const displayName = name?.trim() || "Tài khoản của bạn";
  const initial = Array.from(displayName)[0].toLocaleUpperCase("vi-VN");
  const close = () => { if (details.current) details.current.open = false; };

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !details.current?.contains(event.target) && details.current) details.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  return <details className="account-menu" ref={details} onKeyDown={(event) => {
    if (event.key === "Escape" && details.current?.open) {
      event.preventDefault(); close(); details.current.querySelector("summary")?.focus();
    }
  }}>
    <summary className="account-menu-trigger" aria-controls={panelId} aria-label={`Tài khoản: ${displayName}`}>
      <span className="parent-avatar" aria-hidden="true">{initial}</span>
      <span className="account-menu-name"><strong>{displayName}</strong><small>Tài khoản của bạn</small></span>
      <ChevronDown size={16} aria-hidden="true" />
    </summary>
    <div className="account-menu-panel" id={panelId}>
      <Link className="account-menu-item" href="/account" onClick={close}><UserRound size={18} aria-hidden="true" />Quản lý tài khoản</Link>
      <Link className="account-menu-item" href="/settings" onClick={close}><Settings size={18} aria-hidden="true" />Cài đặt gia đình</Link>
      <div className="account-menu-divider" />
      <AccountSignOut className="account-menu-item account-menu-signout" />
    </div>
  </details>;
}
