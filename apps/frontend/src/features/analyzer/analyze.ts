/**
 * Reel Analyzer breakdown engine — PURE core (Phase 6, slice 6.1).
 *
 * One deterministic breakdown of a reel from the three things this app can
 * actually measure in the browser: the spoken transcript (caption words with
 * timings), the reel's duration, and the picture's scene-cut times (the
 * clipper's frame-difference cuts, analysis.ts in features/clipper).
 *
 * Same input in, same breakdown out, every time: no DOM, no fetch, no
 * Date.now, no randomness, no model. Nothing here reads text burned into the
 * picture (see `onScreenText` below — that is a deliberate product decision,
 * not a missing feature), and nothing here judges quality.
 *
 * A7 transparency rule (binding, inherited from the Phase 5 clipper): every
 * number in the breakdown is a measured value shown WITH the method that
 * produced it, and there is NO composite / ranking / quality score anywhere
 * in the returned object — no key named "score", in any casing, at any depth.
 * Beat labels are structural positions only (first / CTA / last / middle),
 * never a judgement of how good a beat is.
 */

/** One transcript word with media timings (CaptionDoc word timings, minus the caption-only fields). */
export interface AnalyzerWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface ReelAnalysisInput {
  /** the visible transcript words, in any order — a sorted copy is taken, the input is never mutated */
  words: readonly AnalyzerWord[];
  durationMs: number;
  /** scene-cut times in media ms (e.g. from the clipper's scene detection);
   *  null = scene detection has not run — cut-based figures report "not measured",
   *  never a fake zero (an empty array means measured, and there were no cuts) */
  sceneCutsMs: readonly number[] | null;
}

/** The hook window: the first 3 seconds of the reel. */
export const HOOK_WINDOW_MS = 3000;
/** A gap between consecutive words at least this long is a pause — and splits beats. */
export const BEAT_PAUSE_MS = 700;

const HOOK_METHOD =
  `Words starting in the first ${HOOK_WINDOW_MS} ms of the reel; ` +
  "hasQuestion is true when that text contains '?' or its first word is a question word " +
  "(what / why / how / when / where / who / which / can / do / does / is / are, or Hinglish " +
  "kya / kyun / kaise / kab / kaun); hasNumber is true when any of those tokens contains a digit.";

const ON_SCREEN_TEXT_NOTE =
  "Text burned into the picture — captions, stickers and graphics — is NOT read: " +
  "browser text recognition is not reliable enough on typical phones, so this " +
  "breakdown covers the spoken transcript and the picture cuts only.";

const BEAT_METHOD =
  `Beats are split at pauses of ${BEAT_PAUSE_MS} ms or more between consecutive words and at ` +
  "scene cuts that fall inside a gap; labels are structural positions only — the first beat " +
  "is Hook, the beat containing the first call to action is Call to action, the last beat " +
  "(when it is neither of those) is Close, and every other beat is Story — not quality judgements.";

const CTA_METHOD = "Matched against a fixed phrase list in the transcript — not a model.";

const PACING_METHOD =
  "Words per minute and cuts per minute are the counts divided by the duration in minutes, " +
  "to 1 decimal (0 when the duration is 0); a pause is a gap of " +
  `${BEAT_PAUSE_MS} ms or more between consecutive words, and the longest pause is the ` +
  "largest such gap (0 when there is none); average shot length is the duration divided " +
  "by (scene cuts + 1), rounded to the nearest millisecond.";

/**
 * Call-to-action phrases matched against the normalised word stream
 * (lowercase, surrounding punctuation stripped), as consecutive word
 * sequences. Longest phrases win at each position and each word can be
 * consumed by only one match, so "follow karo" is reported once — never as
 * a bare "follow" plus a leftover. English first, then Hinglish (roman).
 */
export const CTA_PHRASES: readonly string[] = [
  // English
  "follow",
  "follow me",
  "subscribe",
  "link in bio",
  "comment",
  "share",
  "save this",
  "save it",
  "check out",
  "sign up",
  "download",
  "dm me",
  "shop now",
  "buy now",
  "join us",
  // Hinglish (roman)
  "follow karo",
  "subscribe karo",
  "comment karo",
  "share karo",
  "bio mein link",
  "bio me link",
  "link bio mein",
];

