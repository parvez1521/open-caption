/**
 * The highlight prompt: an editorial rubric + a strict output contract.
 *
 * The rubric's criteria order (hook → self-containment → payoff → quotability)
 * and its discipline (harsh scoring across the whole range; returning nothing
 * is a correct answer) are adapted from AutoClip's published highlight prompt —
 * methodology, rewritten for this product: the model's answer is word indices
 * and editorial judgments only. Scores it returns are EDITORIAL estimates; the
 * product labels them exactly that, everywhere they appear.
 */
import { rubricFor } from "./rubrics";
import type { ContentTypeId, HighlightRequest } from "./types";

/** Candidates asked per window — headroom so dedupe/selection can choose (the 2× rule, per window). */
export const MAX_CANDIDATES_PER_WINDOW = 6;

export function buildHighlightPrompt(input: {
  contentType: ContentTypeId;
  request: Pick<HighlightRequest, "minSec" | "maxSec">;
  windowText: string;
  /** word-index range this window covers, for the contract line */
  firstWord: number;
  lastWord: number;
  /** ranges (word indices) already chosen in this run — used by Regenerate */
  avoid?: readonly { startWord: number; endWord: number }[];
}): { system: string; user: string } {
  const rubric = rubricFor(input.contentType);
  const system = [
    "You are a short-form video editor. You find the moments in a long transcript that hold a stranger's attention as standalone clips.",
    "You will be given a section of a transcript. Every word is tagged with its index as [index]word. You return the spans worth cutting into standalone clips, by word index only — never estimate seconds; the indices are the only timing signal you provide.",
    "Reply with ONLY the JSON object described — no prose, no markdown fences.",
  ].join("\n");

  const avoidLine = input.avoid?.length
    ? `\nAlready chosen in this run (do NOT propose spans overlapping these word ranges): ${input.avoid
        .map((a) => `${a.startWord}–${a.endWord}`)
        .join(", ")}.`
    : "";

  const user = [
    "## What makes a clip work",
    "Judge every candidate against four things, in this order:",
    "1. Hook strength. The first three seconds decide everything. A clip opens on a line that creates a question, states something contrarian, names a specific number, or drops the listener into tension. It must NOT open on “so”, “yeah”, “um”, “and then”, a topic change, or the tail of an answer to a question the viewer never heard.",
    "2. Self-containment. A viewer with zero context fully understands it. No unexplained pronouns pointing outside the clip, no “like I mentioned”, no punchline whose setup is outside the span.",
    "3. Payoff. Something lands — a conclusion, a reversal, concrete advice, a genuine emotional beat, a number that reframes the topic. If you cannot name what the viewer walks away with, the score is below 50.",
    "4. Quotability. The best clips contain one sentence a person would repeat or screenshot.",
    "",
    `## This video: ${rubric.label}`,
    rubric.guidance,
    "",
    "## Boundaries",
    `Start on the first word of a complete thought; end on the last word of a complete thought — ideally the strongest line, not the trailing qualification after it. Never start or end mid-sentence. Keep every clip between ${input.request.minSec} and ${input.request.maxSec} seconds of speech (estimate length from the words: roughly 2.5 words per second). Do not pad a short moment to reach a length, and do not merge two unrelated moments into one clip.`,
    "",
    "## Scoring",
    "Score 0–100 per candidate, and per aspect in score_breakdown (hook, value, story_completeness, engagement). Be harsh and use the whole range — a flat set of scores in the 80s is useless for ranking. 85–100: strong hook, complete arc, one quotable line. 70–84: solid, real payoff. 50–69: watchable but unremarkable. Below 50: do not return it at all.",
    `Return at most ${MAX_CANDIDATES_PER_WINDOW} candidates for this section. A section with two good moments returns two, not six. Most sections of most videos contain nothing worth clipping — an empty list is a correct answer.`,
    "",
    "## Output",
    `{"clips": [{"start_word_index": ${input.firstWord}, "end_word_index": ${input.firstWord + 40}, "title": "string — how an editor would label this clip in a folder: specific, concrete, under 60 characters, not clickbait", "summary": "one sentence: what this clip is about", "reason": "one sentence: why this moment was selected, naming the hook and the payoff", "score": 87, "score_breakdown": {"hook": 90, "value": 92, "story_completeness": 95, "engagement": 87}}]}`,
    `start_word_index and end_word_index must be indices that appear in the section below (between ${input.firstWord} and ${input.lastWord}).${avoidLine}`,
    "",
    "## Transcript section",
    input.windowText,
  ].join("\n");

  return { system, user };
}
