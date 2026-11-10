"use client";

import React from "react";
import { Button, Section, Select, Slider, Toggle } from "../controls";
import {
  formatPlaybackRate,
  type SegmentTransition,
  type SegmentTransitionType,
  type SegmentTransform,
  type SegmentView,
} from "../segmentView";

/**
 * Right-panel inspector for the selected video segment (brief §16), following the existing
 * panels/ structure (Section/Slider/Toggle/Select primitives from controls.tsx). It is a
 * controlled component: StudioPage owns the selection, the commit path (the segment ops via
 * commitComposition) and the reverse/freeze production state, and passes the segment's
 * CURRENT resolved values in — every control below reads from `segment` and writes through
 * a callback, so what the panel shows is always the stored segment, never local state.
 * It renders only for a segment selection; StudioPage mounts it conditionally and there is
 * deliberately no placeholder state for other selections.
 *
 * Unit conventions (the pinned transform shape does not state units — these are the UI's,
 * isolated in the two converters below so they are one-line fixes if the render worker's
 * interpretation differs): crop and offset are stored as FRACTIONS (0–0.9 / −1–1) and shown
 * as percents; scale and rotateDeg are stored as-is.
 */
export const cropToPercent = (fraction: number) => Math.round(fraction * 1000) / 10;
export const percentToCrop = (percent: number) => Math.min(90, Math.max(0, percent)) / 100;
export const offsetToPercent = (fraction: number) => Math.round(fraction * 100);
export const percentToOffset = (percent: number) => Math.min(100, Math.max(-100, percent)) / 100;

export type SegmentProductionState =
  | { kind: "idle" }
  | { kind: "working"; action: "reverse" | "freeze"; progress: number | null }
  | { kind: "error"; action: "reverse" | "freeze"; message: string };

export interface SegmentInspectorProps {
  segment: SegmentView;
  /** the playhead (project timeline ms) — freeze acts on the frame under it */
  playheadMs: number;
  production: SegmentProductionState;
  onTransform: (patch: Partial<SegmentTransform>) => void;
  onPlaybackRate: (rate: number) => void;
  onTransition: (transition: SegmentTransition | null) => void;
  onDuplicate: () => void;
  onRippleDelete: () => void;
  onReverse: () => void;
  onFreeze: () => void;
}

const TRANSITION_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "wipe", label: "Wipe" },
  { value: "slide", label: "Slide" },
  { value: "zoom", label: "Zoom" },
  { value: "blur", label: "Blur" },
];

