/**
 * Brand Kit page: the pure form logic, kept out of the page component so it can be
 * unit-tested without rendering the dashboard (services, router, react-query).
 *
 * The page edits one selected brand profile: its name, its visual kit (colours +
 * font) and its voice. Voice list fields (words to use, sample captions, …) are
 * edited as one-per-line text and parsed back with `parseLineList` on save.
 */
import {
  EMPTY_VOICE,
  normalizeVoice,
  type BrandProfile,
  type BrandVoice,
  type UpdateBrandProfileInput,
} from "@/features/create/brandProfile";

/** The editable state of the Brand Kit form for one profile. */
export interface BrandKitForm {
  name: string;
  colors: string[];
  fontId: string | null;
  niche: string;
  audience: string;
  language: string;
  tone: string;
  writingStyle: string;
  /** One-per-line text for the voice's `wordsToUse` list. */
  wordsToUseText: string;
  /** One-per-line text for the voice's `wordsToAvoid` list. */
  wordsToAvoidText: string;
  /** One-per-line text for the voice's `sampleCaptions` list. */
  sampleCaptionsText: string;
  /** One-per-line text for the voice's `preferredCtas` list. */
  preferredCtasText: string;
}

export const EMPTY_BRAND_KIT_FORM: BrandKitForm = {
  name: "",
  colors: [],
  fontId: null,
  niche: "",
  audience: "",
  language: "",
  tone: "",
  writingStyle: "",
  wordsToUseText: "",
  wordsToAvoidText: "",
  sampleCaptionsText: "",
  preferredCtasText: "",
};

/**
 * Parse a one-per-line textarea value into a list: split on newlines, trim each
 * line, drop empties, and drop exact duplicates (keeping the first occurrence,
 * in order).
 */
export function parseLineList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of (text ?? "").split(/\r?\n/)) {
    const item = line.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/** Render a stored list back into one-per-line textarea text. */
export function listToLines(items: string[]): string {
  return (items ?? []).map((item) => item.trim()).filter(Boolean).join("\n");
}

/** Build the editable form state from a stored profile (voice lists become text). */
export function formFromProfile(profile: BrandProfile): BrandKitForm {
  const voice = normalizeVoice(profile.voice);
  return {
    name: profile.name ?? "",
    colors: [...(profile.colors ?? [])],
    fontId: profile.fontId ?? null,
    niche: voice.niche,
    audience: voice.audience,
    language: voice.language,
    tone: voice.tone,
    writingStyle: voice.writingStyle,
    wordsToUseText: listToLines(voice.wordsToUse),
    wordsToAvoidText: listToLines(voice.wordsToAvoid),
    sampleCaptionsText: listToLines(voice.sampleCaptions),
    preferredCtasText: listToLines(voice.preferredCtas),
  };
}

/** The voice a form currently describes (textarea lists parsed one-per-line). */
export function voiceFromForm(form: BrandKitForm): BrandVoice {
  return {
    ...EMPTY_VOICE,
    niche: form.niche,
    audience: form.audience,
    language: form.language,
    tone: form.tone,
    writingStyle: form.writingStyle,
    wordsToUse: parseLineList(form.wordsToUseText),
    wordsToAvoid: parseLineList(form.wordsToAvoidText),
    sampleCaptions: parseLineList(form.sampleCaptionsText),
    preferredCtas: parseLineList(form.preferredCtasText),
  };
}

/** The update payload for the selected profile's Save button. */
export function updateInputFromForm(form: BrandKitForm): UpdateBrandProfileInput {
  return {
    name: form.name,
    colors: [...form.colors],
    fontId: form.fontId,
    voice: voiceFromForm(form),
  };
}

/**
 * Which mode the page runs in. `voiceReady: true` from the profiles route means
 * full profile editing; `false` is the degraded mode — the server cannot store
 * voices yet, so the page falls back to the legacy colours/font kit behaviour.
 */
export type BrandKitMode = "voice" | "legacy";

export function brandKitMode(voiceReady: boolean): BrandKitMode {
  return voiceReady ? "voice" : "legacy";
}
