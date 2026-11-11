"use client";

import React, { useEffect, useRef, useState } from "react";
import type { OverlayItem } from "@capseasy/shared";
import { IMAGE_BASE_PX, SHAPE_BASE_PX, TEXT_DEFAULT_FONT_PX } from "@capseasy/compositions";

/**
 * Stage drag layer for placed overlays (P4, 2026-11-11 — the fix for "a motion
 * element sits at a fixed position, can't move it").
 *
 * Before this layer, NO overlay kind could be dragged on the stage at all: the
 * overlays render inside the Remotion Player with pointerEvents:"none", and the
 * only position control was the inspector's 3×3 preset grid. This layer floats
 * over the player frame (a sibling — preview chrome only, never part of the
 * composition or any export) and gives every overlay visible at the playhead a
 * hit box: drag to move, corner handle to scale, top handle to rotate. Every
 * gesture patches the SAME item fields the inspector edits (x / y / scale /
 * rotation) through the caller's settings patch, so stage, inspector, preview
 * and export can never disagree.
 *
 * Geometry: overlays are centre-anchored at (x, y) fractions and sized in
 * reference px (short edge = 1080) × the composition scale — the helpers below
 * mirror that math in stage px. A hit box's CENTRE is always exact (it is the
 * item's x/y); its size is the renderer's natural size per kind — for social
 * graphics a per-variant table (the variants' drawn widths, heights rounded to
 * the typical content). The box only places handles and catches the pointer;
 * it is never a render input.
 */

export interface StageBox {
  /** centre, stage px */
  cx: number;
  cy: number;
  /** full size, stage px (natural size × item scale) */
  w: number;
  h: number;
}

/** Social variants' drawn sizes in reference px (width from the renderer,
 *  height the typical content). Anything unlisted uses the default card size. */
const SOCIAL_NATURAL: Partial<Record<string, { w: number; h: number }>> = {
  "subscribe-pill": { w: 360, h: 110 },
  "subscribe-banner": { w: 640, h: 122 },
  "follow-banner": { w: 640, h: 122 },
  "profile-card": { w: 400, h: 452 },
  "story-ring": { w: 224, h: 292 },
  "follow-plus": { w: 190, h: 252 },
  "qr-frame": { w: 280, h: 348 },
  "dm-popup": { w: 470, h: 118 },
  "dm-typing": { w: 470, h: 118 },
  "comment-popup": { w: 470, h: 118 },
  "typing-post": { w: 560, h: 190 },
  "post-card": { w: 600, h: 216 },
  "repost-card": { w: 520, h: 168 },
  "cursor-follow": { w: 560, h: 104 },
  "orbit-badge": { w: 300, h: 300 },
  "logo-mark": { w: 300, h: 300 },
  "countdown-pop": { w: 340, h: 340 },
  "lower-third-bar": { w: 1020, h: 104 },
  "watch-next": { w: 560, h: 190 },
  "chat-stack": { w: 460, h: 300 },
  "form-card": { w: 520, h: 300 },
  "voice-card": { w: 520, h: 230 },
};
const SOCIAL_DEFAULT = { w: 560, h: 200 };

