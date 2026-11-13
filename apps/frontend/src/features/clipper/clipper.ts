"use client";

import type { CaptionDoc } from "@capseasy/shared";
import {
  SEGMENT_GAP_MS,
  SEGMENT_MAX_MS,
  SEGMENT_MIN_MS,
  SEGMENT_SNIPPET_WORDS,
  clipDocForSegment,
  proposeSegments,
  type ProposeSegmentsOptions,
  type SegmentProposal,
} from "@motion-ai/caption-engine/core";
import {
  nearestSceneCutMs,
  nearestSilenceEdgeMs,
  silenceAt,
  type SceneChange,
  type SilenceSpan,
} from "./analysis";
import { studioService } from "@/services/studio";
import { getLocalVideo, saveLocalVideo } from "@/features/upload/localVideos";
import { clampCropWindow, type ClipAspectId, type CropWindow } from "./reframe";
import type { CropSceneWire } from "./cropPath";
import { ProjectSettingsSchema, newId, type OverlayItem } from "@capseasy/shared";
import { validateMediaFile, type AssetLicenceRecord } from "@/features/studio/mediaAssets";
import { probeMediaFile } from "@/features/studio/mediaProbe";
import { saveAsset } from "@/features/studio/mediaStore";

/** The shortest clip a user can dial in by hand (proposals themselves target 15–60s). */
export const CLIP_MIN_MS = 3000;

/**
 * Package 3 item I.2 — how many clips to SUGGEST for a video: roughly one per six
 * minutes of source, at least 3, at most 8 — and never more than the detection
 * actually produced (`available`): a quiet video with two real segments gets two
 * suggestions, never padded ones.
 */
export function clipTargetCount(durationMs: number, available: number): number {
  const byDuration = Math.round(Math.max(0, durationMs) / 360_000);
  const target = Math.max(3, Math.min(8, byDuration));
  return Math.max(0, Math.min(available, target));
}

/** m:ss for a millisecond instant (0:32, 1:05, 12:40). */
export function fmtClipTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

/** "0:32–1:05" — the range label used in lists and in the clip project's title. */
export function fmtClipRange(startMs: number, endMs: number): string {
  return `${fmtClipTime(startMs)}–${fmtClipTime(endMs)}`;
}

/**
 * Clamp a hand-adjusted range to the media: both edges inside [0, mediaDurationMs] (an unknown
 * duration, 0, only clamps at 0), start before end, and at least CLIP_MIN_MS long where the
 * media leaves room for that.
 */
export function clampClipRange(range: { startMs: number; endMs: number }, mediaDurationMs: number): { startMs: number; endMs: number } {
  const max = mediaDurationMs > 0 ? Math.round(mediaDurationMs) : Number.POSITIVE_INFINITY;
  let startMs = Math.min(Math.max(0, Math.round(range.startMs)), max);
  let endMs = Math.min(Math.max(0, Math.round(range.endMs)), max);
  if (endMs <= startMs) endMs = Math.min(max, startMs + CLIP_MIN_MS);
  if (endMs - startMs < CLIP_MIN_MS) {
    // widen the end first, then pull the start back — whichever the media leaves room for
    endMs = Math.min(max, startMs + CLIP_MIN_MS);
    if (endMs - startMs < CLIP_MIN_MS) startMs = Math.max(0, endMs - CLIP_MIN_MS);
  }
  return { startMs, endMs };
}

/** The clip project's title: the source title plus its range, capped at the 120-char project limit. */
export function clipProjectTitle(sourceTitle: string, startMs: number, endMs: number): string {
  const suffix = ` · Clip ${fmtClipRange(startMs, endMs)}`;
  const base = (sourceTitle || "Untitled project").trim();
  return `${base.slice(0, Math.max(1, 120 - suffix.length))}${suffix}`;
}

/**
 * Create the clip project for one segment of a transcribed source project:
 * the shifted caption doc + clip range go to the clips API (which copies the project and its
 * video row), then the source video's on-device bytes are copied to the new video id so the
 * clip project opens with its video attached — same file, never re-encoded or cut; the range
 * is metadata. When the source video is not on this device there is nothing to copy and the
 * clip project will ask for the file again, exactly like a duplicated project does.
 */
