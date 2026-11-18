"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { overlayAnimStyle } from "@capseasy/compositions";
import { makeTitleOverlay, TITLE_FONT_STACKS, type TitleStyle } from "../titleStyles";
import { acquireLivePreviewSlot, cancelLivePreviewWait, releaseLivePreviewSlot } from "./livePreviewBudget";

/**
 * Live animated title preview for the Titles picker: each of the 50 titles shows its
 * REAL typography and its REAL Remotion in/out animation, in miniature, looping.
 *
 * The animation is not re-implemented here: the preview builds the title's own overlay
 * item (makeTitleOverlay, the exact item a click adds to the timeline) and drives it
 * through overlayAnimStyle — the same function OverlayView applies in the studio preview
 * and the Remotion export — over a looping rAF clock stepped at 30 fps. The text is the
 * title's own font stack, colour and (relative) size, positioned at its own x/y fraction
 * of the frame, so a lower-third reads low and a top title reads high.
 *
 * Performance guardrails — the AnimatedTemplatePreview pattern, reused, not reinvented:
 *  - the poster (the title's settled mid-loop frame) shows first; the live layer only
 *    mounts when the card is in or near the viewport (IntersectionObserver, 240px margin),
 *  - live previews take slots from the shared budget in livePreviewBudget.ts. That module
 *    only offers the "template" and "social" kinds, and this worker must not touch the
 *    shared file: titles reuse the "template" kind, so the studio-wide ceiling of 6 live
 *    previews still holds and neither panel can starve the other. A dedicated "title"
 *    kind is a one-line coordinator change to that module if wanted later.
 *  - leaving the viewport releases the slot and stops the clock; unmounting does the same,
 *  - prefers-reduced-motion keeps the poster, always.
 *
 * Legibility: at card width the true miniature size of a 32px lower-third would be ~5px,
 * unreadable. Like the template preview (which scales type up 2.4x), the preview boosts
 * the displayed size (x1.8) with an 11px floor and a 22px ceiling, so the relative size
 * order across titles is kept while every title stays readable. Motion distances are
 * untouched — they scale with the frame, exactly as in the composition.
 */

/** Virtual canvas the preview renders in, then scales down to the card (16:9 miniature). */
const CANVAS = { width: 1080, height: 608, fps: 30 };

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Displayed font size for a title at this card width: true relative size, boosted to stay legible. */
const previewFontPx = (fontSize: number, boxW: number) => {
  const scale = boxW / CANVAS.width;
  const raw = fontSize * scale * 1.8;
  return Math.max(11, Math.min(22, raw));
};

/** One frame of the title: the overlay's own text, font, colour and position, with the
 *  Remotion enter/exit style for `timeMs` inside the title's own window. */
const TitlePreviewFrame: React.FC<{ style: TitleStyle; timeMs: number; scale: number; boxW: number }> = ({ style, timeMs, scale, boxW }) => {
  const item = useMemo(() => makeTitleOverlay(style, 0, style.durationMs), [style]);
  // Virtual-canvas px for the boosted displayed size (the outer scale shrinks it back).
  const fontPx = boxW > 0 ? previewFontPx(style.fontSize, boxW) / scale : style.fontSize;
  return (
    <div style={{ width: CANVAS.width, height: CANVAS.height, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: `${item.x * 100}%`,
          top: `${item.y * 100}%`,
          transform: "translate(-50%, -50%)",
          maxWidth: "86%",
          pointerEvents: "none",
        }}
      >
        <div style={overlayAnimStyle(item, timeMs)} data-testid="title-anim">
          <div
            style={{
              fontFamily: TITLE_FONT_STACKS[item.font ?? "sans"],
              fontWeight: 700,
              fontSize: fontPx,
              lineHeight: 1.15,
              color: item.color,
              textAlign: "center",
              whiteSpace: "pre-wrap",
            }}
          >
            {item.text ?? ""}
          </div>
        </div>
      </div>
    </div>
  );
};

const TitleLivePreviewInner: React.FC<{ style: TitleStyle }> = ({ style }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [live, setLive] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const [timeMs, setTimeMs] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || reducedMotion()) return;
    // No IntersectionObserver (jsdom without a mock, SSR, old browsers): stay on the
    // poster rather than throwing — the card still shows the title, just not live.
    if (typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setBoxW(el.clientWidth);
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Slot lifecycle, keyed on visibility — same shape as AnimatedTemplatePreview: near ->
  // acquire (or queue); the cleanup releases a held slot or cancels a queued wait, so slots
  // recycle through the list instead of being held forever by the first cards that approached.
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
    if (acquireLivePreviewSlot("template", grant)) grant();
    return () => {
      if (granted) {
        setLive(false);
        releaseLivePreviewSlot("template");
      } else {
        cancelLivePreviewWait("template", grant);
      }
    };
  }, [near]);

  // The clock steps in authored frames (30 fps), exactly like the Player and the export
  // advance the composition, and loops over the title's OWN duration: enter plays, the
  // title settles, exit plays, then it starts again.
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
        setTimeMs((step * frameMs) % style.durationMs);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, style.durationMs]);

  const scale = boxW > 0 ? boxW / CANVAS.width : 0;
  // Poster: the settled mid-loop frame (enter done, exit not started) — the title's own
  // typography at rest, not a generic swatch.
  const posterMs = style.durationMs / 2;
  return (
    <div
      ref={boxRef}
      className="relative aspect-video overflow-hidden bg-black"
      data-testid="title-preview"
      data-title-id={style.id}
      data-enter-anim={style.enterAnim}
      data-exit-anim={style.exitAnim}
    >
      {scale > 0 ? <TitlePreviewFrame style={style} timeMs={posterMs} scale={scale} boxW={boxW} /> : null}
      {live && scale > 0 ? (
        <div className="absolute inset-0 bg-black" data-live-layer="true" aria-hidden>
          <TitlePreviewFrame style={style} timeMs={timeMs} scale={scale} boxW={boxW} />
        </div>
      ) : null}
    </div>
  );
};

/** Memoized on the style alone: a parent re-render (a selection change, the 15 Hz playback
 *  time feed) must not re-render 50 previews. Only the cards whose style changes re-render. */
export const TitleLivePreview = React.memo(
  TitleLivePreviewInner,
  (a, b) => a.style === b.style,
);
