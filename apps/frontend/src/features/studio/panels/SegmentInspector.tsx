"use client";

import React from "react";
import {
  KEYFRAME_VALUE_RANGES,
  type KeyframeEasing,
  type SegmentEffect,
  type SegmentEffectType,
  type SegmentKeyframe,
  type SegmentKeyframeProperty,
} from "@capseasy/shared";
import { Button, ColorField, Section, Select, Slider, Toggle } from "../controls";
import {
  AUTO_ZOOM_INTENSITY_LABEL,
  AUTO_ZOOM_PAUSE_MS,
  type AutoZoomIntensity,
} from "../autoZooms";
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
  /** Run 3 (4.7): the selected segment's keyframes + ordered effects stack */
  keyframes: SegmentKeyframe[];
  effects: SegmentEffect[];
  onAddKeyframe: (property: SegmentKeyframeProperty, atMs: number, value: number) => void;
  onUpdateKeyframe: (id: string, patch: { atMs?: number; value?: number; easing?: KeyframeEasing }) => void;
  onRemoveKeyframe: (id: string) => void;
  /** A4 (Phase 5): auto punch-in zooms for the whole project — optional so existing mounts/tests are unchanged */
  onAutoZooms?: (intensity: AutoZoomIntensity) => void;
  /** how many zooms the deterministic generator would add right now (0 hides the action's point) */
  autoZoomCount?: number;
  onAddEffect: (type: SegmentEffectType) => void;
  onUpdateEffect: (id: string, patch: { amount?: number; enabled?: boolean; color?: string }) => void;
  onRemoveEffect: (id: string) => void;
  onMoveEffect: (id: string, dir: -1 | 1) => void;
}

