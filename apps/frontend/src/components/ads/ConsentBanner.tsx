"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "@/components/ui/icons";
import { readAdConsent, writeAdConsent, AD_CONSENT_REOPEN_EVENT, type AdConsentChoice } from "@/lib/adConsent";
import { useDialogEscapeAndTrap } from "@/features/studio/useDialogEscapeAndTrap";

/**
 * First-party consent banner (A-13, 2026-11-15; CAP-S07, r3).
 *
 * Shows once, at the bottom of every page, only while advertising or
 * analytics is configured (a publisher id or a GA4 measurement id exists)
 * and the visitor has made no choice yet. Accept loads Google's AdSense
 * code (via AdSenseLoader) and GA4 (via GaLoader) — whichever is
 * configured; the copy names what Accept enables. Decline loads nothing.
 * The choice is stored in localStorage and the banner never asks again on
 * this browser; clearing site data resets it.
 * House SVG icons only, full-dark, no third-party CMP script.
 */
export function ConsentBanner({ enabled, adsEnabled = true, analyticsEnabled = false }: { enabled: boolean; adsEnabled?: boolean; analyticsEnabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // MA-A5-004: the banner is a dialog — trap Tab inside it, move focus in on
  // open, and return focus on close, like ExportModal. Escape only dismisses
  // it for this page view (no choice is recorded, so it asks again next load).
  useDialogEscapeAndTrap(dialogRef, () => setVisible(false), visible);

  useEffect(() => {
    if (!enabled) return;
    setVisible(readAdConsent() === null);
  }, [enabled]);

  // A stored choice can be changed without clearing site data: the footer,
  // Settings and Cookie Policy controls dispatch the reopen event and the
  // banner asks again.
  useEffect(() => {
    if (!enabled) return;
    const reopen = () => setVisible(true);
    window.addEventListener(AD_CONSENT_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(AD_CONSENT_REOPEN_EVENT, reopen);
  }, [enabled]);

  if (!enabled || !visible) return null;

  const choose = (choice: AdConsentChoice) => {
    writeAdConsent(choice);
    setVisible(false);
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label={adsEnabled ? "Advertising consent" : "Analytics consent"}
      className="fixed inset-x-4 bottom-4 z-50 rounded-2xl border border-[#FFFFEB]/15 bg-[#141412] p-4 text-[#FFFFEB] shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-sm sm:p-5"
    >
      <p className="flex items-start gap-2.5 text-sm leading-snug">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#34D399]" aria-hidden />
        <span>
          {adsEnabled && analyticsEnabled
            ? "Ads keep Captionit free. Allow personalised ads and anonymous usage analytics from Google?"
            : adsEnabled
              ? "Ads keep Captionit free. Allow personalised ads from Google?"
              : "Help improve Captionit by allowing anonymous usage analytics from Google?"}
        </span>
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => choose("accepted")}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#34D399] px-4 text-sm font-semibold text-[#141412]"
        >
          <Check className="h-4 w-4" aria-hidden />
          Accept
        </button>
        <button
          type="button"
          onClick={() => choose("declined")}
          className="inline-flex min-h-10 items-center rounded-full border border-[#FFFFEB]/25 px-4 text-sm font-medium text-[#FFFFEB]/80"
        >
          Decline
        </button>
        <Link href="/cookies" className="ml-auto text-xs text-[#FFFFEB]/60 underline underline-offset-4">
          Cookie policy
        </Link>
      </div>
    </div>
  );
}
