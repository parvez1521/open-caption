/**
 * Smart reframing v2 — face tracks → a smoothed crop PATH, stored as
 * composition data (per-scene segments whose base transform is the scene's
 * starting window and whose offsetX/offsetY keyframes pan that window along
 * the smoothed path). The mapping `visible window edge = crop inset − offset`
 * is pinned by a compositions test (cropPathMapping.test.ts) against the
 * renderer's own sampler + style builder, so preview ≡ export by
 * construction — the same discipline as every other crop in this product.
 *
 * Method (adapted, re-implemented — see AI-CLIPPING-STUDIO-2026-11-11.md):
 *  - detections are associated into TRACKS per scene (greedy nearest-centre);
 *    tracks reset at scene cuts and a path is NEVER smoothed across a cut;
 *  - the subject per scene = the persistent track with the largest mean area
 *    (Level-1's rules, per scene: presence ≥ 25%);
 *  - two persistent faces → a WIDE window containing both when the target
 *    aspect can hold them; otherwise the crop follows one face and switches
 *    only at sentence boundaries with a dwell (the composition has no
 *    split-screen primitive — this is the brief's prescribed fallback);
 *  - the centre series is smoothed with a One Euro Filter (Casiez, Roussel &
 *    Vogel, CHI 2012 — implemented from the paper's equations; constants
 *    adapted to fraction-of-frame units), then a dead zone and a velocity
 *    clamp are applied to the EMITTED series, which is what becomes
 *    keyframes (≤ 24 per scene after decimation);
 *  - a scene with no defensible face gets the centre window (Level-1
 *    behaviour), and every window stays editable afterwards in the Studio.
 *
 * Pure module: samples arrive as YuNet boxes in source pixels (the worker's
 * own output shape); no DOM, no worker, no network here.
 */
import {
  CompositionSettingsSchema,
  type CompositionSettings,
  type ProjectSettings,
  type SegmentKeyframe,
  type VideoSegment,
} from "@capseasy/shared";
import { FACE_PRESENCE_MIN } from "./faceReframe";
import {
  ASPECT_RATIOS,
  clampCropWindow,
  cropWindowFractionsFor,
  cropWindowToTransformFor,
  DEFAULT_CROP_WINDOW,
  needsReframeFor,
  type ClipAspectId,
  type CropWindow,
} from "./reframe";
import type { FaceBox } from "./yunet";

/** One sampled frame: the faces YuNet found, in SOURCE pixel coordinates. */
export interface TimedFaces {
  atMs: number;
  faces: FaceBox[];
}

export interface SceneSpan {
  startMs: number;
  endMs: number;
}

export type CropStrategy = "track" | "wide" | "centre";

export interface CropScenePlan {
  startMs: number;
  endMs: number;
  strategy: CropStrategy;
  /** the window at the scene's first frame (the segment's base transform) */
  baseWindow: CropWindow;
  /** offsetX/offsetY keyframes, segment-LOCAL times; empty when the window never moves */
  keyframes: SegmentKeyframe[];
  /** normalised mean subject centre — why this framing was chosen (UI + tests) */
  centre: { x: number; y: number };
  /** persistent face tracks found in this scene */
  trackCount: number;
}

export interface CropPathPlan {
  scenes: CropScenePlan[];
  /** at least one scene had a defensible face */
  anyFace: boolean;
}

/* ---------------- tracks ---------------- */

