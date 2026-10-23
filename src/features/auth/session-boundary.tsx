"use client";
import { useEffect } from "react";
/** Revalidate a page restored from the browser's back/forward cache before exposing stale account UI. */
export function SessionBoundary() {
  useEffect(() => {
    const check = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", check); return () => window.removeEventListener("pageshow", check);
  }, []);
  return null;
}
