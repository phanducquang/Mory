"use client";
import { useCallback, useEffect, useState } from "react";

export function useToast() {
  const [notification, setNotification] = useState({ message: "" });
  const notify = useCallback((message: string) => setNotification({ message }), []);

  useEffect(() => {
    if (!notification.message) return;
    const timer = setTimeout(() => setNotification({ message: "" }), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  return [notification.message, notify] as const;
}
