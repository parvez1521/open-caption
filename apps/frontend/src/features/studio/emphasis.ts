/**
 * Auto-emphasis + keyword-emoji suggestions (Phase 5, addition A1).
 *
 * The user presses "Suggest emphasis" in the captions panel; the transcript is
 * sent through the SAME honest routing as every Phase-3 generator (cloud Groq
 * free AI first when configured, then the opt-in on-device model) with a
 * dedicated prompt whose output contract is a strict JSON array. Each parsed
 * item is bound to a REAL word of the current document — by the word's index
 * in the transcript, resolved here to its id and timing — so a suggestion can
 * never float free of the doc, and malformed items (unknown indices, echoed
 * text that does not match, bad actions, non-emoji "emoji") are dropped
 * item-by-item rather than applied partially-corrupt.
 *
 * Availability honesty (hard rule): there is NO template fallback for this
 * feature and no heuristic substitute. Template emphasis would be the
 * deterministic keyword engine dressing itself up as judgement, so when no
 * real AI route produces usable output the outcome is `unavailable` with a
 * plain reason, and the panel disables the action up front when no route is
 * configured at all. A batch that succeeds always names its source
 * ("cloud" | "model") for the existing SourceBadge.
 *
 * Nothing in this module mutates a document. `applyEmphasisSuggestions` is a
 * pure doc transform built ONLY from the existing caption ops
 * (setEmphasis / setWordEmoji in the caption engine); the panel passes it to
 * the studio's unified `edit()` exactly once, so accepting any number of
 * suggestions is exactly ONE undo step.
 */
import type { CaptionDoc } from "@capseasy/shared";
import { setEmphasis, setWordEmoji } from "@motion-ai/caption-engine/core";
import type { GenerationDeps, ModelRunner } from "../create/service";
import type { Source } from "../create/model";

/** What one suggestion asks for: "emphasise" -> strong, "supersize" -> hero (the key word), "emoji" -> a keyword emoji. */
export type EmphasisAction = "emphasise" | "supersize" | "emoji";

export interface EmphasisSuggestion {
  /** Stable per (word, action) so review checkboxes survive re-renders: `${wordId}:${action}`. */
  id: string;
  wordId: string;
  /** Index into doc.words at generation time — the reference the model used. */
  wordIndex: number;
  /** The doc word's own text and timing, copied from the doc (never from the model). */
  text: string;
  startMs: number;
  endMs: number;
  action: EmphasisAction;
  /** The suggested emoji character; only for action "emoji". */
  emoji?: string;
}

export type EmphasisOutcome =
  | {
      status: "ok";
      suggestions: EmphasisSuggestion[];
      /** Always a real AI route — "template" can never appear here. */
      source: Extract<Source, "cloud" | "model">;
      fellBack: boolean;
      note?: string;
    }
  | { status: "unavailable"; reason: string };

/** Caps so a runaway model cannot wallpaper the captions; excess items are dropped in order. */
export const EMPHASIS_LIMITS = { emphasise: 12, supersize: 3, emoji: 8 } as const;

export const EMPHASIS_NO_ROUTE_REASON =
  "No AI route is available for emphasis suggestions: the site's free AI is not configured and the on-device model is not enabled. This feature has no template or heuristic fallback, so it stays off — you can enable the on-device model in Creator Studio.";

const CLOUD_TO_LOCAL_NOTE =
  "The free AI service was not available for this batch, so the local model wrote these suggestions instead.";

/** True when at least one real AI route is configured — the panel disables the action otherwise. */
export function emphasisRouteAvailable(deps: GenerationDeps): boolean {
  return Boolean(deps.runCloud) || Boolean(deps.modelEnabled && deps.runModel);
}

// ---------------------------------------------------------------------------
// Prompt

const SYSTEM =
  "You analyse a caption transcript and suggest which spoken words should stand out on screen. Reply with ONLY a JSON array — no prose, no explanations, no code fences, nothing before or after the array.";

export function buildEmphasisPrompt(doc: CaptionDoc): { system: string; user: string } {
  const lines = doc.words.map((w, i) => `${i}: ${w.text}`);
  const user = [
    "From the numbered transcript below, choose:",
    `- up to ${EMPHASIS_LIMITS.emphasise} words to emphasise (important points, numbers, names) — action "emphasise"`,
    `- up to ${EMPHASIS_LIMITS.supersize} single most important words to supersize as the key word — action "supersize"`,
    `- up to ${EMPHASIS_LIMITS.emoji} words that pair naturally with one emoji (money, fire, love, time, ideas…) — action "emoji", with an "emoji" field holding exactly one emoji`,
    "Output format, one object per suggestion:",
    '[{"index": 4, "word": "money", "action": "emoji", "emoji": "💰"}, {"index": 9, "word": "never", "action": "supersize"}]',
    'Rules: "index" is the transcript number of the word and "word" repeats that word exactly as written. Use each word at most once per action. If nothing deserves emphasis, output [].',
    "",
    "Transcript:",
    ...lines,
  ].join("\n");
  return { system: SYSTEM, user };
}

// ---------------------------------------------------------------------------
// Parsing — strict, item-by-item

const ACTIONS: ReadonlySet<string> = new Set(["emphasise", "supersize", "emoji"]);

const normWord = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** A plausible single emoji: short, no letters/digits/whitespace (pictographs, flags and ZWJ sequences pass). */
function isPlausibleEmoji(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const e = raw.trim();
  if (e.length === 0 || e.length > 16) return false;
  if (/[\p{L}\p{N}\s]/u.test(e)) return false;
  return true;
}