interface NormBox {
  atMs: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

interface Track {
  points: NormBox[];
  areaSum: number;
}

const centreDist = (a: NormBox, b: NormBox): number => Math.hypot(a.cx - b.cx, a.cy - b.cy);

function buildTracks(samples: readonly TimedFaces[], srcW: number, srcH: number): Track[] {
  const tracks: Track[] = [];
  for (const sample of samples) {
    const boxes: NormBox[] = sample.faces.map((f) => ({
      atMs: sample.atMs,
      cx: (f.x + f.w / 2) / srcW,
      cy: (f.y + f.h / 2) / srcH,
      w: f.w / srcW,
      h: f.h / srcH,
    }));
    const claimed = new Set<Track>();
    // largest first — the biggest face wins its track before smaller ones compete
    for (const box of [...boxes].sort((a, b) => b.w * b.h - a.w * a.h)) {
      let best: Track | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const track of tracks) {
        if (claimed.has(track)) continue;
        const last = track.points[track.points.length - 1]!;
        const gate = 0.75 * Math.max(box.w, box.h, last.w, last.h) + 0.06;
        const d = centreDist(box, last);
        if (d < gate && d < bestDist) {
          best = track;
          bestDist = d;
        }
      }
      if (best) {
        best.points.push(box);
        best.areaSum += box.w * box.h;
        claimed.add(best);
      } else {
        const track: Track = { points: [box], areaSum: box.w * box.h };
        tracks.push(track);
        claimed.add(track);
      }
    }
  }
  return tracks;
}

interface TrackStats {
  track: Track;
  presence: number;
  meanArea: number;
  meanCx: number;
  meanCy: number;
  meanH: number;
}

function trackStats(track: Track, sampleCount: number): TrackStats {
  const n = Math.max(1, track.points.length);
  return {
    track,
    presence: sampleCount > 0 ? track.points.length / sampleCount : 0,
    meanArea: track.areaSum / n,
    meanCx: track.points.reduce((a, p) => a + p.cx, 0) / n,
    meanCy: track.points.reduce((a, p) => a + p.cy, 0) / n,
    meanH: track.points.reduce((a, p) => a + p.h, 0) / n,
  };
}

/* ---------------- smoothing ---------------- */

/**
 * One Euro Filter (Casiez et al., CHI 2012) — equations from the paper.
 * minCutoff/beta are in fraction-of-frame units: beta is scaled so a move at
 * the velocity clamp (~0.3 frame/s) roughly triples the cutoff, the same
 * adaptation AutoClip's pixel-space constants produce.
 */
class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  constructor(
    private readonly minCutoff = 0.5,
    private readonly beta = 3.0,
    private readonly dCutoff = 1.0,
  ) {}
  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x: number, tSec: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tSec;
      this.dxPrev = 0;
      return x;
    }
    const dt = Math.min(2, Math.max(0.05, tSec - this.tPrev));
    this.tPrev = tSec;
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }
}

export const PATH_DEAD_ZONE = 0.012; // fraction of frame — smaller moves are not worth a pan
export const PATH_MAX_VELOCITY = 0.3; // fraction of frame per second, per axis
export const PATH_MAX_KEYFRAMES = 24;
const PATH_EPSILON = 0.004;
const GAP_BREAK_MS = 2000;

interface PathPoint {
  atMs: number;
  cx: number;
  cy: number;
}

/** One Euro → dead zone → velocity clamp, per unbroken run of samples. */
function smoothSeries(points: readonly PathPoint[]): PathPoint[] {
  if (points.length === 0) return [];
  const runs: PathPoint[][] = [[points[0]!]];
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.atMs - points[i - 1]!.atMs > GAP_BREAK_MS) runs.push([]);
    runs[runs.length - 1]!.push(points[i]!);
  }
  const emitted: PathPoint[] = [];
  for (const run of runs) {
    const fx = new OneEuro();
    const fy = new OneEuro();
    let prev: PathPoint | null = null;
    for (const p of run) {
      const sx = fx.filter(p.cx, p.atMs / 1000);
      const sy = fy.filter(p.cy, p.atMs / 1000);
      if (!prev) {
        prev = { atMs: p.atMs, cx: sx, cy: sy };
        emitted.push(prev);
        continue;
      }
      const dt = Math.max(0.05, (p.atMs - prev.atMs) / 1000);
      const step = (from: number, to: number): number => {
        const delta = to - from;
        if (Math.abs(delta) < PATH_DEAD_ZONE) return from;
        const maxStep = PATH_MAX_VELOCITY * dt;
        return from + Math.max(-maxStep, Math.min(maxStep, delta));
      };
      prev = { atMs: p.atMs, cx: step(prev.cx, sx), cy: step(prev.cy, sy) };
      emitted.push(prev);
    }
  }
  return emitted;
}