const QUESTION_WORDS = new Set([
  "what", "why", "how", "when", "where", "who", "which", "can", "do", "does", "is", "are",
  "kya", "kyun", "kaise", "kab", "kaun",
]);

/** Lowercase + strip surrounding punctuation — the normal form for phrase / question matching. */
const normaliseToken = (text: string): string =>
  text.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * The hook's question/number signals for a given hook TEXT — the exact computation
 * analyzeReel performs, exported so the breakdown editor can recompute the badges
 * live while the user edits the hook text (they used to stay frozen at whatever the
 * original transcript produced, silently contradicting the edited text).
 */
export function hookSignalsForText(text: string): { hasQuestion: boolean; hasNumber: boolean } {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const first = tokens.length ? normaliseToken(tokens[0]!) : "";
  return {
    hasQuestion: text.includes("?") || QUESTION_WORDS.has(first),
    hasNumber: tokens.some((t) => /\d/.test(t)),
  };
}

export type BeatLabel = "Hook" | "Story" | "Call to action" | "Close";

export interface ReelBeat {
  index: number;
  /** first word's start */
  startMs: number;
  /** last word's end */
  endMs: number;
  label: BeatLabel;
  text: string;
  wordCount: number;
  method: string;
}

export interface CtaMatch {
  phrase: string;
  /** index of the match's first word in the sorted, non-empty word stream */
  wordIndex: number;
  /** that word's startMs */
  atMs: number;
}

export interface BreakdownMetric {
  id: string;
  label: string;
  value: number | string | string[] | null;
  display: string;
  method: string;
}

export interface ReelBreakdown {
  version: 1;
  hook: {
    windowMs: number;
    text: string;
    wordCount: number;
    /** end of the last word starting inside the window; null when the window holds no words */
    lastWordEndMs: number | null;
    hasQuestion: boolean;
    hasNumber: boolean;
    method: string;
  };
  onScreenText: {
    status: "not-extracted";
    note: string;
  };
  beats: ReelBeat[];
  cta: {
    found: CtaMatch[];
    hasCta: boolean;
    firstCtaAtMs: number | null;
    /** firstCtaAtMs / durationMs × 100, 1 decimal; null when there is no CTA or no duration */
    firstCtaPositionPct: number | null;
    method: string;
  };
  pacing: {
    durationMs: number;
    totalWords: number;
    wordsPerMin: number;
    cutCount: number | null;
    cutsPerMin: number | null;
    avgShotMs: number | null;
    pauseCount: number;
    longestPauseMs: number;
    method: string;
  };
  metrics: BreakdownMetric[];
}

/**
 * Match the CTA phrase list over the normalised word stream, scanning left
 * to right. At each position the longest phrases are tried first; a matched
 * word is consumed and cannot start or join another match.
 */
function matchCtas(words: readonly AnalyzerWord[]): CtaMatch[] {
  const tokens = words.map((w) => normaliseToken(w.text));
  // longest-phrase-first; the phrase list's own order breaks ties deterministically
  const phrases = CTA_PHRASES.map((phrase, order) => ({ phrase, order, parts: phrase.split(" ") }))
    .sort((a, b) => b.parts.length - a.parts.length || a.order - b.order);
  const found: CtaMatch[] = [];
  let i = 0;
  while (i < tokens.length) {
    let consumed = 0;
    for (const { phrase, parts } of phrases) {
      if (parts.length > tokens.length - i) continue;
      let matches = true;
      for (let j = 0; j < parts.length; j++) {
        if (tokens[i + j] !== parts[j]) { matches = false; break; }
      }
      if (matches) {
        found.push({ phrase, wordIndex: i, atMs: words[i]!.startMs });
        consumed = parts.length;
        break;
      }
    }
    i += consumed > 0 ? consumed : 1;
  }
  return found;
}

/**
 * Build the full breakdown. Never throws on an empty transcript: every
 * section degrades to its empty form (no hook text, no beats, no CTA,
 * zeroed pacing) and the metrics still report what was measured.
 */
