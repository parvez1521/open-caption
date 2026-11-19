"use client";

import { useEffect } from "react";
import { AD_CONSENT_EVENT, readAdConsent } from "@/lib/adConsent";

/**
 * GA4 loader, gated on consent (CAP-S07, r3).
 *
 * The gtag script + config are injected into <head> only when the
 * visitor's stored choice is "accepted" — either already stored when the
 * page loads, or granted later in the session via the consent banner
 * (which dispatches AD_CONSENT_EVENT). With no stored choice, or after
 * Decline, zero analytics code is loaded and no GA4 request is made.
 * It shares the single consent choice with AdSense (see lib/adConsent.ts):
 * the banner asks once and Accept enables both loaders; the banner copy
 * names both when both are configured. Before the fix this tag was a
 * plain script in the root layout's <head>, loading whenever its env var
 * was set — the server cannot know the stored choice, so a <script> there
 * would load Google's analytics code before consent.
 */
export function GaLoader({ measurementId }: { measurementId: string | undefined }) {
  useEffect(() => {
    if (!measurementId) return;
    const src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    const inject = () => {
      if (readAdConsent() !== "accepted") return;
      if (document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement("script");
      script.async = true;
      script.src = src;
      document.head.appendChild(script);
      const config = document.createElement("script");
      config.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${measurementId}');`;
      document.head.appendChild(config);
    };
    inject();
    window.addEventListener(AD_CONSENT_EVENT, inject);
    return () => window.removeEventListener(AD_CONSENT_EVENT, inject);
  }, [measurementId]);
  return null;
}