const KEYFRAME_PROPERTY_OPTIONS: { value: SegmentKeyframeProperty; label: string }[] = [
  { value: "offsetX", label: "Position X" },
  { value: "offsetY", label: "Position Y" },
  { value: "scale", label: "Scale" },
  { value: "rotateDeg", label: "Rotation" },
  { value: "opacity", label: "Opacity" },
];
const KEYFRAME_PROPERTY_LABEL: Record<SegmentKeyframeProperty, string> = {
  offsetX: "Position X",
  offsetY: "Position Y",
  scale: "Scale",
  rotateDeg: "Rotation",
  opacity: "Opacity",
};
const EASING_OPTIONS: { value: string; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "ease-in", label: "Ease in" },
  { value: "ease-out", label: "Ease out" },
  { value: "ease-in-out", label: "Ease in-out" },
  { value: "hold", label: "Hold" },
];
const EFFECT_OPTIONS: { value: SegmentEffectType; label: string }[] = [
  { value: "blur", label: "Blur" },
  { value: "glow", label: "Glow" },
  { value: "vignette", label: "Vignette" },
  { value: "grain", label: "Grain" },
];
const EFFECT_LABEL: Record<SegmentEffectType, string> = { blur: "Blur", glow: "Glow", vignette: "Vignette", grain: "Grain" };
/** Slider step per keyframe property: rotation moves in whole degrees, the rest are fine-grained. */
const keyframeStep = (property: SegmentKeyframeProperty): number => (property === "rotateDeg" ? 1 : 0.01);

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
  keyframes, effects, onAddKeyframe, onUpdateKeyframe, onRemoveKeyframe,
  onAddEffect, onUpdateEffect, onRemoveEffect, onMoveEffect,
  onAutoZooms, autoZoomCount,
}) => {
  const t = segment.transform;
  const [kfProperty, setKfProperty] = React.useState<SegmentKeyframeProperty>("scale");
  const [zoomIntensity, setZoomIntensity] = React.useState<AutoZoomIntensity>("medium");
  const [effectType, setEffectType] = React.useState<SegmentEffectType>("blur");
  const baseKeyframeValue = (property: SegmentKeyframeProperty): number =>
    property === "offsetX" ? t.offsetX
    : property === "offsetY" ? t.offsetY
    : property === "scale" ? t.scale
    : property === "rotateDeg" ? t.rotateDeg
    : t.opacity;
  const sortedKeyframes = [...keyframes].sort(
    (a, b) => a.atMs - b.atMs || (a.property < b.property ? -1 : a.property > b.property ? 1 : 0),
  );
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
        <Slider label="Opacity" value={t.opacity} min={0} max={1} step={0.01} onChange={(v) => onTransform({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
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
        <Section title="Reverse & freeze" hint="Freeze and reverse clips are stored on this device, like your other media." more="Browser exports include them when you export on this device; a render on another device can't see them.">
          <div className="flex flex-wrap gap-1.5">
            <Button onClick={onReverse} disabled={busy}>{production.kind === "working" && production.action === "reverse" ? "Reversing…" : "Reverse"}</Button>
            <Button onClick={onFreeze} disabled={busy || !playheadInside}>Freeze frame</Button>
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

      {!segment.still ? (
        <Section title="Keyframes" hint="A keyframe sets a value at a moment inside this segment." more="The picture eases between keyframes and holds the nearest value outside them.">
          <Select label="Property" value={kfProperty} options={KEYFRAME_PROPERTY_OPTIONS} onChange={(v) => setKfProperty(v as SegmentKeyframeProperty)} />
          <Button
            onClick={() => onAddKeyframe(kfProperty, playheadMs - segment.startMs, baseKeyframeValue(kfProperty))}
            disabled={!playheadInside}
            title={playheadInside ? undefined : "Move the playhead inside this segment first"}
          >
            Add keyframe at playhead
          </Button>
          {!playheadInside ? <p className="text-xs text-st-faint">Add keyframe at playhead uses the playhead — move the playhead inside this segment to use it.</p> : null}
          {sortedKeyframes.length === 0 ? <p className="text-xs text-st-faint">No keyframes yet.</p> : null}
          {sortedKeyframes.map((k) => {
            const range = KEYFRAME_VALUE_RANGES[k.property];
            const label = KEYFRAME_PROPERTY_LABEL[k.property];
            return (
              <div key={k.id} className="space-y-2 rounded-lg border border-st-line bg-st-panel p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-st-text">{label}</span>
                  <Button onClick={() => onRemoveKeyframe(k.id)}>Delete</Button>
                </div>
                <label className="flex items-center justify-between gap-3 text-sm text-st-text/90">
                  <span>Time (seconds)</span>
                  <input
                    type="number"
                    aria-label={`${label} time in seconds`}
                    min={0}
                    step={0.05}
                    value={k.atMs / 1000}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) onUpdateKeyframe(k.id, { atMs: v * 1000 });
                    }}
                    className="w-24 rounded-md border border-st-line bg-st-panel px-2 py-1 text-sm text-st-text outline-none focus:border-st-lav"
                  />
                </label>
                <Slider
                  label={`${label} value`}
                  value={k.value}
                  min={range.min}
                  max={range.max}
                  step={keyframeStep(k.property)}
                  onChange={(v) => onUpdateKeyframe(k.id, { value: v })}
                />
                <Select label="Easing" value={k.easing} options={EASING_OPTIONS} onChange={(v) => onUpdateKeyframe(k.id, { easing: v as KeyframeEasing })} />
              </div>
            );
          })}
        </Section>
      ) : null}

      {!segment.still && onAutoZooms ? (
        <Section title="Auto zooms" hint="Not AI: punch-in zooms at key words, long pauses and loud peaks." more={`Zooms are added where your captions mark key words, after a pause of ${AUTO_ZOOM_PAUSE_MS} ms or more, and at loud peaks. They are ordinary scale keyframes — edit or delete them in Keyframes above; deleting them all restores the untouched picture.`}>
          <Select
            label="Intensity"
            value={zoomIntensity}
            options={(Object.keys(AUTO_ZOOM_INTENSITY_LABEL) as AutoZoomIntensity[]).map((v) => ({ value: v, label: AUTO_ZOOM_INTENSITY_LABEL[v] }))}
            onChange={(v) => setZoomIntensity(v as AutoZoomIntensity)}
          />
          <Button onClick={() => onAutoZooms(zoomIntensity)} disabled={!autoZoomCount}>
            Add auto zooms{autoZoomCount ? ` (${autoZoomCount})` : ""}
          </Button>
          {!autoZoomCount ? <p className="text-xs text-st-faint">No zoom points found — mark a key word in your captions, or check back once the waveform is ready.</p> : null}
        </Section>
      ) : null}

      <Section title="Effects" hint="Applied in order, top to bottom — the same list is applied in the export.">
        {effects.length === 0 ? <p className="text-xs text-st-faint">No effects yet.</p> : null}
        {effects.map((e, i) => (
          <div key={e.id} className="space-y-2 rounded-lg border border-st-line bg-st-panel p-2.5">
            <Toggle label={EFFECT_LABEL[e.type]} checked={e.enabled} onChange={(v) => onUpdateEffect(e.id, { enabled: v })} />
            <fieldset disabled={!e.enabled} className="m-0 border-0 p-0 disabled:opacity-50">
              <Slider label="Amount" value={e.amount} min={0} max={1} step={0.01} onChange={(v) => onUpdateEffect(e.id, { amount: v })} />
            </fieldset>
            {e.type === "glow" ? <ColorField label="Colour" value={e.color} onChange={(v) => onUpdateEffect(e.id, { color: v })} /> : null}
            <div className="flex flex-wrap gap-1.5">
              <Button onClick={() => onMoveEffect(e.id, -1)} disabled={i === 0}>Up</Button>
              <Button onClick={() => onMoveEffect(e.id, 1)} disabled={i === effects.length - 1}>Down</Button>
              <Button tone="danger" onClick={() => onRemoveEffect(e.id)}>Remove</Button>
            </div>
          </div>
        ))}
        <Select label="Effect" value={effectType} options={EFFECT_OPTIONS} onChange={(v) => setEffectType(v as SegmentEffectType)} />
        <Button onClick={() => onAddEffect(effectType)}>Add effect</Button>
      </Section>
    </div>
  );
};