export function analyzeReel(input: ReelAnalysisInput): ReelBreakdown {
  // Defensive copy: drop empty-text words, sort a copy by startMs (then endMs),
  // and never mutate the caller's arrays.
  const words = (input.words ?? [])
    .filter((w) => w && typeof w.text === "string" && w.text.trim().length > 0)
    .map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs }))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const durationMs = Number.isFinite(input.durationMs) && input.durationMs > 0 ? input.durationMs : 0;
  const sceneMeasured = input.sceneCutsMs != null;
  const sceneCutsMs = (input.sceneCutsMs ?? []).filter((n) => Number.isFinite(n));

  // --- hook: words starting inside the first HOOK_WINDOW_MS -----------------
  const hookWords = words.filter((w) => w.startMs < HOOK_WINDOW_MS);
  const hookText = hookWords.map((w) => w.text).join(" ");
  const { hasQuestion, hasNumber } = hookSignalsForText(hookText);
  const hookSignals: string[] = [];
  if (hasQuestion) hookSignals.push("question");
  if (hasNumber) hookSignals.push("number");

  // --- CTA (computed before beats: beat labels need the first match) --------
  const found = matchCtas(words);
  const firstCta = found[0] ?? null;
  const firstCtaAtMs = firstCta ? firstCta.atMs : null;
  const firstCtaPositionPct =
    firstCtaAtMs !== null && durationMs > 0 ? round1((firstCtaAtMs / durationMs) * 100) : null;

  // --- beats -----------------------------------------------------------------
  // A boundary falls between consecutive words when the gap reaches
  // BEAT_PAUSE_MS, OR a scene cut falls inside that gap
  // (prev.endMs < cut <= next.startMs) — a cut can split a beat even when
  // the gap alone is shorter than the pause threshold.
  const beatWordRanges: { startIdx: number; endIdx: number }[] = [];
  if (words.length > 0) {
    let startIdx = 0;
    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1]!;
      const next = words[i]!;
      const gap = next.startMs - prev.endMs;
      const cutInGap = sceneCutsMs.some((cut) => prev.endMs < cut && cut <= next.startMs);
      if (gap >= BEAT_PAUSE_MS || cutInGap) {
        beatWordRanges.push({ startIdx, endIdx: i - 1 });
        startIdx = i;
      }
    }
    beatWordRanges.push({ startIdx, endIdx: words.length - 1 });
  }
  const beats: ReelBeat[] = beatWordRanges.map((range, index) => {
    const beatWords = words.slice(range.startIdx, range.endIdx + 1);
    // Structural labels only: first beat Hook; the beat holding the FIRST CTA
    // match is Call to action; the last beat is Close only when it is neither
    // the first nor the CTA beat; everything else is Story. A single beat is Hook.
    let label: BeatLabel = "Story";
    if (index === 0) label = "Hook";
    else if (firstCta && firstCta.wordIndex >= range.startIdx && firstCta.wordIndex <= range.endIdx) label = "Call to action";
    else if (index === beatWordRanges.length - 1) label = "Close";
    return {
      index,
      startMs: beatWords[0]!.startMs,
      endMs: beatWords[beatWords.length - 1]!.endMs,
      label,
      text: beatWords.map((w) => w.text).join(" "),
      wordCount: beatWords.length,
      method: BEAT_METHOD,
    };
  });

  // --- pacing ------------------------------------------------------------------
  let pauseCount = 0;
  let longestPauseMs = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i]!.startMs - words[i - 1]!.endMs;
    if (gap >= BEAT_PAUSE_MS) {
      pauseCount++;
      if (gap > longestPauseMs) longestPauseMs = gap;
    }
  }
  const totalWords = words.length;
  const cutCount = sceneMeasured ? sceneCutsMs.length : null;
  const durationMin = durationMs / 60_000;
  const wordsPerMin = durationMs > 0 ? round1(totalWords / durationMin) : 0;
  const cutsPerMin = cutCount !== null && durationMs > 0 ? round1(cutCount / durationMin) : cutCount !== null ? 0 : null;
  const avgShotMs = cutCount !== null ? (durationMs > 0 ? Math.round(durationMs / (cutCount + 1)) : 0) : null;

  // --- metrics: the same computed values, re-listed with their methods --------
  const metrics: BreakdownMetric[] = [
    {
      id: "duration",
      label: "Duration",
      value: durationMs,
      display: `${round1(durationMs / 1000)} s`,
      method: "The reel duration supplied by the caller, in milliseconds.",
    },
    {
      id: "total-words",
      label: "Total words",
      value: totalWords,
      display: `${totalWords}`,
      method: "Count of transcript words with non-empty text, in time order.",
    },
    {
      id: "words-per-minute",
      label: "Words per minute",
      value: wordsPerMin,
      display: `${wordsPerMin.toFixed(1)}`,
      method: "Total words divided by the duration in minutes, to 1 decimal (0 when the duration is 0).",
    },
    {
      id: "scene-cuts",
      label: "Scene cuts",
      value: cutCount,
      display: cutCount === null ? "Not measured" : `${cutCount}`,
      method:
        cutCount === null
          ? "Scene detection has not run for this video yet, so there is no count — this is not a zero."
          : "Count of scene-cut times supplied from frame-difference scene detection.",
    },
    {
      id: "cuts-per-minute",
      label: "Cuts per minute",
      value: cutsPerMin,
      display: cutsPerMin === null ? "Not measured" : `${cutsPerMin.toFixed(1)}`,
      method:
        cutsPerMin === null
          ? "Scene detection has not run for this video yet, so there is no rate — this is not a zero."
          : "Scene cuts divided by the duration in minutes, to 1 decimal (0 when the duration is 0).",
    },
    {
      id: "average-shot-length",
      label: "Average shot length",
      value: avgShotMs,
      display: avgShotMs === null ? "Not measured" : `${avgShotMs} ms`,
      method:
        avgShotMs === null
          ? "Needs the scene-cut count, which has not been measured for this video yet."
          : "Duration divided by (scene cuts + 1), rounded to the nearest millisecond.",
    },
    {
      id: "hook-word-count",
      label: "Hook word count",
      value: hookWords.length,
      display: `${hookWords.length}`,
      method: `Words starting in the first ${HOOK_WINDOW_MS} ms of the reel.`,
    },
    {
      id: "hook-signals",
      label: "Hook signals present",
      value: hookSignals,
      display: hookSignals.length ? hookSignals.join(", ") : "none",
      method:
        "Question = '?' in the hook text or a question word as its first word; " +
        "number = a digit in any hook token. Presence only — no strength is inferred.",
    },
    {
      id: "pause-count",
      label: "Pauses",
      value: pauseCount,
      display: `${pauseCount}`,
      method: `Gaps of ${BEAT_PAUSE_MS} ms or more between consecutive transcript words.`,
    },
    {
      id: "longest-pause",
      label: "Longest pause",
      value: longestPauseMs,
      display: `${longestPauseMs} ms`,
      method: `The largest gap of ${BEAT_PAUSE_MS} ms or more between consecutive words (0 when there is none).`,
    },
    {
      id: "first-cta-position",
      label: "First CTA position",
      value: firstCtaPositionPct,
      display: firstCtaPositionPct !== null ? `${firstCtaPositionPct.toFixed(1)}%` : "none",
      method:
        "Start time of the first matched CTA phrase divided by the duration, as a percentage " +
        "to 1 decimal; 'none' when no phrase from the fixed list was matched.",
    },
  ];

  return {
    version: 1,
    hook: {
      windowMs: HOOK_WINDOW_MS,
      text: hookText,
      wordCount: hookWords.length,
      lastWordEndMs: hookWords.length ? hookWords[hookWords.length - 1]!.endMs : null,
      hasQuestion,
      hasNumber,
      method: HOOK_METHOD,
    },
    onScreenText: { status: "not-extracted", note: ON_SCREEN_TEXT_NOTE },
    beats,
    cta: {
      found,
      hasCta: found.length > 0,
      firstCtaAtMs,
      firstCtaPositionPct,
      method: CTA_METHOD,
    },
    pacing: {
      durationMs,
      totalWords,
      wordsPerMin,
      cutCount,
      cutsPerMin,
      avgShotMs,
      pauseCount,
      longestPauseMs,
      method: PACING_METHOD,
    },
    metrics,
  };
}
