import type { KeyframeEasing, SegmentKeyframe, SegmentKeyframeProperty } from "@capseasy/shared";
import { resolveSegmentTransform, type RenderVideoSegment } from "./overlayMath";

/**
 * Slice 4.7 keyframe sampler — PURE functions of (keyframes, segment-local time).
 * No Remotion spring, no render history: the same keyframes at the same localMs give
 * the same values in the Player preview, the browser export and the server render,
 * which is what keeps preview ≡ export for animated segments.
 */

/** Easing curves, applied to the normalised span progress t in [0, 1]. "hold" returns
 *  0 for the whole span, so the value stays at the span's START value until the next
 *  keyframe (a step). */
export const KEYFRAME_EASING_FNS: Record<KeyframeEasing, (t: number) => number> = {
  linear: (t) => t,
  "ease-in": (t) => t * t * t,
  "ease-out": (t) => 1 - (1 - t) * (1 - t) * (1 - t),
  "ease-in-out": (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  hold: () => 0,
};

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Sample ONE channel at segment-local time `localMs`.
 *
 * - No keyframes for the property -> `baseValue` (the segment's stored transform field).
 * - Keyframes are sorted by atMs (stable sort); on duplicate atMs the LATER array entry
 *   wins (the earlier duplicate is dropped entirely).
 * - localMs <= first.atMs -> first.value: CONSTANT EXTRAPOLATION before the first
 *   keyframe — the pro-editor rule (a channel is defined by its keyframes once it has
 *   any; it does not drift back to the base value outside the keyframed range).
 * - Between keyframes i and i+1: lerp(v_i, v_{i+1}, easing_i(clamp01((t − at_i) /
 *   (at_{i+1} − at_i)))) — the easing lives on the keyframe the span STARTS at.
 * - After the last keyframe -> last.value.
 */
export function sampleChannel(
  keyframes: readonly SegmentKeyframe[] | null | undefined,
  property: SegmentKeyframeProperty,
  baseValue: number,
  localMs: number,
): number {
  const filtered = (keyframes ?? []).filter((k) => k && k.property === property);
  if (filtered.length === 0) return baseValue;
  // Array.prototype.sort is stable, so equal-atMs entries keep their array order and
  // collapsing each run of duplicates onto its LAST entry implements "later wins".
  const sorted = [...filtered].sort((a, b) => a.atMs - b.atMs);
  const deduped: SegmentKeyframe[] = [];
  for (const k of sorted) {
    if (deduped.length > 0 && deduped[deduped.length - 1].atMs === k.atMs) {
      deduped[deduped.length - 1] = k;
    } else {
      deduped.push(k);
    }
  }
  const first = deduped[0];
  if (localMs <= first.atMs) return first.value;
  const last = deduped[deduped.length - 1];
  if (localMs >= last.atMs) return last.value;
  for (let i = 0; i < deduped.length - 1; i++) {
    const a = deduped[i];
    const b = deduped[i + 1];
    if (localMs >= a.atMs && localMs < b.atMs) {
      const easingFn = KEYFRAME_EASING_FNS[a.easing ?? "linear"] ?? KEYFRAME_EASING_FNS.linear;
      return lerp(a.value, b.value, easingFn(clamp01((localMs - a.atMs) / (b.atMs - a.atMs))));
    }
  }
  return last.value;
}

export interface SampledSegmentAnimation {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotateDeg: number;
  opacity: number;
}

/**
 * Sample every animated channel of a segment at segment-local `localMs`, each against
 * the segment's resolved base transform (resolveSegmentTransform, opacity included).
 * A segment with no keyframes samples to exactly its base transform's channel values.
 */
export function sampleSegmentAnimation(segment: Pick<RenderVideoSegment, "transform" | "keyframes">, localMs: number): SampledSegmentAnimation {
  const base = resolveSegmentTransform(segment);
  const keyframes = segment.keyframes ?? [];
  return {
    offsetX: sampleChannel(keyframes, "offsetX", base.offsetX, localMs),
    offsetY: sampleChannel(keyframes, "offsetY", base.offsetY, localMs),
    scale: sampleChannel(keyframes, "scale", base.scale, localMs),
    rotateDeg: sampleChannel(keyframes, "rotateDeg", base.rotateDeg, localMs),
    opacity: sampleChannel(keyframes, "opacity", base.opacity, localMs),
  };
}