/* ---------------- window maths ---------------- */

function windowForCentre(cx: number, cy: number, zoom: number, fw: number, fh: number): CropWindow {
  const pos = (centre: number, f: number): number => (f >= 1 ? 0.5 : Math.min(1, Math.max(0, (centre - f / 2) / (1 - f))));
  return clampCropWindow({ x: pos(cx, fw), y: pos(cy, fh), zoom });
}

/** Window left/top edges as source fractions (the crop insets the transform stores). */
function windowEdges(win: CropWindow, fw: number, fh: number): { left: number; top: number } {
  return { left: win.x * (1 - fw), top: win.y * (1 - fh) };
}

/** Zoom that puts the face at a comfortable share of the window height; constant per scene so it never pumps. */
function zoomForFace(meanFaceH: number): number {
  if (!(meanFaceH > 0)) return 1;
  return Math.min(1.8, Math.max(1, 0.34 / meanFaceH));
}

/* ---------------- the planner ---------------- */

export interface BuildCropPathInput {
  samples: readonly TimedFaces[];
  /** scene spans covering the range (from the frame-diff cuts); empty → one scene for the whole range */
  scenes: readonly SceneSpan[];
  rangeStartMs: number;
  rangeEndMs: number;
  sourceWidth: number;
  sourceHeight: number;
  aspect: ClipAspectId;
  /** sentence start times (source ms) — two-face switching may only happen at these */
  sentenceStartsMs?: readonly number[];
}

const MAX_SCENES = 24;

/** Merge the shortest scenes into neighbours until at most MAX_SCENES remain (path segments stay manageable). */
function capScenes(scenes: readonly SceneSpan[]): SceneSpan[] {
  const out = [...scenes].sort((a, b) => a.startMs - b.startMs);
  while (out.length > MAX_SCENES) {
    let shortest = 0;
    for (let i = 1; i < out.length; i++) {
      if (out[i]!.endMs - out[i]!.startMs < out[shortest]!.endMs - out[shortest]!.startMs) shortest = i;
    }
    const victim = out[shortest]!;
    if (shortest + 1 < out.length) out[shortest + 1] = { startMs: victim.startMs, endMs: out[shortest + 1]!.endMs };
    else if (shortest > 0) out[shortest - 1] = { startMs: out[shortest - 1]!.startMs, endMs: victim.endMs };
    out.splice(shortest, 1);
  }
  return out;
}