export async function createClipProject(input: {
  sourceProjectId: string;
  sourceTitle: string;
  sourceVideoId: string | null;
  doc: CaptionDoc;
  startMs: number;
  endMs: number;
  /**
   * A title already generated for this clip (clipTitle.ts, via the Phase-3 routing) and
   * confirmed by the user in the creation flow. When absent, the plain range title is
   * used — exactly the pre-Phase-5 behaviour.
   */
  title?: string;
  /**
   * The 9:16 crop window the user chose for this clip (reframe.ts), when the clip is
   * being reframed vertical. The clips API re-derives the stored transform from the
   * window and the video row's own dimensions; when absent, no reframing is stored.
   */
  reframeWindow?: CropWindow;
  /**
   * AI Clipping Studio: the target aspect for this clip (9:16 default semantics
   * when absent) and, when a per-scene crop PATH was planned on-device, the
   * path wire — sent instead of `reframeWindow`; the clips API re-derives the
   * stored segments from the video row's own dimensions either way.
   */
  aspect?: ClipAspectId;
  cropPath?: { scenes: CropSceneWire[] };
  /**
   * Package 3 item I.3: element overlays the user TICKED from the suggestion strip
   * (clip-relative times, built by suggestions.ts). Only ticked elements ever arrive
   * here — with none ticked this is absent/empty and nothing is placed. They are
   * written into the new project's settings after creation, like a panel placement.
   */
  elements?: OverlayItem[];
  /**
   * Package 3 item I.4: B-roll files the user selected from the suggestions (already
   * downloaded by the caller), with their licence records. Each is probed and saved
   * into the new project's media bin, exactly like a manual bin import.
   */
  broll?: { file: File; licence: AssetLicenceRecord }[];
}): Promise<{ projectId: string; videoCopied: boolean; warnings: string[] }> {
  const doc = clipDocForSegment(input.doc, { startMs: input.startMs, endMs: input.endMs });
  const chosenTitle = input.title?.trim().slice(0, 120).trim();
  const created = await studioService.createClip(input.sourceProjectId, {
    title: chosenTitle || clipProjectTitle(input.sourceTitle, input.startMs, input.endMs),
    startMs: input.startMs,
    endMs: input.endMs,
    doc,
    ...(input.reframeWindow ? { reframe: clampCropWindow(input.reframeWindow) } : {}),
    ...(input.aspect ? { aspect: input.aspect } : {}),
    ...(input.cropPath ? { cropPath: input.cropPath } : {}),
  });
  let videoCopied = false;
  if (created.videoId && input.sourceVideoId && created.videoId !== input.sourceVideoId) {
    const blob = await getLocalVideo(input.sourceVideoId);
    if (blob) {
      await saveLocalVideo(created.videoId, blob);
      videoCopied = true;
    }
  }
  // Post-creation additions (Package 3 items I.3/I.4): each step is independent and
  // fault-tolerant — a failure is reported as a warning, never hidden, and never
  // un-creates the clip.
  const warnings: string[] = [];
  if (input.elements && input.elements.length > 0) {
    try {
      const st = await studioService.getStudio(created.project.id);
      const settings = ProjectSettingsSchema.parse((st.project as { settings_json?: unknown }).settings_json ?? {});
      await studioService.savePatch(created.project.id, {
        settings_json: { ...settings, overlays: [...settings.overlays, ...input.elements] },
      });
    } catch {
      warnings.push("the ticked elements couldn't be added — the clip itself was created without them");
    }
  }
  for (const b of input.broll ?? []) {
    try {
      const v = validateMediaFile(b.file);
      if (!v.ok) throw new Error(v.error);
      const probed = await probeMediaFile(b.file, v.kind);
      await saveAsset({
        id: newId(),
        projectId: created.project.id,
        kind: v.kind,
        name: b.file.name,
        mime: b.file.type,
        size: b.file.size,
        durationMs: probed.durationMs,
        width: probed.width,
        height: probed.height,
        blob: b.file,
        thumb: probed.thumb,
        peaks: probed.peaks,
        createdAt: Date.now(),
        licence: b.licence,
      });
    } catch {
      warnings.push(`B-roll "${b.file.name}" couldn't be added to the clip's media bin`);
    }
  }
  return { projectId: created.project.id, videoCopied, warnings };
}

