"use client";
import { useId, useState } from "react";
import { LogOut } from "lucide-react";

export function AccountSignOut({ className = "button button-secondary" }: { className?: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  return <>
    <button type="button" className={className} disabled={busy} aria-busy={busy} aria-describedby={error ? errorId : undefined} onClick={async () => {
      if (busy) return;
      setBusy(true); setError("");
      try {
        const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (!response.ok) throw new Error();
        window.location.replace("/login");
      } catch { setError("Chưa đăng xuất được. Vui lòng thử lại."); setBusy(false); }
    }}><LogOut size={18} aria-hidden="true" /><span>{busy ? "Đang đăng xuất…" : "Đăng xuất"}</span></button>
    {error && <p className="form-error signout-error" id={errorId} role="alert">{error}</p>}
  </>;
}
