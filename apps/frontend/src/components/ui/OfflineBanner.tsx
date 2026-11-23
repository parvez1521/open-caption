"use client";

import { useEffect, useState } from "react";

/**
 * Offline banner (production-pages audit): the service worker already
 * serves an honest offline page for navigations, but nothing told the
 * user the app was offline once loaded. This listens to the browser's
 * online/offline events and shows a short banner while offline; it says
 * nothing about what works offline beyond the Studio's own retrying save
 * state.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOffline = () => setOnline(false);
    const goOnline = () => setOnline(true);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (online) return null;

  return (
    <div role="status" className="border-b border-orange-accent/60 bg-orange-accent/10 px-4 py-2.5 text-center text-[13px] font-medium text-obsidian">
      You are offline. Some features need a connection — your work on this device is safe, and Studio saves will retry when you are back online.
    </div>
  );
}