export function buildCropPath(input: BuildCropPathInput): CropPathPlan | null {
  const { sourceWidth: srcW, sourceHeight: srcH } = input;
  const ratio = ASPECT_RATIOS[input.aspect];
  if (!needsReframeFor(srcW, srcH, ratio)) return null;

  const spans = capScenes(
    input.scenes.length
      ? input.scenes
      : [{ startMs: input.rangeStartMs, endMs: input.rangeEndMs }],
  ).filter((s) => s.endMs > s.startMs);

  let anyFace = false;
  const scenes: CropScenePlan[] = spans.map((span, sceneIdx) => {
    const inScene = input.samples.filter((s) => s.atMs >= span.startMs && s.atMs <= span.endMs);
    const centrePlan = (): CropScenePlan => ({
      startMs: span.startMs,
      endMs: span.endMs,
      strategy: "centre",
      baseWindow: { ...DEFAULT_CROP_WINDOW },
      keyframes: [],
      centre: { x: 0.5, y: 0.5 },
      trackCount: 0,
    });
    if (inScene.length === 0) return centrePlan();

    const tracks = buildTracks(inScene, srcW, srcH);
    const stats = tracks.map((t) => trackStats(t, inScene.length)).sort((a, b) => b.meanArea - a.meanArea);
    const persistent = stats.filter((s) => s.presence >= FACE_PRESENCE_MIN);
    if (persistent.length === 0) return { ...centrePlan(), trackCount: tracks.length };

    anyFace = true;
    const primary = persistent[0]!;
    const second = persistent[1];
    const zoom = zoomForFace(primary.meanH);
    const fractions = cropWindowFractionsFor({ ...DEFAULT_CROP_WINDOW, zoom }, srcW, srcH, ratio)!;
    const { fw, fh } = fractions;

    // two persistent faces: try WIDE (both centres inside one window at zoom 1)
    if (second && second.meanArea >= 0.6 * primary.meanArea) {
      const z1 = cropWindowFractionsFor(DEFAULT_CROP_WINDOW, srcW, srcH, ratio)!;
      const spreadX = Math.abs(primary.meanCx - second.meanCx) + (primary.track.points[0]!.w + second.track.points[0]!.w) / 2;
      const spreadY = Math.abs(primary.meanCy - second.meanCy) + (primary.track.points[0]!.h + second.track.points[0]!.h) / 2;
      if (spreadX <= z1.fw && spreadY <= z1.fh) {
        const cx = (primary.meanCx + second.meanCx) / 2;
        const cy = (primary.meanCy + second.meanCy) / 2;
        return {
          startMs: span.startMs,
          endMs: span.endMs,
          strategy: "wide",
          baseWindow: windowForCentre(cx, cy, 1, z1.fw, z1.fh),
          keyframes: [],
          centre: { x: cx, y: cy },
          trackCount: persistent.length,
        };
      }
    }

    // TRACK (with sentence-boundary switching when a second face persists)
    const series: PathPoint[] = [];
    let active: TrackStats = primary;
    let lastSwitchMs = Number.NEGATIVE_INFINITY;
    const boundaries = (input.sentenceStartsMs ?? []).filter((t) => t > span.startMs && t < span.endMs);
    for (const sample of inScene) {
      if (second && boundaries.some((b) => Math.abs(b - sample.atMs) < 500) && sample.atMs - lastSwitchMs >= 2000) {
        const other = active === primary ? second : primary;
        const near = (s: TrackStats): number => {
          const pts = s.track.points.filter((p) => Math.abs(p.atMs - sample.atMs) <= 1500);
          return pts.length ? pts.reduce((a, p) => a + p.w * p.h, 0) / pts.length : 0;
        };
        if (near(other) > near(active) * 1.15) {
          active = other;
          lastSwitchMs = sample.atMs;
        }
      }
      const point = active.track.points.reduce<NormBox | null>((best, p) => {
        if (!best) return p;
        return Math.abs(p.atMs - sample.atMs) < Math.abs(best.atMs - sample.atMs) ? p : best;
      }, null);
      if (point && Math.abs(point.atMs - sample.atMs) <= 1000) series.push({ atMs: sample.atMs, cx: point.cx, cy: point.cy });
      else if (series.length) series.push({ atMs: sample.atMs, cx: series[series.length - 1]!.cx, cy: series[series.length - 1]!.cy });
    }
    if (series.length === 0) return { ...centrePlan(), trackCount: tracks.length };

    const smoothed = smoothSeries(series);
    const baseCentre = smoothed[0]!;
    const baseWindow = windowForCentre(baseCentre.cx, baseCentre.cy, zoom, fw, fh);
    const baseEdges = windowEdges(baseWindow, fw, fh);

    // decimate the emitted path into offset keyframes
    const kept: PathPoint[] = [smoothed[0]!];
    for (let i = 1; i < smoothed.length; i++) {
      const p = smoothed[i]!;
      const last = kept[kept.length - 1]!;
      const win = windowForCentre(p.cx, p.cy, zoom, fw, fh);
      const lastWin = windowForCentre(last.cx, last.cy, zoom, fw, fh);
      const e = windowEdges(win, fw, fh);
      const le = windowEdges(lastWin, fw, fh);
      if (Math.abs(e.left - le.left) > PATH_EPSILON || Math.abs(e.top - le.top) > PATH_EPSILON) kept.push(p);
    }
    if (kept.length > 1 && kept[kept.length - 1] !== smoothed[smoothed.length - 1]) kept.push(smoothed[smoothed.length - 1]!);
    const thinned =
      kept.length <= PATH_MAX_KEYFRAMES
        ? kept
        : kept.filter((_, i) => i % Math.ceil(kept.length / PATH_MAX_KEYFRAMES) === 0 || i === kept.length - 1);

    const keyframes: SegmentKeyframe[] = [];
    if (thinned.length > 1) {
      thinned.forEach((p, i) => {
        const win = windowForCentre(p.cx, p.cy, zoom, fw, fh);
        const e = windowEdges(win, fw, fh);
        const atMs = Math.max(0, Math.round(p.atMs - span.startMs));
        keyframes.push(
          { id: `crop-${sceneIdx}-${i}-x`, atMs, property: "offsetX", value: round4(baseEdges.left - e.left), easing: "linear" },
          { id: `crop-${sceneIdx}-${i}-y`, atMs, property: "offsetY", value: round4(baseEdges.top - e.top), easing: "linear" },
        );
      });
    }

    return {
      startMs: span.startMs,
      endMs: span.endMs,
      strategy: "track",
      baseWindow,
      keyframes,
      centre: { x: primary.meanCx, y: primary.meanCy },
      trackCount: persistent.length,
    };
  });

  return { scenes, anyFace };
}

