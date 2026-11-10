import type { SegmentKeyframe } from "@capseasy/shared";
import type { EditorComposition } from "./compositionDoc";
import { addSegmentKeyframe, removeSegmentKeyframe } from "./compositionOps";

/**
 * A4 — Auto punch-in zooms (Phase 5). EMPHASIS-BASED AND DETERMINISTIC — never AI,
 * and never labelled as AI anywhere: the same caption doc, waveform peaks and
 * intensity always produce the same plan, because every signal is plain arithmetic
 * on data the editor already has:
 *
 *   1. EMPHASIS — a caption word the doc already marks emphasised
 *      (`emphasis: "strong" | "hero"`, however it got marked) proposes a zoom at
 *      the word's start.
 *   2. PAUSE / SENTENCE START — a visible word that starts at least
 *      {@link AUTO_ZOOM_PAUSE_MS} (600 ms) after the previous visible word ended
 *      proposes a zoom at its start: a new sentence landing after a real pause.
 *   3. VOLUME PEAK — where waveform peaks are available (normalised peaks on the
 *      SAME time base as the caption words, the clipper's convention), a local
 *      maximum at or above {@link AUTO_ZOOM_PEAK_THRESHOLD} proposes a zoom.
 *
 * PLACEMENT / SHAPE. A zoom is FOUR ordinary `scale` keyframes (Phase 4.7) on the
 * segment that contains the signal's doc time, at segment-LOCAL times
 * (`docTime − clip.startMs`, the existing composition mapping — a signal in the
 * second segment lands on that segment, never smeared onto the first):
 *   signal−150 ms: base scale (the segment's own transform scale)
 *   signal:        target scale, target = base × the intensity multiplier
 *   signal+400 ms: target scale again (the hold — equal values lerp to a constant)
 *   signal+550 ms: base scale (the release; the sampler holds the LAST keyframe's
 *                  value after it, so ending on base is what restores the
 *                  untouched render after the zoom)
 * All easings are the op layer's default "linear"; the equal-value hold pair is
 * what makes the hold exact under linear interpolation.
 *
 * COLLISION RULE (stated, deterministic). Zoom windows are
 * [signal−150, signal+550]. Signals are considered in priority order —
 * emphasis first, then pause starts, then volume peaks; ties by earlier time.
 * A signal is SKIPPED when, on its segment, its window overlaps an
 * already-accepted zoom's window or comes within {@link AUTO_ZOOM_MIN_GAP_MS}
 * of one, or when any EXISTING scale keyframe of that segment falls inside its
 * window (the user's own keyframes are never fought or replaced), or when the
 * window would run past the segment's end (a zoom left mid-punch at the cut
 * would be a bug, not a style). Still segments take no keyframes (the op
 * layer refuses them) and are skipped. Skips are reported in the plan, never
 * silently dropped.
 *
 * APPLICATION. {@link applyAutoZooms} threads the plan through the existing
 * `addSegmentKeyframe` op, zoom by zoom, and returns ONE composition — the
 * caller commits that once, so the whole batch is ONE undo step. The created
 * keyframes are ordinary keyframes with ordinary ids (reported back in
 * `applied`): the user can move, retime or delete every one afterwards, and
 * deleting all of them restores the untouched render exactly.
 */

export type AutoZoomIntensity = "subtle" | "medium" | "strong";

/** Intensity → scale multiplier applied to the segment's base scale. */
export const AUTO_ZOOM_INTENSITY_SCALE: Record<AutoZoomIntensity, number> = {
  subtle: 1.15,
  medium: 1.3,
  strong: 1.5,
};

export const AUTO_ZOOM_INTENSITY_LABEL: Record<AutoZoomIntensity, string> = {
  subtle: "Subtle (×1.15)",
  medium: "Medium (×1.30)",
  strong: "Strong (×1.50)",
};

/** A word starting at least this long after the previous visible word ended is a pause / sentence-start signal. */
export const AUTO_ZOOM_PAUSE_MS = 600;
/** Normalised waveform peak at or above this, as a local maximum, is a volume-peak signal. */
export const AUTO_ZOOM_PEAK_THRESHOLD = 0.85;
/** Punch-in ramp: the zoom reaches full scale this long after its first keyframe. */
export const AUTO_ZOOM_RAMP_IN_MS = 150;
/** How long full scale is held (between the two target keyframes). */
export const AUTO_ZOOM_HOLD_MS = 400;
/** Release ramp: back to base scale this long after the hold ends. */
export const AUTO_ZOOM_RAMP_OUT_MS = 150;
/** Two accepted zoom windows on one segment must end/start at least this far apart. */
export const AUTO_ZOOM_MIN_GAP_MS = 250;

const WINDOW_BEFORE_MS = AUTO_ZOOM_RAMP_IN_MS;
const WINDOW_AFTER_MS = AUTO_ZOOM_HOLD_MS + AUTO_ZOOM_RAMP_OUT_MS;

