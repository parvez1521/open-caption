"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { OverlayItem, OverlaySocialVariant } from "@capseasy/shared";
import { OverlayView } from "@capseasy/compositions";
import { makeSocialOverlay } from "./overlayItems";
import { acquireLivePreviewSlot, cancelLivePreviewWait, releaseLivePreviewSlot } from "./livePreviewBudget";

/**
 * Live animated preview for a Social Media graphic in the Elements picker — the fix for the owner
 * bug (2026-11-10) where these cards showed only a name + description and never played, so there
 * was no way to see what a graphic does before placing it.
 *
 * Like AnimatedTemplatePreview, this renders the REAL thing through the exact shared render path:
 * the synthetic item is built by makeSocialOverlay (the same builder the card's click uses) and
 * drawn by OverlayView — the component CaptionedVideo feeds in the studio preview and the export —
 * driven by a looping clock over the item's own window. Preview ≡ what lands on the video by
 * construction; there is no mock, thumbnail or second drawing of any variant here.
 *
 * Stage geometry (why these numbers): OverlayView centre-anchors the item at (x, y) fractions of
 * the canvas and SocialOverlayView sizes the graphic in reference px × sc (reference = a 1080
 * short edge). A full-frame stage at that scale would shrink a 640 px-wide banner to a third of a
 * ~150 px card, so — exactly as the template preview boosts its type 2.4× to read at card size —
 * the stage is a ZOOMED WINDOW centred on the item, not a whole frame: a 700×360 reference-px
 * window at sc = 1. The widest graphic (Subscribe + Bell, 640 px) then fills ~91% of the stage
 * width, the tallest (Orbit Badge / Heart Burst, 300 px, plus the 26 px entrance rise) fits the
 * 360 px height, and the item is re-centred (x/y = 0.5) instead of keeping its on-video default
 * y = 0.78, which in a window this short would push tall graphics against the bottom edge.
 * Motion, colours, text and timing are untouched — only the window is closer.
 *
 * Performance discipline mirrors AnimatedTemplatePreview exactly:
 *  - the poster (a still of the REAL element at POSTER_MS) shows first; the live layer only
 *    mounts when the card is in or near the viewport (IntersectionObserver, 240px margin),
 *  - live previews share the ONE studio-wide slot budget (livePreviewBudget.ts, FIFO, max 6) —
 *    leaving the viewport or unmounting releases the slot / cancels the wait,
 *  - the clock steps in authored 30 fps frames, like the Player and the export advance,
 *  - prefers-reduced-motion keeps the poster, always.
 */

/** The stage window in reference px (see the geometry note above) and its frame rate. */
const CANVAS = { width: 700, height: 360, fps: 30 };
/** sc for the stage window: graphics are drawn at the 1080-reference scale (sc = 1), zoomed. */
const PREVIEW_SC = 1;
/** Poster instant: inside every variant's acted state (pill flipped, heart filled, count +1,
 *  counter near its target, chat bubbles all in, search query typed) but before the exit fade. */
const POSTER_MS = 2600;

/** One scaled stage: the virtual canvas div, CSS-scaled to the card width, holding OverlayView. */
const SocialStage: React.FC<{ item: OverlayItem; localMs: number; scale: number }> = ({ item, localMs, scale }) => (
  <div style={{ width: CANVAS.width, height: CANVAS.height, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative" }}>
    <OverlayView item={item} sc={PREVIEW_SC} localMs={localMs} />
  </div>
);

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const AnimatedSocialPreviewInner: React.FC<{ variant: OverlaySocialVariant }> = ({ variant }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [live, setLive] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const [timeMs, setTimeMs] = useState(0);

  // The synthetic items: makeSocialOverlay at playhead 0 assigns the variant's own 4000 ms window
  // and defaults; the preview only re-centres them in the stage window and gives the poster/live
  // layers distinct ids (Orbit Badge keys its SVG textPath by item id, and Heart Burst seeds its
  // floaters from it — duplicate ids across the two stacked layers would collide).
  const { posterItem, liveItem, loopMs } = useMemo(() => {
    const base = makeSocialOverlay(variant, 0, 0);
    const centred = { ...base, x: 0.5, y: 0.5 };
    return {
      posterItem: { ...centred, id: `${base.id}-poster` },
      liveItem: { ...centred, id: `${base.id}-live` },
      loopMs: Math.max(1, base.endMs - base.startMs),
    };
  }, [variant]);

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

  // Slot lifecycle, keyed on visibility — the same shared-budget protocol as the template
  // previews: near -> acquire (or queue); the cleanup (viewport exit AND unmount) releases a
  // held slot or cancels a queued wait, so slots recycle through the panel.
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
    if (acquireLivePreviewSlot(grant)) grant();
    return () => {
      if (granted) {
        setLive(false);
        releaseLivePreviewSlot();
      } else {
        cancelLivePreviewWait(grant);
      }
    };
  }, [near]);

  // The clock steps in authored frames (CANVAS.fps = 30) and loops over the item's own window,
  // exactly like the template previews: stepping on every display refresh would double the React
  // renders while producing frames the composition never actually shows.
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
        setTimeMs((step * frameMs) % loopMs);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, loopMs]);

  const scale = boxW > 0 ? boxW / CANVAS.width : 0;
  return (
    <div ref={boxRef} data-testid="social-preview" data-variant={variant} aria-hidden className="pointer-events-none relative aspect-[700/360] w-full overflow-hidden bg-black">
      {/* poster: a still of the real element — what shows before the live layer mounts, what
          reduced-motion users keep, and the layer under the live one while it plays */}
      {scale > 0 ? (
        <div className="absolute inset-0 bg-black">
          <SocialStage item={posterItem} localMs={POSTER_MS} scale={scale} />
        </div>
      ) : null}
      {live && scale > 0 ? (
        <div data-testid="social-preview-live" className="absolute inset-0 bg-black">
          <SocialStage item={liveItem} localMs={timeMs} scale={scale} />
        </div>
      ) : null}
    </div>
  );
};

/**
 * Memoized on the variant alone: a parent re-render (a selection change, the playback time feed)
 * must not re-render every social preview in the panel.
 */
export const AnimatedSocialPreview = React.memo(
  AnimatedSocialPreviewInner,
  (a, b) => a.variant === b.variant,
);
