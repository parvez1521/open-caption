"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Page, Word } from "@capseasy/shared";
import { PageView, loadFontFamily, measure, type LookDefinition } from "@capseasy/templates";

/**
 * Live animated template preview for the picker: instead of a pre-rendered clip (which only 39 templates
 * have), this renders the template's OWN Page component through PageView — the exact render path the
 * studio preview and the Remotion export use — over a synthetic five-word page, driven by a looping
 * rAF clock. Every template therefore shows its real entrance, spoken-word and karaoke motion.
 *
 * Performance guardrails (a picker must never jank or crash a phone tab):
 *  - the poster (still / swatch) shows first; the live layer only mounts when the card is in or near
 *    the viewport (IntersectionObserver, 240px margin),
 *  - at most MAX_LIVE previews animate at once across the whole panel (FIFO slot queue),
 *  - leaving the viewport releases the slot (so below-fold cards are not starved by the first cards
 *    that ever approached) and stops the clock; unmounting does the same,
 *  - prefers-reduced-motion keeps the poster, always.
 */

const MAX_LIVE = 6;

/** Our own sample line, timed like speech: five words over ~2.3 s, then the loop restarts. */
const SAMPLE_WORDS: Word[] = ["Make", "every", "single", "word", "count"].map((text, i) => ({
  id: `preview-${i}`,
  text,
  startMs: i * 480,
  endMs: i * 480 + 400,
}));
const PAGE_END_MS = 2700;
/** the loop is exactly the page: holding past PAGE_END_MS would render PageView's null (a black flash) */
const LOOP_MS = PAGE_END_MS;
const CANVAS = { width: 1080, height: 405, fps: 30 };
const PREVIEW_PAGE: Page = {
  id: "template-preview",
  startMs: 0,
  endMs: PAGE_END_MS,
  words: SAMPLE_WORDS,
  lines: [SAMPLE_WORDS],
  heroIndex: 4,
  emotion: "neutral",
  position: null,
  styleOverride: null,
};

/* ---------- shared live-slot budget (FIFO) ---------- */
let liveCount = 0;
const waiters: Array<() => void> = [];
function acquireSlot(grant: () => void): boolean {
  if (liveCount < MAX_LIVE) {
    liveCount += 1;
    return true;
  }
  waiters.push(grant);
  return false;
}
function releaseSlot() {
  liveCount = Math.max(0, liveCount - 1);
  while (liveCount < MAX_LIVE && waiters.length > 0) {
    const next = waiters.shift()!;
    liveCount += 1;
    next();
  }
}
function cancelWait(grant: () => void) {
  const i = waiters.indexOf(grant);
  if (i >= 0) waiters.splice(i, 1);
}

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const AnimatedTemplatePreviewInner: React.FC<{ look: LookDefinition; poster: React.ReactNode }> = ({ look, poster }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [live, setLive] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const [timeMs, setTimeMs] = useState(0);
  const [, setFontTick] = useState(0);

  // Templates are composed for a full frame; in the small card the type is scaled up so the motion
  // reads at card size (the pre-rendered stills exaggerate size the same way). Motion is untouched.
  const style = useMemo(
    () => ({ ...look.style, fontSize: Math.min(260, look.style.fontSize * 2.4) }),
    [look.style],
  );

  useEffect(() => {
    const el = boxRef.current;
    if (!el || reducedMotion()) return;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // load this look's fonts as its card approaches, then re-render once so the preview (poster swatch
  // and live layer alike) draws in the real face instead of a fallback. Per-card and lazy on purpose:
  // the panel used to download every look's full font set up front, which starved the first click.
  const fontLoadStarted = useRef(false);
  useEffect(() => {
    if (!near || fontLoadStarted.current) return;
    fontLoadStarted.current = true;
    const families = [look.style.fontId, look.style.hero.fontId ?? ""].filter(Boolean);
    void Promise.all(families.map(loadFontFamily)).then(() => setFontTick((n) => n + 1));
  }, [near, look.style.fontId, look.style.hero.fontId]);

  // Slot lifecycle, keyed on visibility: near -> acquire (or queue); the cleanup — which runs when the
  // card leaves the viewport AND on unmount — releases a held slot or cancels a queued wait, so slots
  // recycle through the list instead of being held forever by the first cards that approached.
  // (The previous version never invoked the grant callback on the immediate-acquire path, so no
  // preview ever went live and the leaked slots starved every other card.)
  useEffect(() => {
    if (!near) {
      setLive(false);
      return;
    }
    let granted = false;
    const grant = () => {
      granted = true;
      setLive(true);
    };
    if (acquireSlot(grant)) grant();
    return () => {
      if (granted) {
        setLive(false);
        releaseSlot();
      } else {
        cancelWait(grant);
      }
    };
  }, [near]);

  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setTimeMs((now - t0) % LOOP_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  const scale = boxW > 0 ? boxW / CANVAS.width : 0;
  return (
    <div ref={boxRef} className="relative aspect-[8/3] overflow-hidden bg-black">
      {poster}
      {live && scale > 0 ? (
        <div className="absolute inset-0 bg-black" aria-hidden>
          <div style={{ width: CANVAS.width, height: CANVAS.height, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative" }}>
            <PageView page={PREVIEW_PAGE} timeMs={timeMs} style={style} canvas={CANVAS} measure={measure} />
          </div>
        </div>
      ) : null}
    </div>
  );
};

/**
 * Memoized on the look alone: the poster is a pure function of the look, and a parent re-render (a
 * selection change, the 15 Hz playback time feed) must not re-render 141 previews. Only the cards
 * whose look object changes re-render.
 */
export const AnimatedTemplatePreview = React.memo(
  AnimatedTemplatePreviewInner,
  (a, b) => a.look === b.look,
);