/**
 * Parse raw model output into suggestions bound to `doc`'s words.
 * Returns null when the output is not a JSON array at all (a runner failure —
 * routing moves on). A valid array parses item-by-item: every malformed item
 * is dropped on its own, so `[]` (and an array of only-bad items) is a
 * successful, empty result — "no suggestions", not an error.
 */
export function parseEmphasisOutput(raw: string, doc: CaptionDoc): EmphasisSuggestion[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const counts: Record<EmphasisAction, number> = { emphasise: 0, supersize: 0, emoji: 0 };
  const seen = new Set<string>();
  const out: EmphasisSuggestion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { index, action, word, emoji } = item as { index?: unknown; action?: unknown; word?: unknown; emoji?: unknown };
    if (typeof action !== "string" || !ACTIONS.has(action)) continue;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= doc.words.length) continue;
    const w = doc.words[index]!;
    if (w.hidden) continue;
    // when the model echoes the word, it must be the word actually at that index — a mismatch
    // means the model's numbering drifted, so this item cannot be trusted to point where it claims
    if (typeof word === "string" && word.trim() && normWord(word) !== normWord(w.text)) continue;
    const act = action as EmphasisAction;
    if (act === "emoji" && !isPlausibleEmoji(emoji)) continue;
    const key = `${w.id}:${act}`;
    if (seen.has(key)) continue;
    // one emphasis level per word: supersize outranks emphasise, whichever order they arrive in
    if (act === "emphasise" && seen.has(`${w.id}:supersize`)) continue;
    if (act === "supersize") {
      const prior = out.findIndex((s) => s.wordId === w.id && s.action === "emphasise");
      if (prior >= 0) {
        out.splice(prior, 1);
        counts.emphasise -= 1;
        seen.delete(`${w.id}:emphasise`);
      }
    }
    if (counts[act] >= EMPHASIS_LIMITS[act]) continue;
    seen.add(key);
    counts[act] += 1;
    out.push({
      id: key,
      wordId: w.id,
      wordIndex: index,
      text: w.text,
      startMs: w.startMs,
      endMs: w.endMs,
      action: act,
      ...(act === "emoji" ? { emoji: (emoji as string).trim() } : {}),
    });
  }
  return out.sort((a, b) => a.wordIndex - b.wordIndex);
}

// ---------------------------------------------------------------------------
// Routing — same shape as generateContent / generateScriptContent, minus the
// template floor: a failed route is an unavailable feature, never a fake batch.

async function tryRunner(runner: ModelRunner, doc: CaptionDoc): Promise<EmphasisSuggestion[] | null> {
  try {
    const raw = await runner(buildEmphasisPrompt(doc));
    return parseEmphasisOutput(raw, doc);
  } catch {
    return null;
  }
}

export async function generateEmphasisSuggestions(
  doc: CaptionDoc,
  deps: GenerationDeps,
): Promise<EmphasisOutcome> {
  if (!doc.words.some((w) => !w.hidden)) {
    return { status: "unavailable", reason: "There are no caption words to suggest emphasis for yet." };
  }
  if (!emphasisRouteAvailable(deps)) {
    return { status: "unavailable", reason: EMPHASIS_NO_ROUTE_REASON };
  }
  let cloudFailed = false;
  if (deps.runCloud) {
    const suggestions = await tryRunner(deps.runCloud, doc);
    if (suggestions) return { status: "ok", suggestions, source: "cloud", fellBack: false };
    cloudFailed = true;
  }
  if (deps.modelEnabled && deps.runModel) {
    const suggestions = await tryRunner(deps.runModel, doc);
    if (suggestions) {
      return cloudFailed
        ? { status: "ok", suggestions, source: "model", fellBack: true, note: CLOUD_TO_LOCAL_NOTE }
        : { status: "ok", suggestions, source: "model", fellBack: false };
    }
    return {
      status: "unavailable",
      reason: cloudFailed
        ? "The free AI service and the local model were both unavailable for this batch. Emphasis suggestions have no template fallback, so none are shown — try again in a moment."
        : "The local model did not return usable suggestions for this batch. Emphasis suggestions have no template fallback, so none are shown.",
    };
  }
  return {
    status: "unavailable",
    reason:
      "The free AI service was not available for this batch. Emphasis suggestions have no template fallback, so none are shown — try again in a moment.",
  };
}

// ---------------------------------------------------------------------------
// Applying — existing ops only

/**
 * Apply the accepted suggestions to the doc through the existing caption ops
 * (setEmphasis: emphasise -> "strong", supersize -> "hero"; setWordEmoji with
 * the auto-emoji default position "above"). Suggestions whose word has gone,
 * or that the doc already satisfies, are skipped; when nothing applies the
 * SAME doc reference comes back, so the caller's edit() records no undo step.
 */
export function applyEmphasisSuggestions(doc: CaptionDoc, suggestions: readonly EmphasisSuggestion[]): CaptionDoc {
  let next = doc;
  for (const s of suggestions) {
    const w = next.words.find((x) => x.id === s.wordId);
    if (!w) continue;
    if (s.action === "emoji") {
      if (!s.emoji || w.emoji?.char === s.emoji) continue;
      next = setWordEmoji(next, s.wordId, { char: s.emoji, position: "above" });
    } else {
      const target = s.action === "supersize" ? "hero" : "strong";
      if (w.emphasis === target) continue;
      // a supersize the user accepted outranks an emphasise accepted in the same batch
      if (s.action === "emphasise" && suggestions.some((o) => o.wordId === s.wordId && o.action === "supersize")) continue;
      next = setEmphasis(next, s.wordId, target);
    }
  }
  return next;
}