export const SegmentInspector: React.FC<SegmentInspectorProps> = ({
  segment, playheadMs, production, onTransform, onPlaybackRate, onTransition,
  onDuplicate, onRippleDelete, onReverse, onFreeze,
}) => {
  const t = segment.transform;
  const busy = production.kind === "working";
  const playheadInside = playheadMs >= segment.startMs && playheadMs < segment.startMs + segment.timelineDurationMs;
  const transitionType = segment.transitionIn?.type ?? "none";
  return (
    <div className="h-full overflow-y-auto" aria-label={`Segment ${segment.index + 1} inspector`}>
      <Section title={`Segment ${segment.index + 1}`} hint={segment.still ? "A freeze-frame still. Its length is its on-screen duration; trim it like any other segment." : "The selected piece of video on the timeline. Every change here is one undo step."}>
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={onDuplicate} disabled={busy}>Duplicate</Button>
          <Button tone="danger" onClick={onRippleDelete} disabled={busy}>Ripple delete</Button>
        </div>
      </Section>

      <Section title="Transform">
        <Slider label="Crop left" value={cropToPercent(t.cropLeft)} min={0} max={90} step={1} unit="%" onChange={(v) => onTransform({ cropLeft: percentToCrop(v) })} />
        <Slider label="Crop top" value={cropToPercent(t.cropTop)} min={0} max={90} step={1} unit="%" onChange={(v) => onTransform({ cropTop: percentToCrop(v) })} />
        <Slider label="Crop right" value={cropToPercent(t.cropRight)} min={0} max={90} step={1} unit="%" onChange={(v) => onTransform({ cropRight: percentToCrop(v) })} />
        <Slider label="Crop bottom" value={cropToPercent(t.cropBottom)} min={0} max={90} step={1} unit="%" onChange={(v) => onTransform({ cropBottom: percentToCrop(v) })} />
        <Slider label="Rotate" value={t.rotateDeg} min={-180} max={180} step={1} unit="°" onChange={(v) => onTransform({ rotateDeg: v })} />
        <Toggle label="Flip horizontal" checked={t.flipH} onChange={(v) => onTransform({ flipH: v })} />
        <Toggle label="Flip vertical" checked={t.flipV} onChange={(v) => onTransform({ flipV: v })} />
        <Slider label="Scale" value={t.scale} min={0.1} max={4} step={0.05} onChange={(v) => onTransform({ scale: v })} format={(v) => `${Math.round(v * 100) / 100}×`} />
        <Slider label="Offset X" value={offsetToPercent(t.offsetX)} min={-100} max={100} step={1} unit="%" onChange={(v) => onTransform({ offsetX: percentToOffset(v) })} />
        <Slider label="Offset Y" value={offsetToPercent(t.offsetY)} min={-100} max={100} step={1} unit="%" onChange={(v) => onTransform({ offsetY: percentToOffset(v) })} />
      </Section>

      {!segment.still ? (
        <Section title="Speed" hint="Faster or slower playback for this segment only. The segment's length on the timeline changes with it.">
          <Slider label="Playback speed" value={segment.playbackRate} min={0.25} max={4} step={0.25} onChange={onPlaybackRate} format={(v) => formatPlaybackRate(v)} />
          <label className="flex items-center justify-between gap-3 text-sm text-st-text/90">
            <span>Speed (×)</span>
            <input
              type="number"
              aria-label="Playback speed value"
              min={0.25}
              max={4}
              step={0.25}
              value={segment.playbackRate}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0.25 && v <= 4) onPlaybackRate(v);
              }}
              className="w-24 rounded-md border border-st-line bg-st-panel px-2 py-1 text-sm text-st-text outline-none focus:border-st-lav"
            />
          </label>
        </Section>
      ) : null}

      {segment.index >= 1 ? (
        <Section title="Transition in" hint="How this segment arrives from the one before it. The two overlap for the transition's length.">
          <Select
            label="Type"
            value={transitionType}
            options={TRANSITION_OPTIONS}
            onChange={(v) => {
              if (v === "none") onTransition(null);
              else onTransition({ type: v as SegmentTransitionType, durationMs: segment.transitionIn?.durationMs ?? 300 });
            }}
          />
          {segment.transitionIn ? (
            <Slider label="Duration" value={segment.transitionIn.durationMs} min={100} max={2000} step={50} unit=" ms" onChange={(v) => onTransition({ type: segment.transitionIn!.type, durationMs: v })} />
          ) : null}
        </Section>
      ) : null}

      {!segment.still ? (
        <Section title="Reverse & freeze" hint="Freeze and reverse clips are stored on this device, like your other media. Browser exports include them when you export on this device; a render on another device can't see them.">
          <div className="flex flex-wrap gap-1.5">
            <Button onClick={onReverse} disabled={busy}>{production.kind === "working" && production.action === "reverse" ? "Reversing…" : "Reverse"}</Button>
            <Button onClick={onFreeze} disabled={busy || !playheadInside} title={playheadInside ? undefined : "Move the playhead inside this segment first"}>Freeze frame</Button>
          </div>
          <p className="text-xs text-st-faint">Reversing renders a new copy on this device — it can take a while on long videos.</p>
          {!playheadInside ? <p className="text-xs text-st-faint">Freeze frame uses the frame under the playhead — move the playhead inside this segment to use it.</p> : null}
          {production.kind === "working" ? (
            <p role="status" className="text-xs text-st-muted">
              {production.action === "reverse" ? "Reversing on this device" : "Taking the freeze frame"}
              {production.progress != null ? `… ${Math.round(production.progress * 100)}%` : "…"}
            </p>
          ) : null}
          {production.kind === "error" ? <p role="alert" className="text-xs text-orange-accent">{production.message}</p> : null}
        </Section>
      ) : null}
    </div>
  );
};
