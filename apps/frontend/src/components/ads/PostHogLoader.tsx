"use client";

import { useEffect } from "react";
import { AD_CONSENT_EVENT, readAdConsent } from "@/lib/adConsent";

/**
 * PostHog loader, gated on consent (2026-11-28).
 *
 * posthog-js is dynamically imported and initialised only when the
 * visitor's stored choice is "accepted" — either already stored when the
 * page loads, or granted later in the session via the consent banner
 * (which dispatches AD_CONSENT_EVENT). With no stored choice, or after
 * Decline, zero PostHog code is loaded and no event is sent. It shares
 * the single consent choice with AdSense and GA4 (see lib/adConsent.ts):
 * the banner asks once and Accept enables all configured loaders; the
 * banner copy names PostHog alongside Google when PostHog is configured.
 * The module-level guard keeps a remount, a StrictMode double-effect or
 * a repeat consent event from initialising twice for the same key.
 */
let initializedFor: string | null = null;

export function PostHogLoader({ apiKey, apiHost }: { apiKey: string | undefined; apiHost: string }) {
  useEffect(() => {
    if (!apiKey) return;
    const init = async () => {
      if (readAdConsent() !== "accepted") return;
      if (initializedFor === apiKey) return;
      initializedFor = apiKey;
      const { default: posthog } = await import("posthog-js");
      posthog.init(apiKey, { api_host: apiHost, capture_pageview: true });
    };
    init();
    window.addEventListener(AD_CONSENT_EVENT, init);
    return () => window.removeEventListener(AD_CONSENT_EVENT, init);
  }, [apiKey, apiHost]);
  return null;
}