export type AutoZoomSignalKind = "emphasis" | "pause" | "volume";
const SIGNAL_PRIORITY: Record<AutoZoomSignalKind, number> = { emphasis: 3, pause: 2, volume: 1 };

export interface AutoZoomWordLike {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  hidden?: boolean;
  emphasis?: "none" | "strong" | "hero";
}

export interface AutoZoomClipLike {
  id: string;
  /** project-timeline position of the segment's first frame */
  startMs: number;
  durationMs: number;
  still?: boolean;
  transform?: { scale: number } | null;
  keyframes?: readonly SegmentKeyframe[] | null;
}

export interface AutoZoomPeaks {
  /** normalised peaks (0–1), on the same time base as the caption words */
  peaks: ArrayLike<number>;
  hopMs: number;
}

export interface AutoZoomKeyframeSpec {
  /** segment-LOCAL ms */
  atMs: number;
  value: number;
}

export interface AutoZoom {
  clipId: string;
  kind: AutoZoomSignalKind;
  /** the signal's doc (project-timeline) time */
  signalAtMs: number;
  /** the four scale keyframes, segment-local, in time order */
  keyframes: AutoZoomKeyframeSpec[];
}

export type AutoZoomSkipReason = "no-segment" | "still-segment" | "past-segment-end" | "collision" | "existing-keyframes";
export interface AutoZoomSkip {
  kind: AutoZoomSignalKind;
  signalAtMs: number;
  reason: AutoZoomSkipReason;
}

export interface AutoZoomPlan {
  intensity: AutoZoomIntensity;
  zooms: AutoZoom[];
  skipped: AutoZoomSkip[];
}

interface Signal { kind: AutoZoomSignalKind; atMs: number }

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Every raw signal in the doc (+ peaks), deduped by time keeping the strongest kind. Pure. */
export function detectAutoZoomSignals(input: {
  words: readonly AutoZoomWordLike[];
  peaks?: AutoZoomPeaks | null;
  pauseMs?: number;
  peakThreshold?: number;
}): Signal[] {
  const pauseMs = input.pauseMs ?? AUTO_ZOOM_PAUSE_MS;
  const peakThreshold = input.peakThreshold ?? AUTO_ZOOM_PEAK_THRESHOLD;
  const byTime = new Map<number, Signal>();
  const offer = (kind: AutoZoomSignalKind, atMs: number) => {
    if (!Number.isFinite(atMs)) return;
    const at = Math.round(atMs);
    const prev = byTime.get(at);
    if (!prev || SIGNAL_PRIORITY[kind] > SIGNAL_PRIORITY[prev.kind]) byTime.set(at, { kind, atMs: at });
  };

  const visible = input.words
    .filter((w) => !w.hidden && w.text.trim().length > 0 && w.endMs > w.startMs)
    .slice()
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  visible.forEach((w, i) => {
    if (w.emphasis === "strong" || w.emphasis === "hero") offer("emphasis", w.startMs);
    if (i > 0 && w.startMs - visible[i - 1]!.endMs >= pauseMs) offer("pause", w.startMs);
  });

  const peaks = input.peaks;
  if (peaks && peaks.peaks.length > 0 && peaks.hopMs > 0) {
    const p = peaks.peaks;
    for (let i = 0; i < p.length; i++) {
      const v = p[i]!;
      if (!(v >= peakThreshold)) continue;
      const prev = i > 0 ? p[i - 1]! : -Infinity;
      const next = i < p.length - 1 ? p[i + 1]! : -Infinity;
      // a local maximum: strictly above the previous sample, at least the next
      // (a flat-topped peak reports once, at its first sample)
      if (v > prev && v >= next) offer("volume", i * peaks.hopMs);
    }
  }
  return [...byTime.values()].sort((a, b) => a.atMs - b.atMs);
}

/**
 * Build the plan: signals → placed zooms + stated skips. Pure and deterministic;
 * no ids are minted here (the op layer mints them at apply time).
 */