/* ------------------------------------------------------------------ *
 * Slice 5.3 + A7 — combined segment suggestions and ranking explanations.
 *
 * Segmentation still starts from the transcript, but candidate boundaries now
 * combine three measured signals: transcript gaps, audio-energy silence spans
 * (analysis.ts, from the waveform peaks) and frame-difference scene cuts.
 * A boundary where a silence edge or a scene cut also lands is PREFERRED when
 * a long run must be split, and a run can break at a word edge where a silence
 * and a scene cut coincide even if the transcript gap alone is under the gap
 * threshold. Edges are ALWAYS word edges — a word's start or end — exactly as
 * in proposeSegments; analysis signals never move an edge off a word.
 *
 * Ranking (A7): suggestions are ordered by a deterministic, lexicographic
 * comparison of MEASURED signals — hook detected in the first 3 s, then
 * boundary alignment, then scene changes inside the clip, then word rate
 * closest to a conversational pace. There is NO composite score: no number
 * is computed, stored or displayed as a quality claim. Every suggestion
 * carries its measured signals with values plus a plain-language explanation
 * built from those values.
 * ------------------------------------------------------------------ */

export type TimedWordLike = { text: string; startMs: number; endMs: number };

/** The measured analysis available to the segmenter / ranker (either may be absent). */
export interface ClipAnalysisInput {
  silences?: readonly SilenceSpan[];
  sceneCuts?: readonly SceneChange[];
}

/** A word edge counts as aligned with a signal when that signal lands within this window. */
export const BOUNDARY_ALIGN_WINDOW_MS = 750;
/** The hook proxy only looks at this much of the clip's opening transcript. */
export const HOOK_WINDOW_MS = 3000;
/** An internal word gap at least this long counts as a pause for pause density. */
export const PAUSE_GAP_MS = 400;
/** Conversational pace the word-rate comparison is centred on. */
export const CONVERSATIONAL_WPM = 150;

const QUESTION_WORDS = new Set([
  "what", "why", "how", "when", "where", "who", "which", "can", "could", "do", "does", "did", "is", "are", "will", "would",
]);
const NUMBER_WORDS = new Set([
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "hundred", "thousand", "million",
]);
const CLAIM_WORDS = new Set([
  "secret", "secrets", "truth", "nobody", "everybody", "everyone", "always", "never", "best", "worst",
  "biggest", "mistake", "mistakes", "stop", "free", "proven", "guaranteed", "actually",
]);

const cleanToken = (t: string) => t.toLowerCase().replace(/^[^a-z0-9?]+|[^a-z0-9?]+$/g, "");

export interface HookSignal {
  detected: boolean;
  /** which deterministic checks fired, in check order */
  kinds: ("question" | "number" | "claim")[];
  /** the transcript token that fired the first matching check, when any */
  matched: string | null;
  /** the transcript text actually inspected (the clip's first HOOK_WINDOW_MS of words) */
  openingText: string;
}

/** Detect the first-3-seconds hook proxy: a question, a number, or a strong claim word. */
export function detectHook(openingWords: readonly TimedWordLike[]): HookSignal {
  const kinds: HookSignal["kinds"] = [];
  let matched: string | null = null;
  const tokens = openingWords.map((w) => w.text);
  const joined = tokens.join(" ");
  const cleaned = tokens.map(cleanToken).filter(Boolean);
  if (joined.includes("?") || (cleaned[0] !== undefined && QUESTION_WORDS.has(cleaned[0]))) {
    kinds.push("question");
    matched = joined.includes("?") ? "?" : cleaned[0]!;
  }
  const numberToken = cleaned.find((t) => /\d/.test(t) || NUMBER_WORDS.has(t));
  if (numberToken !== undefined) {
    kinds.push("number");
    matched ??= numberToken;
  }
  const claimToken = cleaned.find((t) => CLAIM_WORDS.has(t));
  if (claimToken !== undefined) {
    kinds.push("claim");
    matched ??= claimToken;
  }
  return { detected: kinds.length > 0, kinds, matched, openingText: joined };
}