const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

/* ---------------- composition storage ---------------- */

/** The wire/storage shape of one planned scene (what the clips route accepts and re-derives from). */
export interface CropSceneWire {
  startMs: number;
  endMs: number;
  window: CropWindow;
  keyframes: { atMs: number; property: "offsetX" | "offsetY"; value: number }[];
}

export const planToWire = (plan: CropPathPlan): CropSceneWire[] =>
  plan.scenes.map((s) => ({
    startMs: Math.round(s.startMs),
    endMs: Math.round(s.endMs),
    window: s.baseWindow,
    keyframes: s.keyframes.map((k) => ({ atMs: k.atMs, property: k.property as "offsetX" | "offsetY", value: k.value })),
  }));

/**
 * Wire scenes → the composition segments, derived from the VIDEO ROW's real
 * dimensions (the route's discipline: client geometry is a request, the
 * stored transform is computed server-side from the source's true size).
 * Null when no crop exists for this source + aspect.
 */
export function cropPathSegmentsFromWire(
  scenes: readonly CropSceneWire[],
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
  aspect: ClipAspectId,
): VideoSegment[] | null {
  if (!needsReframeFor(sourceWidth, sourceHeight, ASPECT_RATIOS[aspect])) return null;
  const segments: VideoSegment[] = scenes
    .filter((s) => s.endMs > s.startMs)
    .map((scene, i) => ({
      id: i === 0 ? "main-video" : `main-video-${i}`,
      sourceInMs: Math.round(scene.startMs),
      sourceOutMs: Math.round(scene.endMs),
      playbackRate: 1,
      transform: cropWindowToTransformFor(scene.window, sourceWidth, sourceHeight, ASPECT_RATIOS[aspect]),
      transitionIn: null,
      assetId: null,
      still: false,
      keyframes: scene.keyframes.map((k, j) => ({
        id: `crop-${i}-${j}-${k.property === "offsetX" ? "x" : "y"}`,
        atMs: Math.max(0, Math.round(k.atMs)),
        property: k.property,
        value: k.value,
        easing: "linear" as const,
      })),
      effects: [],
    }));
  return segments.length ? segments : null;
}

/** Apply a crop path to a clip project's settings (canvas → aspect, fresh composition of path segments). */
export function cropPathClipSettings(input: {
  settings: ProjectSettings;
  scenes: readonly CropSceneWire[];
  aspect: ClipAspectId;
  sourceWidth: number | null | undefined;
  sourceHeight: number | null | undefined;
}): { settings: ProjectSettings; composition: CompositionSettings } | null {
  const segments = cropPathSegmentsFromWire(input.scenes, input.sourceWidth, input.sourceHeight, input.aspect);
  if (!segments) return null;
  const composition = CompositionSettingsSchema.parse({ videoSegments: segments });
  const settings: ProjectSettings = {
    ...input.settings,
    canvas: { aspect: input.aspect, background: input.settings.canvas?.background ?? "blur" },
    composition,
  };
  return { settings, composition };
}
