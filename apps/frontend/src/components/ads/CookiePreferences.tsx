"use client";

import { useEffect, useState } from "react";
import { AD_CONSENT_EVENT, readAdConsent, writeAdConsent, type AdConsentChoice } from "@/lib/adConsent";

/**
 * Cookie-preference control (production-pages audit): the consent banner
 * asks once and the choice lives in localStorage under
 * `captionit-ad-consent`. This control lets the visitor see and change
 * that choice without clearing site data — the same key the banner writes,
 * so the two can never disagree. Used on the Cookie Policy page and in
 * Settings.
 */
export function CookiePreferencesControl() {
  const [choice, setChoice] = useState<AdConsentChoice | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setChoice(readAdConsent());
    const refresh = () => setChoice(readAdConsent());
    window.addEventListener(AD_CONSENT_EVENT, refresh);
    return () => window.removeEventListener(AD_CONSENT_EVENT, refresh);
  }, []);

  const choose = (next: AdConsentChoice) => {
    writeAdConsent(next);
    setChoice(next);
    setSaved(true);
  };

  return (
    <div>
      <p role="status" aria-live="polite" className="text-sm">
        {choice === null
          ? "You have not made an advertising choice yet — the banner will ask on your next visit."
          : choice === "accepted"
            ? "Your current choice: advertising and analytics allowed."
            : "Your current choice: advertising and analytics declined."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => choose("accepted")}
          aria-pressed={choice === "accepted"}
          className="rounded-full bg-obsidian px-5 py-2.5 text-sm font-semibold text-major"
        >
          Allow ads and analytics
        </button>
        <button
          type="button"
          onClick={() => choose("declined")}
          aria-pressed={choice === "declined"}
          className="rounded-full border border-obsidian/25 px-5 py-2.5 text-sm font-semibold text-obsidian"
        >
          Decline ads and analytics
        </button>
        {saved ? <span className="text-sm font-medium text-obsidian/70">Choice saved.</span> : null}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-obsidian/70">
        This only changes the choice stored in this browser. It does not delete your projects or sign you out.
      </p>
    </div>
  );
}