export interface BoundaryAlignment {
  atMs: number;
  /** ms to the nearest silence-span edge, or null when no silence was measured */
  silenceDistanceMs: number | null;
  /** ms to the nearest scene cut, or null when no cut was measured */
  sceneDistanceMs: number | null;
  /** true when a silence edge or a scene cut lands within BOUNDARY_ALIGN_WINDOW_MS */
  aligned: boolean;
  /** plain-language label, e.g. "silence edge 120 ms away · scene cut 40 ms away" */
  label: string;
}

export function boundaryAlignment(atMs: number, analysis: ClipAnalysisInput): BoundaryAlignment {
  const silenceDistanceMs = analysis.silences?.length ? nearestSilenceEdgeMs(analysis.silences, atMs) : null;
  const sceneDistanceMs = analysis.sceneCuts?.length ? nearestSceneCutMs(analysis.sceneCuts, atMs) : null;
  const aligned =
    (silenceDistanceMs !== null && silenceDistanceMs <= BOUNDARY_ALIGN_WINDOW_MS) ||
    (sceneDistanceMs !== null && sceneDistanceMs <= BOUNDARY_ALIGN_WINDOW_MS);
  const parts: string[] = [];
  if (silenceDistanceMs !== null) parts.push(`silence edge ${Math.round(silenceDistanceMs)} ms away`);
  if (sceneDistanceMs !== null) parts.push(`scene cut ${Math.round(sceneDistanceMs)} ms away`);
  return { atMs, silenceDistanceMs, sceneDistanceMs, aligned, label: parts.length ? parts.join(" · ") : "transcript gap only" };
}

/** Every measured signal behind one suggested clip — values, never a composite score. */
export interface ClipSignals {
  hook: HookSignal;
  /** internal word gaps >= PAUSE_GAP_MS inside the clip */
  pauseCount: number;
  pausesPerMinute: number;
  wordCount: number;
  /** words per minute over the clip's duration */
  wordRateWpm: number;
  /** caption/word density: words per second of clip */
  wordsPerSecond: number;
  /** scene cuts strictly inside the clip */
  sceneChangeCount: number;
  /** measured audio silence overlapping the clip, in ms */
  silenceMsInside: number;
  startBoundary: BoundaryAlignment;
  endBoundary: BoundaryAlignment;
  /** 0, 1 or 2 — how many of the clip's edges align with a silence edge or scene cut */
  alignedBoundaryCount: number;
}

export function computeClipSignals(
  clipWords: readonly TimedWordLike[],
  range: { startMs: number; endMs: number },
  analysis: ClipAnalysisInput = {},
): ClipSignals {
  const words = [...clipWords]
    .filter((w) => w.endMs > w.startMs && w.text.trim().length > 0 && w.startMs >= range.startMs && w.startMs < range.endMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const durationMs = Math.max(1, range.endMs - range.startMs);
  const durationMin = durationMs / 60_000;
  let pauseCount = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i]!.startMs - words[i - 1]!.endMs >= PAUSE_GAP_MS) pauseCount++;
  }
  let silenceMsInside = 0;
  for (const s of analysis.silences ?? []) {
    silenceMsInside += Math.max(0, Math.min(s.endMs, range.endMs) - Math.max(s.startMs, range.startMs));
  }
  const startBoundary = boundaryAlignment(range.startMs, analysis);
  const endBoundary = boundaryAlignment(range.endMs, analysis);
  return {
    hook: detectHook(words.filter((w) => w.startMs - range.startMs < HOOK_WINDOW_MS)),
    pauseCount,
    pausesPerMinute: pauseCount / durationMin,
    wordCount: words.length,
    wordRateWpm: words.length / durationMin,
    wordsPerSecond: words.length / (durationMs / 1000),
    sceneChangeCount: (analysis.sceneCuts ?? []).filter((c) => c.atMs > range.startMs && c.atMs < range.endMs).length,
    silenceMsInside,
    startBoundary,
    endBoundary,
    alignedBoundaryCount: Number(startBoundary.aligned) + Number(endBoundary.aligned),
  };
}

const fmt1 = (n: number) => Math.round(n * 10) / 10;