export function generateAutoZoomPlan(input: {
  words: readonly AutoZoomWordLike[];
  clips: readonly AutoZoomClipLike[];
  peaks?: AutoZoomPeaks | null;
  intensity: AutoZoomIntensity;
  pauseMs?: number;
  peakThreshold?: number;
}): AutoZoomPlan {
  const signals = detectAutoZoomSignals(input);
  const factor = AUTO_ZOOM_INTENSITY_SCALE[input.intensity];
  const ordered = signals.slice().sort(
    (a, b) => SIGNAL_PRIORITY[b.kind] - SIGNAL_PRIORITY[a.kind] || a.atMs - b.atMs,
  );
  const acceptedWindows = new Map<string, { start: number; end: number }[]>();
  const zooms: AutoZoom[] = [];
  const skipped: AutoZoomSkip[] = [];

  for (const signal of ordered) {
    const clip = input.clips.find(
      (c) => signal.atMs >= c.startMs && signal.atMs < c.startMs + c.durationMs,
    );
    if (!clip) { skipped.push({ kind: signal.kind, signalAtMs: signal.atMs, reason: "no-segment" }); continue; }
    if (clip.still) { skipped.push({ kind: signal.kind, signalAtMs: signal.atMs, reason: "still-segment" }); continue; }
    const local = Math.round(signal.atMs - clip.startMs);
    const winStart = local - WINDOW_BEFORE_MS;
    const winEnd = local + WINDOW_AFTER_MS;
    if (winEnd > clip.durationMs) { skipped.push({ kind: signal.kind, signalAtMs: signal.atMs, reason: "past-segment-end" }); continue; }
    const existing = (clip.keyframes ?? []).some(
      (k) => k.property === "scale" && k.atMs >= Math.max(0, winStart) && k.atMs <= winEnd,
    );
    if (existing) { skipped.push({ kind: signal.kind, signalAtMs: signal.atMs, reason: "existing-keyframes" }); continue; }
    const windows = acceptedWindows.get(clip.id) ?? [];
    const collides = windows.some((w) => winStart < w.end + AUTO_ZOOM_MIN_GAP_MS && winEnd > w.start - AUTO_ZOOM_MIN_GAP_MS);
    if (collides) { skipped.push({ kind: signal.kind, signalAtMs: signal.atMs, reason: "collision" }); continue; }

    const base = clip.transform?.scale ?? 1;
    const target = Math.max(0.1, Math.min(4, round2(base * factor)));
    const start = Math.max(0, winStart);
    // a signal on the segment's very first frame collapses the base and target
    // keyframes onto t=0 — dedupe by atMs keeping the LAST spec (target wins,
    // so the punch starts at full scale instead of never punching)
    const specs: AutoZoomKeyframeSpec[] = [];
    for (const spec of [
      { atMs: start, value: base },
      { atMs: local, value: target },
      { atMs: local + AUTO_ZOOM_HOLD_MS, value: target },
      { atMs: winEnd, value: base },
    ]) {
      if (specs.length && specs[specs.length - 1]!.atMs === spec.atMs) specs[specs.length - 1] = spec;
      else specs.push(spec);
    }
    zooms.push({ clipId: clip.id, kind: signal.kind, signalAtMs: signal.atMs, keyframes: specs });
    windows.push({ start: winStart, end: winEnd });
    acceptedWindows.set(clip.id, windows);
  }

  zooms.sort((a, b) => a.signalAtMs - b.signalAtMs);
  skipped.sort((a, b) => a.signalAtMs - b.signalAtMs);
  return { intensity: input.intensity, zooms, skipped };
}

export interface AppliedAutoZoom extends AutoZoom {
  keyframeIds: string[];
}

/**
 * Apply a plan through the existing op layer (`addSegmentKeyframe`), threading
 * one working composition so the caller commits the returned composition ONCE
 * (one undo step for the whole batch). Created keyframe ids are recovered by
 * diffing each clip's keyframes before/after its zoom. A zoom the op layer
 * refuses wholesale (e.g. the clip vanished) contributes nothing.
 */
export function applyAutoZooms(
  comp: EditorComposition,
  plan: AutoZoomPlan,
): { comp: EditorComposition; applied: AppliedAutoZoom[] } {
  let working = comp;
  const applied: AppliedAutoZoom[] = [];
  for (const zoom of plan.zooms) {
    const before = working.videoClips.find((c) => c.id === zoom.clipId);
    if (!before) continue;
    const beforeIds = new Set((before.keyframes ?? []).map((k) => k.id));
    let next = working;
    for (const kf of zoom.keyframes) {
      next = addSegmentKeyframe(next, zoom.clipId, "scale", kf.atMs, kf.value).comp;
    }
    if (next === working) continue;
    working = next;
    const after = working.videoClips.find((c) => c.id === zoom.clipId);
    const keyframeIds = (after?.keyframes ?? []).filter((k) => !beforeIds.has(k.id)).map((k) => k.id);
    applied.push({ ...zoom, keyframeIds });
  }
  return { comp: working, applied };
}

/**
 * Remove every keyframe an {@link applyAutoZooms} batch created, through the op
 * layer. Deleting all of a batch's keyframes restores the untouched render —
 * pinned by test at the op level (keyframes empty, projection identical).
 */
export function removeAutoZoomKeyframes(
  comp: EditorComposition,
  applied: readonly AppliedAutoZoom[],
): EditorComposition {
  let working = comp;
  for (const zoom of applied) {
    for (const id of zoom.keyframeIds) {
      working = removeSegmentKeyframe(working, zoom.clipId, id).comp;
    }
  }
  return working;
}
