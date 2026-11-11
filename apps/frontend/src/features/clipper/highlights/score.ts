/**
 * Score composition — where the Editorial Score comes from, in the open.
 *
 * Two kinds of judgment exist and are never blurred:
 *  - MODEL-JUDGED rows (hook / value / story completeness / engagement): the
 *    LLM's editorial sub-scores, combined with the content type's rubric
 *    weights.
 *  - MEASURED rows (audio quality / pace / boundaries / scenes): arithmetic
 *    on signals this device measured — waveform peaks, word timings, scene
 *    cuts — via the clipper's existing `computeClipSignals`.
 *
 * Final score: with a model, 85% rubric-weighted model judgment + 15% the
 * mean of the available measured rows. Without a model (signals path), the
 * measured rows alone, weighted hook .30 / audio .20 / pace .20 / boundaries
 * .15 / scenes .15 and renormalised over whichever were actually measured.
 * Every row renders with its kind label on the card; a row that was not
 * judged or measured shows "not judged", never an invented number.
 */
import { computeClipSignals, type ClipAnalysisInput, type ClipSignals } from "../clipper";
import { rubricFor, weightedModelScore } from "./rubrics";
import type { RefinedRange } from "./boundaries";
import type {
  BreakdownRow,
  ContentTypeId,
  HighlightClip,
  HighlightWord,
  ModelSubScores,
  RawCandidate,
} from "./types";

export interface MeasuredScores {
  /** deterministic hook proxy: question/number/claim in the first 3 s */
  hook: number;
  audio: number | null;
  pace: number;
  boundaries: number;
  scenes: number | null;
  signals: ClipSignals;
}

const clamp100 = (v: number): number => Math.min(100, Math.max(0, Math.round(v)));

/** Audio quality from the waveform peaks over the clip's speech range. Null when no peaks were measured. */
export function audioQualityScore(
  peaks: Float32Array | null,
  hopMs: number,
  speechStartMs: number,
  speechEndMs: number,
): number | null {
  if (!peaks || peaks.length === 0 || !(hopMs > 0)) return null;
  const from = Math.max(0, Math.floor(speechStartMs / hopMs));
  const to = Math.min(peaks.length, Math.ceil(speechEndMs / hopMs));
  if (to <= from) return null;
  let sum = 0;
  let clipped = 0;
  for (let i = from; i < to; i++) {
    sum += peaks[i]!;
    if (peaks[i]! >= 0.99) clipped++;
  }
  const mean = sum / (to - from);
  const clipShare = clipped / (to - from);
  const loudness = mean <= 0.02 ? 15 : mean <= 0.05 ? 40 : mean <= 0.1 ? 65 : mean <= 0.55 ? 90 : 75;
  const clipping = clipShare <= 0.005 ? 100 : clipShare <= 0.02 ? 80 : clipShare <= 0.05 ? 55 : 30;
  return clamp100(0.6 * loudness + 0.4 * clipping);
}

export function measureClip(
  words: readonly HighlightWord[],
  range: { startMs: number; endMs: number },
  analysis: ClipAnalysisInput,
  peaks: Float32Array | null,
  hopMs: number,
): MeasuredScores {
  const signals = computeClipSignals(words, range, analysis);
  const hookKinds = signals.hook.kinds.length;
  const hook = !signals.hook.detected ? 35 : hookKinds === 1 ? 70 : hookKinds === 2 ? 85 : 95;
  const paceDeviation = Math.max(0, Math.max(130 - signals.wordRateWpm, signals.wordRateWpm - 180));
  const pace = clamp100(100 - paceDeviation * 1.2);
  const boundaries = signals.alignedBoundaryCount === 2 ? 95 : signals.alignedBoundaryCount === 1 ? 70 : 45;
  const scenesPerMinute = signals.sceneChangeCount / Math.max(1 / 60, (range.endMs - range.startMs) / 60_000);
  const scenes = !analysis.sceneCuts
    ? null
    : clamp100(scenesPerMinute === 0 ? 40 : scenesPerMinute <= 6 ? 40 + scenesPerMinute * 8.33 : scenesPerMinute <= 12 ? 90 : 55);
  return {
    hook,
    audio: audioQualityScore(peaks, hopMs, range.startMs, range.endMs),
    pace,
    boundaries,
    scenes,
    signals,
  };
}