/** Plain-language "why this ranks here", built only from the clip's measured values. */
export function explainClip(signals: ClipSignals, rank: number, total: number): string {
  const parts: string[] = [`Ranked ${rank} of ${total}.`];
  if (signals.hook.detected) {
    const kindText = signals.hook.kinds.join(" and ");
    parts.push(
      `It opens with a ${kindText} in the first 3 seconds${signals.hook.matched ? ` ("${signals.hook.matched}")` : ""} — the hook check looks for a question, a number or a strong claim there.`,
    );
  } else {
    parts.push("Nothing detected in the first 3 seconds. No question, number or strong claim.");
  }
  if (signals.alignedBoundaryCount === 2) parts.push("Both edges line up with a measured silence edge or scene cut.");
  else if (signals.alignedBoundaryCount === 1) parts.push("One edge lines up with a measured silence edge or scene cut.");
  else parts.push("Its edges follow transcript gaps only — no silence edge or scene cut lands close to them.");
  parts.push(
    `Measured inside the clip: ${Math.round(signals.wordRateWpm)} words per minute, ` +
      `${fmt1(signals.pausesPerMinute)} pauses per minute (${signals.pauseCount} pauses of ${PAUSE_GAP_MS} ms or more), ` +
      `${signals.sceneChangeCount} scene change${signals.sceneChangeCount === 1 ? "" : "s"}, ` +
      `${fmt1(signals.wordsPerSecond)} words per second of captions, ` +
      `${fmt1(signals.silenceMsInside / 1000)} s of measured silence.`,
  );
  parts.push("Order is set by these measured signals in that sequence — there is no quality score.");
  return parts.join(" ");
}

interface RunLike { words: TimedWordLike[]; startMs: number; endMs: number }
const runOfWords = (words: TimedWordLike[]): RunLike => ({ words, startMs: words[0]!.startMs, endMs: words[words.length - 1]!.endMs });

/** Does the gap between two words coincide with a measured silence or a scene cut? */
function gapIsAligned(leftEndMs: number, rightStartMs: number, analysis: ClipAnalysisInput): boolean {
  const mid = (leftEndMs + rightStartMs) / 2;
  const sil = analysis.silences?.length ? silenceAt(analysis.silences, mid) : null;
  if (sil) return true;
  if (analysis.silences?.length) {
    const d = nearestSilenceEdgeMs(analysis.silences, mid);
    if (d !== null && d <= BOUNDARY_ALIGN_WINDOW_MS) return true;
  }
  if (analysis.sceneCuts?.length) {
    const d = nearestSceneCutMs(analysis.sceneCuts, mid);
    if (d !== null && d <= BOUNDARY_ALIGN_WINDOW_MS) return true;
  }
  return false;
}

function splitLongRun(run: RunLike, minMs: number, maxMs: number, analysis: ClipAnalysisInput): RunLike[] {
  if (run.endMs - run.startMs <= maxMs || run.words.length < 2) return [run];
  let best: { at: number; gap: number; bothFit: boolean; aligned: boolean; offMid: number } | null = null;
  const mid = (run.startMs + run.endMs) / 2;
  for (let i = 0; i < run.words.length - 1; i++) {
    const left = run.words[i]!;
    const right = run.words[i + 1]!;
    const gap = right.startMs - left.endMs;
    const bothFit = left.endMs - run.startMs >= minMs && run.endMs - right.startMs >= minMs;
    const aligned = gapIsAligned(left.endMs, right.startMs, analysis);
    const offMid = Math.abs((left.endMs + right.startMs) / 2 - mid);
    const better =
      !best ||
      (bothFit && !best.bothFit) ||
      (bothFit === best.bothFit &&
        ((aligned && !best.aligned) ||
          (aligned === best.aligned && (gap > best.gap || (gap === best.gap && offMid < best.offMid)))));
    if (better) best = { at: i, gap, bothFit, aligned, offMid };
  }
  if (!best) return [run];
  const leftRun = runOfWords(run.words.slice(0, best.at + 1));
  const rightRun = runOfWords(run.words.slice(best.at + 1));
  return [...splitLongRun(leftRun, minMs, maxMs, analysis), ...splitLongRun(rightRun, minMs, maxMs, analysis)];
}

/**
 * Segment suggestions combining transcript gaps + audio silence + scene boundaries.
 * With no analysis signals this is exactly proposeSegments (delegated, not re-implemented).
 * With signals: runs also break at a word edge where a silence span and a scene cut
 * coincide, and long-run splits prefer an aligned boundary over a merely larger gap.
 * Every returned edge is a word edge.
 */
