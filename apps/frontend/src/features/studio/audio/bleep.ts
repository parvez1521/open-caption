/**
 * Bleep profanity matching (Phase 5, A6).
 *
 * PROVENANCE: the wordlist below was authored in-repo for this product, by hand,
 * for this feature. It is not copied from any external list, dataset or package,
 * no third-party asset is bundled, and it carries no licence encumbrance. It is
 * deliberately SMALL — the common strong profanity a creator typically wants
 * bleeped — because matching is exact whole-word: a bigger list would mostly add
 * false positives, and this feature's honest limit (stated in the UI) is that it
 * "matches listed words in the transcript; can miss slang or mis-transcribed
 * words".
 *
 * Matching is normalised (case- and punctuation-insensitive, whole-word) against
 * the caption document's words. This module only FINDS matches — nothing here
 * alters audio. A match becomes a bleep only after the user approves it in the
 * review UI, at which point audioOps stores an AudioBleep mix param.
 */

/**
 * The profanity terms, in normalised form (see {@link normalizeWordText}):
 * English core terms, common Hindi/Hinglish profanity in Roman script, and the
 * same register in Devanagari script. Variants (fuck / fucking / fucked) are
 * listed separately because matching is whole-word, never substring — "class"
 * must never match, and neither must "shitake".
 */
export const PROFANITY_TERMS: readonly string[] = [
  // English core
  "fuck", "fucks", "fucked", "fucking", "fucker", "motherfucker", "motherfucking",
  "shit", "shits", "shitty", "bullshit",
  "bitch", "bitches", "bitching",
  "asshole", "assholes", "bastard", "bastards",
  "dick", "dicks", "cock", "cocks", "pussy",
  "whore", "whores", "slut", "sluts",
  "cunt", "cunts", "nigger", "nigga", "faggot",
  "damn", "damned", "goddamn",
  // Hindi / Hinglish profanity, Roman script
  "chutiya", "chutiye", "madarchod", "behenchod", "bhenchod",
  "bhosdike", "bhosdi", "gaand", "gaandu", "gandu",
  "randi", "harami", "haraami", "haramkhor",
  "chut", "lund", "lavda", "lawda", "jhaant", "jhant",
  "kamina", "kamine", "saala", "saale",
  // Hindi profanity, Devanagari script
  "चूतिया", "चूतिये", "मादरचोद", "बहनचोद", "भोसड़ीके", "भोसड़ी",
  "गांड", "गांडू", "रंडी", "हरामी", "हरामखोर",
  "चूत", "लंड", "लवडा", "झांट", "कमीना", "साला", "साले",
];

const TERM_SET: ReadonlySet<string> = new Set(PROFANITY_TERMS);

/**
 * Normalise one token for matching: NFC (so Devanagari combining signs compose
 * consistently), lower-cased, with every character that is not a letter, number
 * or combining mark removed (punctuation, quotes, emoji, the Devanagari danda).
 * Devanagari vowel signs are combining marks (\p{M}) and are KEPT — stripping
 * them would mangle the words.
 */
export function normalizeWordText(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, "");
}

/** The minimal word shape matching reads — the caption doc's `Word` satisfies it. */
export interface BleepWordInput {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
}

/** One listed-word occurrence in the transcript, in document order. */
export interface ProfanityMatch {
  wordId: string;
  /** the word exactly as transcribed (for the review list) */
  wordText: string;
  /** its normalised form (the list term it matched) */
  normalized: string;
  startMs: number;
  endMs: number;
}

/**
 * Find every whole-word profanity match in a caption word list. A word whose
 * text contains several tokens (rare — caption words are single tokens) is
 * checked token by token. Pure and order-preserving; hidden words are included
 * (a hidden word is still spoken in the audio).
 */
export function findProfanityMatches(
  words: readonly BleepWordInput[],
  terms: readonly string[] = PROFANITY_TERMS,
): ProfanityMatch[] {
  const set = terms === PROFANITY_TERMS ? TERM_SET : new Set(terms);
  const out: ProfanityMatch[] = [];
  for (const w of words) {
    if (!(w.endMs > w.startMs)) continue;
    const tokens = w.text.split(/\s+/);
    for (const token of tokens) {
      const normalized = normalizeWordText(token);
      if (normalized && set.has(normalized)) {
        out.push({ wordId: w.id, wordText: w.text, normalized, startMs: w.startMs, endMs: w.endMs });
        break; // one match per caption word is enough — the whole word is bleeped
      }
    }
  }
  return out;
}

/**
 * The bleep ranges for the matches the user APPROVED (by wordId), and only
 * those. This is the approval gate in pure form: an unapproved match produces
 * no range, ever, so it can never reach the mix. Overlapping or touching
 * ranges (two listed words back to back) merge into one range so the tone
 * does not stutter. Ranges carry the default tone params; audioOps clamps
 * them to the schema ranges when storing.
 */
export function approvedBleepRanges(
  matches: readonly ProfanityMatch[],
  approvedWordIds: ReadonlySet<string>,
): { startMs: number; endMs: number; wordText: string }[] {
  const approved = matches
    .filter((m) => approvedWordIds.has(m.wordId))
    .map((m) => ({ startMs: Math.round(m.startMs), endMs: Math.round(m.endMs), wordText: m.wordText }))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: { startMs: number; endMs: number; wordText: string }[] = [];
  for (const r of approved) {
    const last = merged[merged.length - 1];
    if (last && r.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, r.endMs);
      if (!last.wordText.includes(r.wordText)) last.wordText = `${last.wordText} ${r.wordText}`;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}
