/**
 * The deterministic path: when no model is available (or every window failed),
 * clips still get found — by the clipper's existing measured segmentation and
 * signal ranking (A7), rescored onto the Editorial Score's measured rows.
 *
 * Honesty rules for this path:
 *  - the run is badged "Signals only" and the model-judged breakdown rows show
 *    "not judged" — heuristics are never dressed as the full AI;
 *  - a clip's title here is its own opening line (truncated), not an invented
 *    editorial title, and its reason is the measured explanation A7 already
 *    writes from real values;
 *  - ranges are the segmenter's word-exact ranges; cut times get the same
 *    silence alignment as the AI path.
 */
import { explainClip, rankClipProposals, type ClipAnalysisInput } from "../clipper";
import { cutTimesForRange } from "./boundaries";
import { dedupeByScore, isDuplicate, type RangeLike } from "./dedupe";
import { buildSentences } from "./sentences";
import { assembleClip, measureClip } from "./score";
import type { HighlightClip, HighlightRequest, HighlightWord } from "./types";

const TITLE_MAX = 60;

function titleOf(text: string): string {
  if (text.length <= TITLE_MAX) return text;
  const cut = text.slice(0, TITLE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 20 ? lastSpace : TITLE_MAX).trimEnd()}…`;
}

export function runSignalsPath(input: {
  words: readonly HighlightWord[];
  analysis: ClipAnalysisInput;
  peaks: Float32Array | null;
  hopMs: number;
  request: HighlightRequest;
  exclude?: readonly RangeLike[];
}): HighlightClip[] {
  const { words, analysis, request } = input;
  if (words.length === 0) return [];
  const sentences = buildSentences(words);
  const sentencesText = (first: number, last: number): string =>
    sentences.filter((s) => s.index >= first && s.index <= last).map((s) => s.text).join(" ");

  const proposals = rankClipProposals(words, analysis, {
    minMs: request.minSec * 1000,
    maxMs: request.maxSec * 1000,
  });
  const mediaEndMs = words[words.length - 1]!.endMs;
  const silences = analysis.silences ?? [];

  const clips: HighlightClip[] = [];
  proposals.forEach((p, i) => {
    // word indices for the segment's exact word edges
    let firstWord = -1;
    let lastWord = -1;
    words.forEach((w, wi) => {
      if (w.startMs >= p.startMs && w.startMs < p.endMs) {
        if (firstWord < 0) firstWord = wi;
        lastWord = wi;
      }
    });
    if (firstWord < 0) return;
    const firstSentence = sentences.find((s) => firstWord >= s.firstWord && firstWord <= s.lastWord)?.index ?? 0;
    const lastSentence = sentences.find((s) => lastWord >= s.firstWord && lastWord <= s.lastWord)?.index ?? firstSentence;
    const cut = cutTimesForRange(p.startMs, p.endMs, silences, mediaEndMs);
    const measured = measureClip(words, { startMs: p.startMs, endMs: p.endMs }, analysis, input.peaks, input.hopMs);
    const clip = assembleClip({
      id: `signals-${p.startMs}-${p.endMs}`,
      refined: {
        startWord: firstWord,
        endWord: lastWord,
        firstSentence,
        lastSentence,
        speechStartMs: p.startMs,
        speechEndMs: p.endMs,
        startMs: cut.startMs,
        endMs: cut.endMs,
      },
      words,
      sentencesText,
      candidate: null,
      measured,
      contentType: request.contentType,
      hasSceneData: Boolean(analysis.sceneCuts),
    });
    clips.push({
      ...clip,
      title: titleOf(clip.hook),
      reason: explainClip(p.signals, i + 1, proposals.length),
      rank: 0,
    });
  });

  const deduped = dedupeByScore(clips, (c) => c.score);
  const kept = deduped.filter(
    (c) => !(input.exclude ?? []).some((x) => isDuplicate(c, x)),
  );
  return kept.slice(0, Math.max(0, request.clipCount)).map((c, i) => ({ ...c, rank: i + 1 }));
}
