"use client";
import { startTransition, useEffect, useRef, useState } from "react";
import { readTimeline } from "@/app/actions/journey";
import type { TimelineQuery, InitialTimelinePage } from "@/lib/validation/timeline-query";
import type { Event } from "@/types/domain";

export function useServerTimeline(enabled: boolean, childId: string, query: TimelineQuery, revision = 0, initialPage?: InitialTimelinePage) {
  const key = JSON.stringify([childId, query, revision]);
  const seedKey = initialPage ? JSON.stringify([initialPage.childId, initialPage.query, 0]) : "";
  const firstRender = useRef(true);
  const [page, setPage] = useState<{ key: string; events: Event[]; nextCursor?: string; error?: string }>(initialPage ? { ...initialPage, key: seedKey } : { key: "", events: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    if (firstRender.current) {
      firstRender.current = false;
      if (key === seedKey) return;
    }
    let cancelled = false;
    // Debounce typing, and discard responses from previous child/filter selections.
    const timer = setTimeout(() => startTransition(async () => {
      const [id, input] = JSON.parse(key) as [string, TimelineQuery];
      try { const result = await readTimeline(id, input); if (!cancelled) setPage({ key, ...result }); }
      catch { if (!cancelled) setPage({ key, events: [], error: "Chưa tải được hành trình. Vui lòng tải lại hoặc đăng nhập lại." }); }
    }), 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, key, seedKey]);
  return {
    events: page.key === key ? page.events : [], nextCursor: page.key === key ? page.nextCursor : undefined,
    error: page.key === key ? page.error : undefined, loading: enabled && page.key !== key, loadingMore,
    loadMore: async () => {
      if (!page.nextCursor || page.key !== key || loadingMore) return;
      setLoadingMore(true);
      try {
        const result = await readTimeline(childId, query, page.nextCursor);
        setPage((previous) => previous.key === key ? { key, events: [...new Map([...previous.events, ...result.events].map((e) => [e.id, e])).values()], nextCursor: result.nextCursor } : previous);
      } catch { setPage((previous) => previous.key === key ? { ...previous, error: "Chưa tải được trang tiếp theo. Vui lòng thử lại." } : previous); }
      finally { setLoadingMore(false); }
    },
  };
}
