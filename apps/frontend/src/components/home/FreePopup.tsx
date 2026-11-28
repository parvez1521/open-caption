"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { anyModalOpen } from "@/features/studio/modalGuard";
import { useDialogEscapeAndTrap } from "@/features/studio/useDialogEscapeAndTrap";
import {
  dismissFreePopup,
  FREE_POPUP_DELAY_MS,
  shouldShowFreePopup,
} from "./freePopup";

/**
 * Homepage "Free until 5th December" popup (owner order 2026-11-28).
 *
 * The 5s timer starts when `ready` flips true — i.e. once the intro
 * curtain has lifted and the homepage is running. At fire time it checks
 * the 7-day dismissal suppression and the free window again, and if
 * another dialog (cookie banner, etc.) is open it waits and re-checks
 * every second instead of stacking on top of it. Close button and Escape
 * both dismiss; a dismissal hides the popup for 7 days (localStorage).
 *
 * Visuals follow the brand: dark #141412 / #1E1E1B, off-white text,
 * emerald CTA, orange date accent. No glass, no gradients, no orbs.
 */

/** ms between re-checks while another dialog is open at fire time. */
const MODAL_RETRY_MS = 1000;

export function FreePopup({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    dismissFreePopup();
    setDismissed(true);
    setVisible(false);
  }, []);

  // shared dialog behaviour: Escape closes, Tab is trapped, focus lands
  // on the dialog when it opens and returns where it was on close
  useDialogEscapeAndTrap(dialogRef, close, visible);

  useEffect(() => {
    if (!ready || visible || dismissed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const fire = () => {
      if (stopped) return;
      // dismissed in another tab, or the free window ended meanwhile
      if (!shouldShowFreePopup()) return;
      if (anyModalOpen()) {
        timer = setTimeout(fire, MODAL_RETRY_MS);
        return;
      }
      setVisible(true);
    };
    timer = setTimeout(fire, FREE_POPUP_DELAY_MS);
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [ready, visible, dismissed]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-popup-title"
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl border border-[#FFFFEB]/10 bg-[#1E1E1B] p-6 shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="free-popup-title"
            className="text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-[#FFFFEB]"
          >
            Free until <span className="text-[#FFA946]">5th December</span>
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="shrink-0 rounded-full border border-[#FFFFEB]/15 px-2.5 py-1 text-sm font-bold leading-none text-[#FFFFEB]/70"
          >
            ×
          </button>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-[#FFFFEB]/80">
          Everything is free till 5 Dec 2026, 23:59 IST — no card needed.
          From 6 Dec: Free ₹0 · Starter ₹149 · Plus ₹499 · Pro ₹799.
        </p>
        <Link
          href="/start"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#34D399] px-8 py-3.5 text-base font-bold text-[#141412]"
        >
          Start free <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
