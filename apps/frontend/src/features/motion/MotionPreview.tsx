"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { OverlayItem } from "@capseasy/shared";
import { OverlayView } from "@capseasy/compositions";
import { placeholderAvatarForTemplate } from "@capseasy/motion";
import { acquireLivePreviewSlot, cancelLivePreviewWait, releaseLivePreviewSlot } from "@/features/studio/panels/livePreviewBudget";
import { socialStageFor } from "@/features/studio/panels/socialStage";

/**
 * Live animated preview of one configured motion graphic (Motion Studio discovery cards,
 * the customize stage, the homepage section). It renders the REAL thing — an OverlayItem
 * drawn by OverlayView, the same component the Studio preview and the MP4 export use — so
 * what plays here is what lands on a video. There is no poster image or second drawing.
 *
 * Discipline mirrors AnimatedSocialPreview exactly:
 *  - a still of the real element at a mid-animation instant shows first (and is all that
 *    reduced-motion users get);
 *  - the live layer mounts only near the viewport (IntersectionObserver, 240px margin) and
 *    only while it holds one of the shared live-preview slots (livePreviewBudget, max 6
 *    across the whole app);
 *  - the clock is continuous and loops over the item's own window (smoothness pass
 *    2026-11-11: OverlayView is a pure function of localMs, so every display refresh draws
 *    a true in-between instant instead of juddering in 30 fps quanta).
 *
 * Controlled mode (`timeMs` given): no loop, no slot — the caller owns the clock (the
 * customize page's play/pause/scrub controls) and each render draws exactly that instant.
 */
export interface MotionPreviewProps {
  item: OverlayItem;
  /** resolved object URL for the item's avatar/QR asset, when one is set */
  assetSrc?: string;
  /** controlled clock (ms inside the item's window); omit for the self-looping preview */
  timeMs?: number;
  /** render without the black stage fill (the caller supplies the backdrop) */
  transparent?: boolean;
}

const PREVIEW_SC = 1;

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const MotionPreview: React.FC<MotionPreviewProps> = ({ item, assetSrc, timeMs, transparent = false }) => {
  const controlled = timeMs !== undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [live, setLive] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const [loopMs, setLoopMs] = useState(0);

  const durationMs = Math.max(1, item.endMs - item.startMs);
  const variant = item.variant;
  const stage = variant ? socialStageFor(variant) : { width: 700, height: 360, tall: false };

  // poster/live copies with distinct ids (some variants seed from / key by the item id)
  const { posterItem, liveItem, posterMs } = useMemo(() => {
    const centred = { ...item, x: 0.5, y: 0.5 };
    return {
      posterItem: { ...centred, id: `${item.id}-poster` },
      liveItem: { ...centred, id: `${item.id}-live` },
      // a mid-animation frame: past the act beat for most variants, before the exit fade
      posterMs: Math.round(durationMs * 0.62),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.text, item.color, item.assetId, durationMs]);

  useEffect(() => {
    if (controlled) return;
    const el = boxRef.current;
    if (!el || reducedMotion()) return;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, [controlled]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (controlled || !near) {
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
  }, [controlled, near]);

  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const t0 = performance.now();
    let lastMs = -1;
    const tick = (now: number) => {
      const ms = Math.floor(now - t0) % durationMs;
      if (ms !== lastMs) {
        lastMs = ms;
        setLoopMs(ms);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, durationMs]);

  const scale = boxW > 0 ? boxW / stage.width : 0;
  const shownMs = controlled ? Math.min(Math.max(0, timeMs), durationMs) : loopMs;
  // Preview-only placeholder: when the caller has no real asset to show, an
  // avatar-bearing template previews with the generated placeholder face so the
  // avatar area never reads blank. A caller's real asset always wins, and this
  // component is never used for project renders or exports.
  const effectiveAssetSrc = assetSrc ?? (variant ? (placeholderAvatarForTemplate(variant) ?? undefined) : undefined);
  const stageDiv = (it: OverlayItem, ms: number) => (
    <div style={{ width: stage.width, height: stage.height, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative" }}>
      <OverlayView item={it} sc={PREVIEW_SC} localMs={ms} assetSrc={effectiveAssetSrc} />
    </div>
  );

  return (
    <div
      ref={boxRef}
      data-testid="motion-preview"
      data-variant={variant}
      data-stage-height={stage.height}
      aria-hidden
      className={`pointer-events-none relative w-full overflow-hidden ${transparent ? "" : "bg-black"}`}
      style={{ aspectRatio: `${stage.width} / ${stage.height}` }}
    >
      {scale > 0 && !controlled ? (
        <div className={`absolute inset-0 ${transparent ? "" : "bg-black"}`}>{stageDiv(posterItem, posterMs)}</div>
      ) : null}
      {scale > 0 && (controlled || live) ? (
        <div data-testid="motion-preview-live" className={`absolute inset-0 ${transparent ? "" : "bg-black"}`}>
          {stageDiv(controlled ? { ...item, x: 0.5, y: 0.5 } : liveItem, shownMs)}
        </div>
      ) : null}
    </div>
  );
};
