import { CaptionDocSchema, type CaptionDoc, type ProjectSettings, type TranslationModel, type Word } from "@capseasy/shared";
import { derivePages } from "./derive";

/**
 * Caption translation (slice 5.1): turn a caption doc into a SECOND, real CaptionDoc in another
 * language, using on-device OPUS-MT (the worker lives in the frontend's features/translate; this
 * module is the pure, testable core — text in, doc out).
 *
 * The translation unit is the derived caption CARD (page): the model sees one card's text at a
 * time, so word order/context stay card-local, and each translated card inherits its source
 * card's exact time window. Card boundaries are mirrored into the translated doc's
 * `manualBreaks`, so deriving pages from the translated doc reproduces the same card structure.
 *
 * HONEST TIMINGS: OPUS-MT returns text only — it has no word timings. The translated doc's
 * per-word timings are therefore DERIVED: each translated word gets a slice of its card's
 * window, proportional to its character length. That derivation is recorded in the doc itself
 * (`meta.translatedFrom.derivedWordTimings = true`) — these are never measured/ASR timings.
 */

export interface TranslationUnit {
  /** index of the source card (page) this unit came from */
  index: number;
  /** the card's text as the audience reads it (words joined with single spaces) */
  text: string;
  startMs: number;
  endMs: number;
}

/** The cards of the source doc, as translation units. Empty-text cards never reach the model. */
export function translationUnits(doc: CaptionDoc, settings: ProjectSettings): TranslationUnit[] {
  return derivePages(doc, settings)
    .map((p, index) => ({
      index,
      text: p.words.map((w) => w.text.trim()).filter(Boolean).join(" "),
      startMs: p.startMs,
      endMs: p.endMs,
    }))
    .filter((u) => u.text.length > 0);
}

/**
 * Split one translated card's text into words with proportional timings inside [startMs, endMs]:
 * each word's share is its character length over the card's total (spaces excluded), with a 1 ms
 * minimum per word and the last word ending exactly at endMs. See the header: DERIVED, not measured.
 */
function splitCardWords(text: string, startMs: number, endMs: number, unitIndex: number): Word[] {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const totalChars = parts.reduce((n, p) => n + p.length, 0) || 1;
  const span = Math.max(parts.length, endMs - startMs);
  const words: Word[] = [];
  let cursor = startMs;
  parts.forEach((part, i) => {
    const last = i === parts.length - 1;
    const end = last ? startMs + span : Math.min(startMs + span - (parts.length - 1 - i), cursor + Math.max(1, Math.round((span * part.length) / totalChars)));
    words.push({ id: `mt-${unitIndex}-${i}`, text: part, startMs: Math.round(cursor), endMs: Math.round(end) });
    cursor = end;
  });
  return words;
}

/**
 * Build the translated CaptionDoc. `translations[i]` is the model's output for `units[i]` —
 * the two arrays MUST line up (same length, same order); a mismatch is a programming error and
 * throws rather than producing a silently misaligned track. A unit whose translation comes back
 * empty contributes no words (its card simply has no translated line).
 */
export function buildTranslatedDoc(
  source: CaptionDoc,
  units: TranslationUnit[],
  translations: string[],
  model: TranslationModel,
): CaptionDoc {
  if (translations.length !== units.length) {
    throw new Error(`translation count mismatch: ${translations.length} outputs for ${units.length} units`);
  }
  const words: Word[] = [];
  const manualBreaks: string[] = [];
  units.forEach((u, i) => {
    const cardWords = splitCardWords(translations[i] ?? "", u.startMs, u.endMs, u.index);
    if (cardWords.length === 0) return;
    if (words.length > 0) manualBreaks.push(cardWords[0]!.id);
    words.push(...cardWords);
  });
  return CaptionDocSchema.parse({
    version: 2,
    language: model.targetLang,
    direction: "ltr",
    words,
    manualBreaks,
    noBreakAfter: [],
    cards: {},
    meta: {
      userEdited: false,
      translatedFrom: {
        sourceLanguage: source.language,
        modelId: model.modelId,
        modelRevision: model.revision,
        derivedWordTimings: true as const,
      },
    },
  });
}
