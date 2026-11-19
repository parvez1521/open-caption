"use client";

import { useEffect } from "react";
import { AD_CONSENT_EVENT, readAdConsent } from "@/lib/adConsent";

/**
 * AdSense loader, gated on ad consent (A-13, 2026-11-15).
 *
 * The script is injected into <head> only when the visitor's stored
 * choice is "accepted" — either already stored when the page loads, or
 * granted later in the session via the consent banner (which dispatches
 * AD_CONSENT_EVENT). With no stored choice, or after Decline, zero ad
 * code is loaded and no ad request is made. There are no ad slots yet,
 * so this is only the loader; slots will need the same gate.
 *
 * GA4 is gated the same way by its own loader (components/ads/GaLoader.tsx),
 * on the same stored choice; this component only handles AdSense.
 */
export function AdSenseLoader({ publisherId }: { publisherId: string | undefined }) {
  useEffect(() => {
    if (!publisherId) return;
    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${publisherId}`;
    const inject = () => {
      if (readAdConsent() !== "accepted") return;
      if (document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement("script");
      script.async = true;
      script.src = src;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    };
    inject();
    window.addEventListener(AD_CONSENT_EVENT, inject);
    return () => window.removeEventListener(AD_CONSENT_EVENT, inject);
  }, [publisherId]);
  return null;
}