export function suggestClipSegments(
  words: readonly TimedWordLike[],
  analysis: ClipAnalysisInput = {},
  opts: ProposeSegmentsOptions = {},
): SegmentProposal[] {
  const hasSignals = Boolean(analysis.silences?.length || analysis.sceneCuts?.length);
  if (!hasSignals) return proposeSegments(words, opts);
  const gapMs = opts.gapMs ?? SEGMENT_GAP_MS;
  const minMs = opts.minMs ?? SEGMENT_MIN_MS;
  const maxMs = opts.maxMs ?? SEGMENT_MAX_MS;
  const snippetWords = opts.snippetWords ?? SEGMENT_SNIPPET_WORDS;

  const sorted = [...words]
    .filter((w) => w.endMs > w.startMs && w.text.trim().length > 0)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  if (sorted.length === 0) return [];

  const runs: RunLike[] = [];
  let current: TimedWordLike[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    const gap = next.startMs - prev.endMs;
    // a coincident silence + scene cut is a boundary even when speech alone would run on
    const coincident =
      gap > 0 &&
      silenceAt(analysis.silences ?? [], (prev.endMs + next.startMs) / 2) !== null &&
      (nearestSceneCutMs(analysis.sceneCuts ?? [], (prev.endMs + next.startMs) / 2) ?? Number.POSITIVE_INFINITY) <= BOUNDARY_ALIGN_WINDOW_MS;
    if (gap >= gapMs || coincident) {
      runs.push(runOfWords(current));
      current = [next];
    } else {
      current.push(next);
    }
  }
  runs.push(runOfWords(current));

  const merged: RunLike[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.endMs - last.startMs < minMs) {
      merged[merged.length - 1] = runOfWords([...last.words, ...run.words]);
    } else {
      merged.push(run);
    }
  }
  if (merged.length > 1) {
    const last = merged[merged.length - 1]!;
    if (last.endMs - last.startMs < minMs) {
      const prev = merged[merged.length - 2]!;
      merged.splice(merged.length - 2, 2, runOfWords([...prev.words, ...last.words]));
    }
  }

  const pieces = merged.flatMap((r) => splitLongRun(r, minMs, maxMs, analysis));
  return pieces.map((r) => ({
    startMs: r.startMs,
    endMs: r.endMs,
    durationMs: r.endMs - r.startMs,
    wordCount: r.words.length,
    text: r.words.slice(0, snippetWords).map((w) => w.text).join(" "),
  }));
}

export interface RankedClipProposal extends SegmentProposal {
  /** 1-based position in the ranked order */
  rank: number;
  signals: ClipSignals;
  explanation: string;
}

/**
 * Internal ordering only — a lexicographic comparison of measured signals.
 * It is never exposed as a number and never labelled a score.
 */
function compareSignals(a: ClipSignals, b: ClipSignals): number {
  if (a.hook.detected !== b.hook.detected) return a.hook.detected ? -1 : 1;
  if (a.alignedBoundaryCount !== b.alignedBoundaryCount) return b.alignedBoundaryCount - a.alignedBoundaryCount;
  if (a.sceneChangeCount !== b.sceneChangeCount) return b.sceneChangeCount - a.sceneChangeCount;
  const pace = Math.abs(a.wordRateWpm - CONVERSATIONAL_WPM) - Math.abs(b.wordRateWpm - CONVERSATIONAL_WPM);
  if (pace !== 0) return pace;
  return 0;
}

/** Combined segment suggestions, ranked, each carrying its measured signals + explanation (A7). */
export function rankClipProposals(
  words: readonly TimedWordLike[],
  analysis: ClipAnalysisInput = {},
  opts: ProposeSegmentsOptions = {},
): RankedClipProposal[] {
  const segments = suggestClipSegments(words, analysis, opts);
  const withSignals = segments.map((seg) => ({
    seg,
    signals: computeClipSignals(words, seg, analysis),
  }));
  withSignals.sort((a, b) => compareSignals(a.signals, b.signals) || a.seg.startMs - b.seg.startMs);
  return withSignals.map(({ seg, signals }, i) => ({
    ...seg,
    signals,
    rank: i + 1,
    explanation: explainClip(signals, i + 1, withSignals.length),
  }));
}
