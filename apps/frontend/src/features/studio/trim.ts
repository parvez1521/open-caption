import { newId, type CaptionDoc, type Word } from "@capseasy/shared";
import { detectSilences } from "@/features/clipper/analysis";
import { PEAKS_PER_SECOND } from "./useWaveform";
import {
  applyContentEffect,
  applyDocEffect,
  MIN_VIDEO_MS,
  type DocEffect,
} from "./compositionOps";
import type { EditorComposition, EditorVideoClip } from "./compositionDoc";

/**
 * Trim fillers & pauses (Phase 5, Addition A3) — PURE proposal + apply cores.
 *
 * Detection is DETERMINISTIC and stated that way in the panel: proposals come
 * from the project's transcript (caption doc) and, for pauses, the audio
 * levels (waveform peaks via Stage A's `detectSilences`). Nothing here is a
 * model and nothing is labelled AI.
 *
 * CONSERVATIVE PAUSE RULE (documented behaviour, pinned by tests): a pause is
 * proposed only where BOTH signals agree —
 *   1. a transcript gap between two visible words (or the head/tail of the
 *      timeline) at least `thresholdMs` long, AND
 *   2. when peaks are available, a detected silence covering at least half of
 *      that gap (and at least 300 ms of it).
 * So a silence with no transcript gap (quiet audio under continuous speech)
 * proposes nothing, and a transcript gap with loud audio over it (music,
 * another speaker, speech the transcript missed) proposes nothing either.
 * When peaks are NOT available yet, gap-only proposals are made and flagged
 * `silenceConfirmed: false` so the panel can say so honestly.
 *
 * Every proposed cut keeps {@link BREATH_MARGIN_MS} of the pause at each edge
 * (a natural breath is not dead air), and every cut edge sits on a word
 * boundary or inside a transcript gap — a cut never lands inside a word.
 *
 * Proposals are DERIVED STATE: an id is just kind+range, and applying works
 * purely by time range, so after an apply the proposals recomputed against
 * the new doc are automatically correct — no stored index can go stale.
 */

/**
 * The filler wordlist — authored in-repo for this feature (provenance: written
 * by hand for Open Caption, no external wordlist asset). It is deliberately
 * SMALL: only pure hesitation sounds whose removal cannot change meaning.
 * Discourse words that merely OFTEN act as fillers are excluded on purpose —
 * English "like" / "well" / "so", and Hinglish "matlab" (it means "meaning /
 * I mean" and carries content), "yaar", "na", "toh", "bhai" — because a false
 * cut is worse than a miss. When in doubt, a word stays out of this list.
 */
export const FILLER_WORDS: ReadonlySet<string> = new Set([
  "um",
  "uh",
  "uhh",
  "umm",
  "er",
  "erm",
  "ah",
  "ahh",
  "hmm",
  "mm",
  "mmm",
]);

/**
 * Words whose immediate repetition is normally emphasis or laughter, not a
 * false start ("ha ha", "no no no", "oh oh") — never proposed as repeats.
 */
const REPEAT_EXCLUSIONS: ReadonlySet<string> = new Set(["ha", "oh", "wow", "yes", "no", "yeah", "hey"]);

/** Default minimum pause length that earns a proposal: 800 ms. Natural
 *  between-sentence pauses run ~400–600 ms, so 800 ms targets dead air
 *  without nibbling normal rhythm; the panel slider adjusts it. */
export const DEFAULT_PAUSE_THRESHOLD_MS = 800;
/** Silence kept at EACH edge of a pause cut, so speech keeps a natural breath. */
export const BREATH_MARGIN_MS = 150;
/** A pause cut shorter than this after margins is not worth a cut. */
const MIN_PAUSE_CUT_MS = 150;
/** A repeated word only counts as a false start when the copies are this close. */
const REPEAT_MAX_GAP_MS = 1000;
/** …and the first (false-start) copy is at most this long. */
const REPEAT_MAX_FIRST_MS = 800;

export type TrimProposalKind = "filler" | "pause";

export interface TrimProposal {
  /** derived id: kind + range — stable for the same doc, never a stored index */
  id: string;
  kind: TrimProposalKind;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** the filler word itself (filler proposals); "" for pauses */
  word: string;
  /** short human reason, e.g. `Filler word "um"` / `Repeated word — false start` / `Pause 1.5s` */
  label: string;
  /** surrounding transcript with the cut shown in [brackets] */
  contextText: string;
  /** pause proposals only: false when peaks were unavailable and the gap alone proposed it */
  silenceConfirmed: boolean;
}