const measuredMean = (m: MeasuredScores): number | null => {
  const rows = [m.audio, m.pace, m.boundaries, m.scenes].filter((v): v is number => v !== null);
  return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : null;
};

/** Signals-path final score: measured rows only, fixed weights renormalised over what's available. */
export function signalsScore(m: MeasuredScores): number {
  const parts: [number, number][] = [
    [m.hook, 0.3],
    [m.pace, 0.2],
    [m.boundaries, 0.15],
  ];
  if (m.audio !== null) parts.push([m.audio, 0.2]);
  if (m.scenes !== null) parts.push([m.scenes, 0.15]);
  const totalWeight = parts.reduce((a, [, w]) => a + w, 0);
  return clamp100(parts.reduce((a, [v, w]) => a + v * w, 0) / totalWeight);
}

const row = (key: string, label: string, value: number | null, kind: "model" | "measured"): BreakdownRow => ({
  key,
  label,
  value,
  kind,
});

export function breakdownFor(input: {
  model: ModelSubScores | null;
  measured: MeasuredScores;
  hasSceneData: boolean;
}): BreakdownRow[] {
  const { model, measured, hasSceneData } = input;
  const rows: BreakdownRow[] = model
    ? [
        row("hook", "Hook", model.hook, "model"),
        row("value", "Value", model.value, "model"),
        row("completeness", "Story completeness", model.storyCompleteness, "model"),
        row("engagement", "Engagement", model.engagement, "model"),
      ]
    : [
        row("hook", "Hook (measured proxy)", measured.hook, "measured"),
        row("value", "Value", null, "model"),
        row("completeness", "Story completeness", null, "model"),
        row("engagement", "Engagement", null, "model"),
      ];
  rows.push(row("audio", "Audio quality", measured.audio, "measured"));
  rows.push(row("pace", "Pace", measured.pace, "measured"));
  rows.push(row("boundaries", "Clean boundaries", measured.boundaries, "measured"));
  if (hasSceneData) rows.push(row("scenes", "Visual change", measured.scenes, "measured"));
  return rows;
}

const HOOK_MAX_CHARS = 140;

function hookOf(text: string): string {
  if (text.length <= HOOK_MAX_CHARS) return text;
  const cut = text.slice(0, HOOK_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : HOOK_MAX_CHARS).trimEnd()}…`;
}

/**
 * Assemble a finished clip from a refined range. `candidate` is null on the
 * signals path (title/hook/reason are then the caller's measured derivations).
 */
export function assembleClip(input: {
  id: string;
  refined: RefinedRange;
  words: readonly HighlightWord[];
  sentencesText: (first: number, last: number) => string;
  candidate: Pick<RawCandidate, "title" | "summary" | "reason" | "breakdown"> | null;
  measured: MeasuredScores;
  contentType: ContentTypeId;
  hasSceneData: boolean;
}): Omit<HighlightClip, "rank"> {
  const { refined, words, candidate, measured } = input;
  const text = words
    .slice(refined.startWord, refined.endWord + 1)
    .map((w) => w.text)
    .join(" ");
  const firstSentenceText = input.sentencesText(refined.firstSentence, refined.firstSentence);
  let score: number;
  if (candidate) {
    const modelScore = weightedModelScore(candidate.breakdown, rubricFor(input.contentType).weights);
    const mm = measuredMean(measured);
    score = clamp100(mm === null ? modelScore : 0.85 * modelScore + 0.15 * mm);
  } else {
    score = signalsScore(measured);
  }
  return {
    id: input.id,
    startWord: refined.startWord,
    endWord: refined.endWord,
    startMs: refined.startMs,
    endMs: refined.endMs,
    speechStartMs: refined.speechStartMs,
    speechEndMs: refined.speechEndMs,
    durationMs: refined.endMs - refined.startMs,
    title: candidate?.title ?? "",
    hook: hookOf(firstSentenceText),
    summary: candidate?.summary ?? "",
    reason: candidate?.reason ?? "",
    score,
    breakdown: breakdownFor({ model: candidate?.breakdown ?? null, measured, hasSceneData: input.hasSceneData }),
    text,
  };
}
