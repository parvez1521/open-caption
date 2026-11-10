/**
 * Brand Voice profile: the shared contract every Creator Studio generator consumes.
 *
 * This module is pure (no DOM, no storage, no network): it only describes the profile shape,
 * coerces untrusted data into that shape, renders the profile as a prompt block for model
 * runners, and answers whether a piece of text uses a word or phrase the profile says to avoid.
 * Persistence, CRUD and the profile UI live elsewhere; generators receive a BrandProfile value
 * and use the helpers here.
 */

export interface BrandVoice {
  niche: string;
  audience: string;
  language: string;
  tone: string;
  writingStyle: string;
  wordsToUse: string[];
  wordsToAvoid: string[];
  sampleCaptions: string[];
  preferredCtas: string[];
}

export interface BrandProfile {
  id: string;
  name: string;
  isActive: boolean;
  colors: string[];
  fontId: string | null;
  voice: BrandVoice;
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_VOICE: BrandVoice = {
  niche: "",
  audience: "",
  language: "",
  tone: "",
  writingStyle: "",
  wordsToUse: [],
  wordsToAvoid: [],
  sampleCaptions: [],
  preferredCtas: [],
};

export function normalizeVoice(raw: unknown): BrandVoice {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      niche: "",
      audience: "",
      language: "",
      tone: "",
      writingStyle: "",
      wordsToUse: [],
      wordsToAvoid: [],
      sampleCaptions: [],
      preferredCtas: [],
    };
  }
  const record = raw as Record<string, unknown>;
  const asString = (value: unknown): string => (typeof value === "string" ? value : "");
  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter((v) => v.length > 0)
      : [];
  return {
    niche: asString(record.niche),
    audience: asString(record.audience),
    language: asString(record.language),
    tone: asString(record.tone),
    writingStyle: asString(record.writingStyle),
    wordsToUse: asStringArray(record.wordsToUse),
    wordsToAvoid: asStringArray(record.wordsToAvoid),
    sampleCaptions: asStringArray(record.sampleCaptions),
    preferredCtas: asStringArray(record.preferredCtas),
  };
}

export function profilePromptBlock(p: BrandProfile): string {
  const voice = normalizeVoice(p?.voice);
  const lines: string[] = [];
  if (voice.niche.trim()) lines.push(`- Niche: ${voice.niche.trim()}`);
  if (voice.audience.trim()) lines.push(`- Audience: ${voice.audience.trim()}`);
  if (voice.language.trim()) lines.push(`- Language: ${voice.language.trim()}`);
  if (voice.tone.trim()) lines.push(`- Tone: ${voice.tone.trim()}`);
  if (voice.writingStyle.trim()) lines.push(`- Writing style: ${voice.writingStyle.trim()}`);
  if (voice.wordsToUse.length) lines.push(`- Words to use: ${voice.wordsToUse.join(", ")}`);
  if (voice.wordsToAvoid.length)
    lines.push(`- AVOID — never use these words or phrases: ${voice.wordsToAvoid.join(", ")}`);
  if (voice.sampleCaptions.length)
    lines.push(`- Sample captions (match this style): ${voice.sampleCaptions.map((s) => `"${s}"`).join(" ")}`);
  if (voice.preferredCtas.length) lines.push(`- Preferred CTAs: ${voice.preferredCtas.join(", ")}`);
  if (!lines.length) return "";
  return `Brand voice — follow this profile:\n${lines.join("\n")}`;
}

export function containsAvoidedWord(text: string, voice: BrandVoice): boolean {
  if (!text || !voice?.wordsToAvoid?.length) return false;
  for (const raw of voice.wordsToAvoid) {
    const phrase = typeof raw === "string" ? raw.trim() : "";
    if (!phrase) continue;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) return true;
  }
  return false;
}
