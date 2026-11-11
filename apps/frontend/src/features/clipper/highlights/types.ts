/**
 * AI Clipping Studio — shared types for the semantic highlight engine.
 *
 * The engine works on WORD INDICES, never on model-supplied seconds (the
 * AutoClip rule, adopted as methodology): the model reads the transcript with
 * every word tagged `[index]word` and answers with word indices; every time in
 * this file is derived from measured word timestamps in code.
 */

/** One transcript word with measured timings (structurally the clipper's TimedWordLike). */
export interface HighlightWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** A sentence as a span of word indices — the smallest unit a clip edge may use. */
export interface SentenceSpan {
  /** 0-based sentence number across the whole transcript */
  index: number;
  firstWord: number;
  lastWord: number;
  startMs: number;
  endMs: number;
  text: string;
  /** the sentence's text ends with "?" — a question whose answer must not be cut away */
  isQuestion: boolean;
}

export type ContentTypeId =
  | "podcast"
  | "interview"
  | "educational"
  | "tutorial"
  | "talking-head"
  | "vlog"
  | "gaming"
  | "webinar"
  | "general";

export type ClipAspectId = "9:16" | "1:1" | "16:9";

export interface HighlightRequest {
  contentType: ContentTypeId;
  /** how many clips to return (the engine may return fewer — never padded) */
  clipCount: number;
  /** duration bounds every returned clip must respect, in seconds */
  minSec: number;
  maxSec: number;
  aspect: ClipAspectId;
}

/** The four sub-scores the model judges (it never judges the measured rows). */
export interface ModelSubScores {
  hook: number;
  value: number;
  storyCompleteness: number;
  engagement: number;
}

/** A raw candidate exactly as the model proposed it (indices not yet refined). */
export interface RawCandidate {
  startWord: number;
  endWord: number;
  title: string;
  summary: string;
  reason: string;
  /** the model's overall 0–100, used only for dedupe ordering before refinement */
  modelScore: number;
  breakdown: ModelSubScores;
  /** which window proposed it (for failure accounting, not display) */
  windowIndex: number;
}

/** One row of a clip's score breakdown — always labelled by who produced it. */
export interface BreakdownRow {
  key: string;
  label: string;
  /** 0–100, or null when this row was not judged/measured */
  value: number | null;
  kind: "model" | "measured";
}

/**
 * A finished clip suggestion. `startMs`/`endMs` are the CUT times (nudged into
 * measured silence); `speechStartMs`/`speechEndMs` are the exact first/last word
 * edges — no word is ever inside the cut margin.
 */
export interface HighlightClip {
  id: string;
  startWord: number;
  endWord: number;
  startMs: number;
  endMs: number;
  speechStartMs: number;
  speechEndMs: number;
  durationMs: number;
  title: string;
  /** the verbatim first sentence of the clip (derived in code, never the model's claim) */
  hook: string;
  summary: string;
  reason: string;
  /** the Editorial Score — an estimate, labelled as such wherever it renders */
  score: number;
  breakdown: BreakdownRow[];
  rank: number;
  /** the clip's transcript text */
  text: string;
}

export type HighlightSource = "cloud" | "model" | "signals";

export interface HighlightRunResult {
  clips: HighlightClip[];
  /** which engine actually produced these clips — badged in the UI, never hidden */
  source: HighlightSource;
  /** true when a stronger source was asked for but a weaker one answered */
  fellBack: boolean;
  /** plain-language notes (dropped candidates, failed windows, truncation) */
  notes: string[];
  windowsTotal: number;
  windowsFailed: number;
  /** candidates the model proposed before post-processing */
  rawCandidates: number;
}

/** Real pipeline stage events — the analysis screen renders exactly these, nothing invented. */
export type HighlightStageEvent =
  | { type: "windows"; total: number }
  | { type: "window-done"; done: number; total: number; failed: number }
  | { type: "postprocess"; rawCandidates: number }
  | { type: "ranking" };