export interface TrimRange {
  startMs: number;
  endMs: number;
}

const normalizeWord = (text: string): string =>
  text.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

const contextAround = (
  words: readonly Word[],
  cutIndexBefore: number,
  cutIndexAfter: number,
  bracket: string,
): string => {
  const before = words.slice(Math.max(0, cutIndexBefore - 3), cutIndexBefore + 1).map((w) => w.text);
  const after = words.slice(cutIndexAfter, cutIndexAfter + 4).map((w) => w.text);
  const parts = [...before, bracket, ...after].filter(Boolean);
  return parts.join(" ");
};

export interface ProposeTrimCutsInput {
  words: readonly Word[];
  /** waveform peaks for the project (useWaveform), or null when not decoded yet */
  peaks: Float32Array | null | undefined;
  /** ms per peak; defaults to the useWaveform hop (PEAKS_PER_SECOND = 50) */
  hopMs?: number;
  /** project timeline duration, for a trailing pause; omit to skip the tail */
  durationMs?: number;
  /** minimum transcript gap that earns a pause proposal */
  thresholdMs?: number;
}

/**
 * Propose every filler + pause cut for a caption doc. Pure: same inputs, same
 * proposals, in timeline order, non-overlapping.
 */
export function proposeTrimCuts(input: ProposeTrimCutsInput): TrimProposal[] {
  const thresholdMs = Math.max(1, Math.round(input.thresholdMs ?? DEFAULT_PAUSE_THRESHOLD_MS));
  const words = [...input.words].filter((w) => !w.hidden && w.endMs > w.startMs).sort((a, b) => a.startMs - b.startMs);
  const proposals: TrimProposal[] = [];

  /* ---- fillers: exact word spans ------------------------------------ */
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const norm = normalizeWord(w.text);
    if (!norm) continue;
    if (FILLER_WORDS.has(norm)) {
      proposals.push({
        id: `trim-filler-${w.startMs}-${w.endMs}`,
        kind: "filler",
        startMs: Math.round(w.startMs),
        endMs: Math.round(w.endMs),
        durationMs: Math.round(w.endMs - w.startMs),
        word: w.text,
        label: `Filler word "${norm}"`,
        contextText: contextAround(words, i - 1, i + 1, `[${w.text}]`),
        silenceConfirmed: true,
      });
      continue;
    }
    // repeated false start: the same word again right away — the FIRST copy goes
    const next = words[i + 1];
    if (
      next &&
      !REPEAT_EXCLUSIONS.has(norm) &&
      normalizeWord(next.text) === norm &&
      next.startMs - w.endMs <= REPEAT_MAX_GAP_MS &&
      w.endMs - w.startMs <= REPEAT_MAX_FIRST_MS
    ) {
      proposals.push({
        id: `trim-filler-${w.startMs}-${w.endMs}`,
        kind: "filler",
        startMs: Math.round(w.startMs),
        endMs: Math.round(w.endMs),
        durationMs: Math.round(w.endMs - w.startMs),
        word: w.text,
        label: `Repeated word "${norm}" — false start`,
        contextText: contextAround(words, i - 1, i + 1, `[${w.text}]`),
        silenceConfirmed: true,
      });
    }
  }

  /* ---- pauses: transcript gap ∩ audio silence ------------------------ */
  const hopMs = input.hopMs ?? 1000 / PEAKS_PER_SECOND;
  const silences = input.peaks
    ? detectSilences(input.peaks, hopMs, { minSilenceMs: Math.min(400, thresholdMs) })
    : null;

  // gap list: [gapStart, gapEnd, wordIndexBefore, wordIndexAfter]
  const gaps: Array<[number, number, number, number]> = [];
  if (words.length > 0) {
    gaps.push([0, words[0]!.startMs, -1, 0]);
    for (let i = 0; i + 1 < words.length; i++) gaps.push([words[i]!.endMs, words[i + 1]!.startMs, i, i + 1]);
    if (input.durationMs !== undefined) gaps.push([words[words.length - 1]!.endMs, input.durationMs, words.length - 1, words.length]);
  }

  for (const [gapStart, gapEnd, beforeIdx, afterIdx] of gaps) {
    const gapDur = gapEnd - gapStart;
    if (gapDur < thresholdMs) continue;

    let cutStart: number;
    let cutEnd: number;
    let silenceConfirmed = true;
    if (silences) {
      // largest contiguous intersection of this gap with any silence span
      let best: [number, number] | null = null;
      for (const s of silences) {
        const a = Math.max(gapStart, s.startMs);
        const b = Math.min(gapEnd, s.endMs);
        if (b > a && (!best || b - a > best[1] - best[0])) best = [a, b];
      }
      // conservative: silence must cover at least half the gap and 300 ms of it
      if (!best || best[1] - best[0] < Math.max(300, gapDur / 2)) continue;
      [cutStart, cutEnd] = [best[0] + BREATH_MARGIN_MS, best[1] - BREATH_MARGIN_MS];
    } else {
      silenceConfirmed = false;
      cutStart = gapStart + BREATH_MARGIN_MS;
      cutEnd = gapEnd - BREATH_MARGIN_MS;
    }
    // clamp to word edges (the gap IS the space between words; this guards rounding)
    cutStart = Math.max(Math.round(cutStart), Math.round(gapStart));
    cutEnd = Math.min(Math.round(cutEnd), Math.round(gapEnd));
    if (cutEnd - cutStart < MIN_PAUSE_CUT_MS) continue;
    proposals.push({
      id: `trim-pause-${cutStart}-${cutEnd}`,
      kind: "pause",
      startMs: cutStart,
      endMs: cutEnd,
      durationMs: cutEnd - cutStart,
      word: "",
      label: `Pause ${(gapDur / 1000).toFixed(1)}s`,
      contextText: contextAround(words, beforeIdx, afterIdx, `[pause ${(gapDur / 1000).toFixed(1)}s]`),
      silenceConfirmed,
    });
  }

  // timeline order; a filler and a pause can never overlap (words vs gaps),
  // but repeats next to fillers can — keep the first of any overlap.
  proposals.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const out: TrimProposal[] = [];
  for (const p of proposals) {
    const prev = out[out.length - 1];
    if (prev && p.startMs < prev.endMs) continue;
    out.push(p);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* apply: ranges -> video partition + DocEffects                       */
/* ------------------------------------------------------------------ */

/** Normalise user ranges: rounded, positive, sorted DESCENDING (so applying
 *  one range never moves the coordinates of the ranges still to apply). */
export function normalizeTrimRanges(ranges: readonly TrimRange[]): TrimRange[] {
  return ranges
    .map((r) => ({ startMs: Math.round(r.startMs), endMs: Math.round(r.endMs) }))
    .filter((r) => r.endMs > r.startMs)
    .sort((a, b) => b.startMs - a.startMs);
}

/** The rangeRemove DocEffects for a set of trim ranges, in apply order. */
export function trimRangeEffects(ranges: readonly TrimRange[]): DocEffect[] {
  return normalizeTrimRanges(ranges).map((r) => ({
    type: "rangeRemove" as const,
    startMs: r.startMs,
    durationMs: r.endMs - r.startMs,
  }));
}

function relayoutClips(comp: EditorComposition, clips: readonly EditorVideoClip[]): EditorComposition {
  let endMs = 0;
  const laidOut = clips.map((clip, i) => {
    const rate = clip.still ? 1 : (clip.playbackRate ?? 1);
    const durationMs = Math.round((clip.sourceOutMs - clip.sourceInMs) / rate);
    const startMs = i === 0 ? 0 : endMs - (clip.transitionIn?.durationMs ?? 0);
    const next: EditorVideoClip = { ...clip, startMs, durationMs };
    endMs = startMs + durationMs;
    return next;
  });
  return {
    ...comp,
    videoClips: laidOut,
    durationMs: endMs,
    rangeStartMs: laidOut.length > 0 ? laidOut[0]!.sourceInMs : comp.rangeStartMs,
  };
}

/** Remove ONE timeline range [s, e) from the video partition: clips fully
 *  inside drop, a spanning clip splits in two (second half gets a fresh id),
 *  edge clips trim on their source edge (rate-aware). A fragment shorter
 *  than MIN_VIDEO_MS is dropped rather than kept as a sliver. Refusing =
 *  same reference (empty range, or the removal would leave no video). */
export function removeRangeFromVideo(comp: EditorComposition, range: TrimRange): EditorComposition {
  const s = Math.round(range.startMs);
  const e = Math.round(range.endMs);
  if (e <= s || comp.videoClips.length === 0) return comp;
  const out: EditorVideoClip[] = [];
  for (const clip of comp.videoClips) {
    const cs = clip.startMs;
    const ce = clip.startMs + clip.durationMs;
    const rate = clip.still ? 1 : (clip.playbackRate ?? 1);
    if (ce <= s || cs >= e) {
      out.push(clip);
      continue;
    }
    if (cs >= s && ce <= e) continue; // fully inside: dropped
    if (cs < s && ce > e) {
      // spanning: split into the part before and the part after the cut
      const leftDur = s - cs;
      const rightDur = ce - e;
      if (leftDur >= MIN_VIDEO_MS) {
        out.push({
          ...clip,
          sourceOutMs: clip.sourceInMs + Math.round(leftDur * rate),
          keyframes: (clip.keyframes ?? []).filter((k) => k.atMs < leftDur),
        });
      }
      if (rightDur >= MIN_VIDEO_MS) {
        const headDelta = e - cs;
        out.push({
          ...clip,
          id: newId(),
          sourceInMs: clip.sourceInMs + Math.round(headDelta * rate),
          transitionIn: null,
          keyframes: (clip.keyframes ?? [])
            .filter((k) => k.atMs >= headDelta)
            .map((k) => ({ ...k, id: newId(), atMs: k.atMs - headDelta })),
          effects: (clip.effects ?? []).map((fx) => ({ ...fx, id: newId() })),
        });
      }
      continue;
    }
    if (cs < s) {
      // tail trimmed at s
      const keepDur = s - cs;
      if (keepDur >= MIN_VIDEO_MS) out.push({ ...clip, sourceOutMs: clip.sourceInMs + Math.round(keepDur * rate) });
      continue;
    }
    // head trimmed at e
    const keepDur = ce - e;
    if (keepDur >= MIN_VIDEO_MS) {
      const headDelta = e - cs;
      out.push({
        ...clip,
        sourceInMs: clip.sourceInMs + Math.round(headDelta * rate),
        keyframes: (clip.keyframes ?? [])
          .filter((k) => k.atMs >= headDelta)
          .map((k) => ({ ...k, atMs: k.atMs - headDelta })),
      });
    }
  }
  if (out.length === 0) return comp; // a composition may not cut its way to no video
  const first = out[0]!;
  const fixed = first.transitionIn ? [{ ...first, transitionIn: null }, ...out.slice(1)] : out;
  return relayoutClips(comp, fixed);
}

/** Remove many ranges from the video partition (descending order internally). */
export function removeRangesFromVideo(comp: EditorComposition, ranges: readonly TrimRange[]): EditorComposition {
  let next = comp;
  for (const r of normalizeTrimRanges(ranges)) next = removeRangeFromVideo(next, r);
  return next;
}

/**
 * The full apply, as ONE pure step: video partition cut + markers/overlays
 * and caption words following the SAME rangeRemove effects (descending), so
 * everything lands consistently. StudioPage performs exactly these steps
 * through `commitComposition` (video comp + the effects array), which makes
 * the whole apply ONE undo step (`editAll`). Empty / all-refused input
 * returns the inputs unchanged (same references).
 *
 * Note: placed audio clips (Audio Studio) are NOT retimed by this path —
 * the rangeRemove content effect covers captions, markers and overlays, as
 * specified for A3; audio-clip retiming is a declared deferral.
 */
export function applyTrimCuts(
  comp: EditorComposition,
  doc: CaptionDoc,
  ranges: readonly TrimRange[],
): { comp: EditorComposition; doc: CaptionDoc } {
  const effects = trimRangeEffects(ranges);
  if (effects.length === 0) return { comp, doc };
  let nextComp = removeRangesFromVideo(comp, ranges);
  if (nextComp === comp && comp.videoClips.length > 0) return { comp, doc };
  let nextDoc = doc;
  for (const effect of effects) {
    nextComp = applyContentEffect(nextComp, effect);
    nextDoc = applyDocEffect(nextDoc, effect);
  }
  return { comp: nextComp, doc: nextDoc };
}
