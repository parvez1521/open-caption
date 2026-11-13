"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/features/pwa/installPrompt";

/**
 * Registers the Captionit service worker once, on the client only.
 * Registration itself is production-gated inside registerServiceWorker, so
 * development never picks up a stale cache. Failures are swallowed: the
 * app works exactly as before without a worker.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
