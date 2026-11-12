"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoadingMark } from "./LoadingMark";

/**
 * The loading mark between events. Anything that takes a moment (opening a project, creating one, leaving the studio) shows the
 * loading mark over the page instead of leaving the screen frozen. Two rules keep it from ever slowing things down:
 *   - it only appears if the wait lasts longer than SHOW_AFTER_MS, so quick moves stay instant, and
 *   - once it appears it stays at least MIN_SHOW_MS, so it never flashes.
 */
const SHOW_AFTER_MS = 90;
const MIN_SHOW_MS = 380;
const GIVE_UP_MS = 12_000;

interface BrandNavApi {
  /** Navigate with the loading mark over the wait. */
  go: (href: string, label?: string, opts?: { replace?: boolean }) => void;
  /** Show the loading mark for work that isn't a navigation. Call the returned function when the work is done. */
  busy: (label?: string) => () => void;
}

const Ctx = createContext<BrandNavApi | null>(null);

export function useBrandNav(): BrandNavApi {
  const c = useContext(Ctx);
  // outside the provider (tests, other layouts): behave like plain navigation
  const router = useRouter();
  return useMemo(() => c ?? { go: (href, _l, o) => (o?.replace ? router.replace(href) : router.push(href)), busy: () => () => undefined }, [c, router]);
}

export function BrandNavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [veil, setVeil] = useState<{ label: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const holds = useRef(0);
  const labelRef = useRef("Loading");
  const shownAt = useRef(0);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target = useRef<string | null>(null);

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (giveUp.current) clearTimeout(giveUp.current);
    showTimer.current = hideTimer.current = giveUp.current = null;
  };

  const release = useCallback(() => {
    holds.current = Math.max(0, holds.current - 1);
    if (holds.current > 0) return;
    if (showTimer.current) {
      // never became visible: nothing to take down
      clearTimeout(showTimer.current);
      showTimer.current = null;
      if (giveUp.current) clearTimeout(giveUp.current);
      return;
    }
    const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - shownAt.current));
    hideTimer.current = setTimeout(() => {
      setLeaving(true);
      hideTimer.current = setTimeout(() => {
        setVeil(null);
        setLeaving(false);
      }, 170);
    }, wait);
    if (giveUp.current) clearTimeout(giveUp.current);
  }, []);

  const hold = useCallback((label: string) => {
    labelRef.current = label;
    holds.current += 1;
    if (hideTimer.current) {
      // came back while leaving: keep the same veil
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
      setLeaving(false);
      setVeil({ label });
    } else if (!showTimer.current && holds.current === 1) {
      showTimer.current = setTimeout(() => {
        showTimer.current = null;
        shownAt.current = Date.now();
        setLeaving(false);
        setVeil({ label: labelRef.current });
      }, SHOW_AFTER_MS);
    } else {
      setVeil((v) => (v ? { label } : v));
    }
    if (giveUp.current) clearTimeout(giveUp.current);
    giveUp.current = setTimeout(() => {
      holds.current = 0;
      target.current = null;
      clearTimers();
      setVeil(null);
      setLeaving(false);
    }, GIVE_UP_MS);
  }, []);

  const go = useCallback<BrandNavApi["go"]>(
    (href, label = "Loading", opts) => {
      const path = href.split(/[?#]/)[0]!;
      if (path === window.location.pathname) {
        if (opts?.replace) router.replace(href);
        else router.push(href);
        return;
      }
      target.current = path;
      hold(label);
      if (opts?.replace) router.replace(href);
      else router.push(href);
    },
    [hold, router],
  );

  const busy = useCallback<BrandNavApi["busy"]>(
    (label = "Working") => {
      hold(label);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        release();
      };
    },
    [hold, release],
  );

  // the new page is on screen: take the mark down (its own skeleton carries on from here)
  useEffect(() => {
    if (target.current && pathname === target.current) {
      target.current = null;
      release();
    }
  }, [pathname, release]);

  useEffect(() => () => clearTimers(), []);

  const api = useMemo<BrandNavApi>(() => ({ go, busy }), [go, busy]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {veil ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed inset-0 z-[95] grid place-items-center bg-sand-50/80 backdrop-blur-[3px] transition-opacity duration-150 ${leaving ? "opacity-0" : "ce-veil"}`}
        >
          <div className="ce-veil-card flex flex-col items-center gap-4 rounded-2xl border border-sand-200 bg-sand-50 px-9 py-7 shadow-sand-soft">
            <LoadingMark height={44} tone="dark" />
            <p className="text-[14px] font-semibold text-ink">{veil.label}…</p>
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
