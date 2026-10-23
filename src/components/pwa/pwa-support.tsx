"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Optional install/update controls. Registration runs only in production. */
export function PwaSupport() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    let active = true;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          if (!active) return;
          if (registration.waiting) setWaitingWorker(registration.waiting);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                active &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setWaitingWorker(worker);
            });
          });
        })
        .catch(() => {
          // Registration failure does not block the application.
        });
    }
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    setIsInstalling(true);
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } finally {
      setIsInstalling(false);
    }
  }

  function update() {
    if (!waitingWorker) return;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  if (!installPrompt && !waitingWorker) return null;
  return (
    <aside
      aria-label="Cài đặt ứng dụng"
      className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600"
    >
      <span>
        {waitingWorker
          ? "Mory có phiên bản mới. Hãy lưu thay đổi trước khi cập nhật."
          : "Giữ Mory gần bên trên màn hình chính."}
      </span>
      <button
        type="button"
        onClick={waitingWorker ? update : install}
        disabled={isInstalling}
        className="rounded-xl bg-[#7962AB] px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {waitingWorker
          ? "Cập nhật Mory"
          : isInstalling
            ? "Đang cài đặt…"
            : "Cài đặt Mory"}
      </button>
    </aside>
  );
}