/** The item's on-stage box in a stage of the given px size. */
export function overlayStageBox(item: OverlayItem, stageW: number, stageH: number): StageBox {
  const sc = Math.min(stageW, stageH) / 1080;
  let w: number;
  let h: number;
  if (item.kind === "shape") {
    w = SHAPE_BASE_PX * sc;
    h = SHAPE_BASE_PX * sc;
  } else if (item.kind === "image") {
    w = IMAGE_BASE_PX * sc;
    h = w * 0.75; // hit-box estimate only — the real height follows the asset's aspect
  } else if (item.kind === "text") {
    const fontPx = (item.fontSize ?? TEXT_DEFAULT_FONT_PX) * sc;
    const lines = (item.text ?? "").split("\n");
    const longest = Math.max(1, ...lines.map((l) => l.length));
    w = Math.min(stageW * 0.86, longest * fontPx * 0.58);
    h = Math.max(1, lines.length) * fontPx * 1.15;
  } else {
    const nat = (item.variant && SOCIAL_NATURAL[item.variant]) || SOCIAL_DEFAULT;
    w = nat.w * sc;
    h = nat.h * sc;
  }
  return { cx: item.x * stageW, cy: item.y * stageH, w: w * item.scale, h: h * item.scale };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Move by stage-fraction deltas, clamped to the schema's [0, 1] position range. */
export function movedItem(item: OverlayItem, dxFrac: number, dyFrac: number): OverlayItem {
  return { ...item, x: round(clamp(item.x + dxFrac, 0, 1), 3), y: round(clamp(item.y + dyFrac, 0, 1), 3) };
}

/** Scale by the pointer's distance-from-centre ratio, clamped to the schema's [0.25, 4]. */
export function scaledItem(item: OverlayItem, startDistPx: number, distPx: number): OverlayItem {
  if (startDistPx <= 0) return item;
  return { ...item, scale: round(clamp(item.scale * (distPx / startDistPx), 0.25, 4), 3) };
}

/** Rotate so the pointer's angle around the centre maps onto the item, clamped to [-45, 45]. */
export function rotatedItem(item: OverlayItem, grabPointerAngleDeg: number, pointerAngleDeg: number): OverlayItem {
  const delta = pointerAngleDeg - grabPointerAngleDeg;
  return { ...item, rotation: round(clamp(item.rotation + delta, -45, 45), 1) };
}

export interface OverlayStageLayerProps {
  overlays: OverlayItem[];
  timeMs: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPatch: (item: OverlayItem) => void;
}

type DragState = {
  mode: "move" | "scale" | "rotate";
  item: OverlayItem;
  startClientX: number;
  startClientY: number;
  rect: DOMRect;
  cx: number;
  cy: number;
  startDist: number;
  grabAngle: number;
};

export const OverlayStageLayer: React.FC<OverlayStageLayerProps> = ({ overlays, timeMs, selectedId, onSelect, onPatch }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const active = overlays.filter((o) => timeMs >= o.startMs && timeMs < o.endMs);
  // the selected item's box renders last (on top); hit priority follows draw order
  const ordered = [...active.filter((o) => o.id !== selectedId), ...active.filter((o) => o.id === selectedId)];

  const beginDrag = (e: React.PointerEvent, item: OverlayItem, mode: DragState["mode"]) => {
    const root = rootRef.current;
    if (!root) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(item.id);
    const rect = root.getBoundingClientRect();
    const box = overlayStageBox(item, rect.width, rect.height);
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    dragRef.current = {
      mode,
      item,
      startClientX: e.clientX,
      startClientY: e.clientY,
      rect,
      cx: box.cx,
      cy: box.cy,
      startDist: Math.max(1, Math.hypot(px - box.cx, py - box.cy)),
      grabAngle: (Math.atan2(py - box.cy, px - box.cx) * 180) / Math.PI,
    };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const mx = ev.clientX - d.rect.left;
      const my = ev.clientY - d.rect.top;
      if (d.mode === "move") {
        onPatch(movedItem(d.item, (ev.clientX - d.startClientX) / Math.max(1, d.rect.width), (ev.clientY - d.startClientY) / Math.max(1, d.rect.height)));
      } else if (d.mode === "scale") {
        onPatch(scaledItem(d.item, d.startDist, Math.hypot(mx - d.cx, my - d.cy)));
      } else {
        const ang = (Math.atan2(my - d.cy, mx - d.cx) * 180) / Math.PI;
        onPatch(rotatedItem(d.item, d.grabAngle, ang));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  if (size.w === 0 || size.h === 0) {
    return <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[5]" aria-hidden />;
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[5]">
      {ordered.map((item) => {
        const box = overlayStageBox(item, size.w, size.h);
        const selected = item.id === selectedId;
        return (
          <div
            key={item.id}
            data-testid={`overlay-stage-box-${item.id}`}
            data-selected={selected ? "true" : undefined}
            className={`pointer-events-auto absolute touch-none ${selected ? "" : "hover:bg-white/5"}`}
            style={{
              left: box.cx,
              top: box.cy,
              width: box.w,
              height: box.h,
              transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
              cursor: "grab",
              ...(selected ? { outline: "2px solid rgba(232,227,217,0.95)", outlineOffset: 1 } : {}),
            }}
            onPointerDown={(e) => beginDrag(e, item, "move")}
          >
            {selected ? (
              <>
                <span
                  data-testid={`overlay-rotate-handle-${item.id}`}
                  role="button"
                  aria-label="Rotate (drag)"
                  className="absolute left-1/2 top-0 grid h-4 w-4 -translate-x-1/2 -translate-y-[26px] cursor-grab place-items-center rounded-full border-2 border-[#E8E3D9] bg-black/60"
                  onPointerDown={(e) => beginDrag(e, item, "rotate")}
                />
                <span
                  data-testid={`overlay-scale-handle-${item.id}`}
                  role="button"
                  aria-label="Resize (drag)"
                  className="absolute bottom-0 right-0 h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-[4px] border-2 border-[#E8E3D9] bg-black/60"
                  onPointerDown={(e) => beginDrag(e, item, "scale")}
                />
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
