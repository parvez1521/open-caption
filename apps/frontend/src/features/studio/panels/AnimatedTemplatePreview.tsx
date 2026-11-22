"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Page, Word } from "@capseasy/shared";
import { PageView, loadFontFamily, measure, type LookDefinition } from "@capseasy/templates";
import { acquireLivePreviewSlot, cancelLivePreviewWait, queueLivePreviewWait, releaseLivePreviewSlot } from "./livePreviewBudget";
import { isVisibleInViewport, registerLivePreviewElement, viewportDistancePx } from "./livePreviewVisibility";

/**
 * Live animated template preview for the picker: instead of a pre-rendered clip (which only 39 templates
 * have), this renders the template's OWN Page component through PageView — the exact render path the
 * studio preview and the Remotion export use — over a synthetic five-word page, driven by a looping
 * rAF clock. Every template therefore shows its real entrance, spoken-word and karaoke motion.
 *
 * Performance guardrails (a picker must never jank or crash a phone tab):
 *  - the poster (still / swatch) shows first; the live layer only mounts when the card is in or near
 *    the viewport (IntersectionObserver, 240px margin),
 *  - at most MAX_LIVE_PREVIEWS previews animate at once across the whole studio (the shared
 *    FIFO slot budget in livePreviewBudget.ts, also used by the Social Media previews),
 *  - leaving the viewport releases the slot (so below-fold cards are not starved by the first cards
 *    that ever approached) and stops the clock; unmounting does the same,
 *  - the slot lifecycle does NOT trust the observer alone: the shared scroll/resize sweep in
 *    livePreviewVisibility.ts re-checks each card's real rect and corrects `near` when IO
 *    misfires, and a grant is declined when the card is no longer geometrically near —
 *    on the live site the first cards kept their slots forever while scrolled-to cards
 *    never went live, even though this logic passes every mocked-IO test,
 *  - v3: the slot lifecycle keys on ACTUAL visibility (`visible`, 0px margin), not
 *    `near` (240px). v2 moved slots on a 1s interval but holders kept theirs while
 *    parked in the margin just off-screen, so all 3 slots could sit invisible while
 *    in-view cards queued. `near` now only preloads fonts; only a card any part of
 *    which is actually in the viewport holds a slot, and it releases the moment it
 *    leaves. `visible` is set from the live rect in the observer callback (immediate)
 *    and corrected by the sweep (within ~1s if the observer exit never arrives).
 *  - prefers-reduced-motion keeps the poster, always.
 */

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

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const AnimatedTemplatePreviewInner: React.FC<{ look: LookDefinition; poster: React.ReactNode }> = ({ look, poster }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  // Fix v3: actual visibility (0px margin) — the signal the SLOT lifecycle keys on.
  // `near` (240px) only preloads fonts; a card in the margin zone must never hold a slot.
  const [visible, setVisible] = useState(false);
  const [live, setLive] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const [timeMs, setTimeMs] = useState(0);
  const [, setFontTick] = useState(0);

  // Mirror of `near` for the geometry sweep (livePreviewVisibility.ts), which reads it
  // outside React renders: the sweep must compare the card's real rect against the
  // visibility the component currently believes, not a stale closure.
  const nearRef = useRef(false);
  useEffect(() => {
    nearRef.current = near;
  }, [near]);

  // Same mirror for `visible` — the sweep corrects it from the live rect too.
  const visibleRef = useRef(false);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  // Templates are composed for a full frame; in the small card the type is scaled up so the motion
  // reads at card size (the pre-rendered stills exaggerate size the same way). Motion is untouched.
  const style = useMemo(
    () => ({ ...look.style, fontSize: Math.min(260, look.style.fontSize * 2.4) }),
    [look.style],
  );

  useEffect(() => {
    const el = boxRef.current;
    if (!el || reducedMotion()) return;
    const io = new IntersectionObserver((entries) => {
      // `near` follows the observer's 240px margin (preload); `visible` follows the
      // card's real rect (0px, strict) so an in-view card goes live on enter with no
      // wait for the next sweep/interval tick. The sweep corrects `visible` within
      // ~1s when the observer exit never arrives — the live failure mode.
      setNear(entries.some((e) => e.isIntersecting));
      setVisible(isVisibleInViewport(el));
    }, { rootMargin: "240px" });
    io.observe(el);
    // Geometry safety net: the shared scroll/resize sweep re-checks this card's real rect
    // and corrects `near` AND `visible` when the observer misfires (the /looks jam).
    // Same reduced-motion gate as the observer — reduced-motion cards never register,
    // they keep the poster.
    const unregister = registerLivePreviewElement(el, () => nearRef.current, setNear, () => visibleRef.current, setVisible);
    return () => {
      io.disconnect();
      unregister();
    };
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

  // Slot lifecycle, keyed on ACTUAL visibility (fix v3): visible -> acquire (or queue);
  // the cleanup — which runs when the card leaves the viewport AND on unmount —
  // releases a held slot or cancels a queued wait, so slots recycle through the list
  // instead of being held forever by the first cards that approached.
  // (The previous version never invoked the grant callback on the immediate-acquire path, so no
  // preview ever went live and the leaked slots starved every other card.)
  //
  // Why `visible` and not `near`: `near` stays true while the card sits in the 240px
  // margin just off-screen, so a holder that scrolled out kept its slot and all 3
  // slots could park invisible while in-view cards queued (the v2 live result).
  // Keying on `visible` releases the slot the moment no part of the card is on
  // screen. `near` keeps only its preload job (fonts above); a margin-zone card
  // never acquires or queues here — when it scrolls into view, `visible` flips and
  // this effect acquires then. No hysteresis is applied: a card crossing the
  // viewport edge is a genuine state change, and re-entering restarts the
  // animation, which is the desired behaviour.
  //
  // Grant-time validation (v2, strict): a freed slot goes only to a card ACTUALLY in
  // the viewport, not one merely inside the 240px queueing margin — otherwise the slot
  // parks just off-screen while visible cards wait. The grant therefore checks strict
  // visibility (isVisibleInViewport, 0px margin) while `near` (queueing) keeps the
  // 240px margin. If the immediate acquire's strict grant declines — the card is in
  // the margin zone with a slot free — hand the slot back and QUEUE for the next
  // release / interval drain instead of dropping the wait: `near` is already true, so
  // no later flip would re-run this effect and the card would never go live when it
  // scrolls into view.
  useEffect(() => {
    if (!visible) {
      setLive(false);
      return;
    }
    let granted = false;
    let queued = false;
    const distance = (): number => {
      const el = boxRef.current;
      return el ? viewportDistancePx(el) : 0;
    };
    const grant = (): boolean => {
      const el = boxRef.current;
      if (el && !isVisibleInViewport(el)) return false;
      granted = true;
      setLive(true);
      return true;
    };
    if (acquireLivePreviewSlot("template", grant, distance)) {
      if (!grant()) {
        releaseLivePreviewSlot("template");
        queueLivePreviewWait("template", grant, distance);
        queued = true;
      }
    } else {
      queued = true;
    }
    return () => {
      if (granted) {
        setLive(false);
        releaseLivePreviewSlot("template");
      } else if (queued) {
        cancelLivePreviewWait("template", grant);
      }
    };
  }, [visible]);

  // The clock steps in authored frames (CANVAS.fps = 30), exactly like the Player and the export
  // advance the composition: stepping on every display refresh (60Hz+) would double the React
  // renders of every live preview while producing frames the composition never actually shows.
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const frameMs = 1000 / CANVAS.fps;
    const t0 = performance.now();
    let lastStep = -1;
    const tick = (now: number) => {
      const step = Math.floor((now - t0) / frameMs);
      if (step !== lastStep) {
        lastStep = step;
        setTimeMs((step * frameMs) % LOOP_MS);
      }
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
