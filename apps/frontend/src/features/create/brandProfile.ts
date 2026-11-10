/**
 * Brand Voice profiles: shared types, the defensive normaliser, and the client
 * helpers for /api/v1/brand/profiles.
 *
 * Storage is the existing brand_kits table (one row per profile): a profile is the
 * old brand kit — colours + preferred font — plus a `voice` jsonb object and an
 * `is_active` flag. Exactly one profile per user is active; the Creator Studio
 * generators read only the active one, via `profilePromptBlock` below.
 *
 * Until the migration that adds `voice` / `is_active` is applied to the live
 * database, the list route degrades honestly: it returns the legacy kits as
 * profiles with an empty voice and `voiceReady: false`, and writes are refused
 * server-side with a plain "database update is pending" message. Nothing in this
 * module pretends a voice exists when the server says it does not.
 */
import { apiClient } from "@/services/api-client";

/** How a creator writes. Every field is free text the user typed (or did not). */
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

/** One brand profile: the voice plus the kit visuals it sits alongside. */
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

// Caps mirror the API validation (brand profiles route): a stored voice can never
// be bigger than what the route would accept, whoever wrote it.
const MAX_VOICE_STRING = 500;
const MAX_VOICE_ITEMS = 30;
const MAX_VOICE_ITEM = 120;

const asVoiceString = (value: unknown): string => (typeof value === "string" ? value.slice(0, MAX_VOICE_STRING) : "");

const asVoiceList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, MAX_VOICE_ITEM))
        .filter((item) => item.length > 0)
        .slice(0, MAX_VOICE_ITEMS)
    : [];

/**
 * Turn untrusted jsonb (a database row, an import, an old shape) into a BrandVoice.
 * Non-strings become "", arrays keep only their string items, everything is capped.
 * Always returns fresh arrays so two normalised voices never share a list.
 */
export function normalizeVoice(raw: unknown): BrandVoice {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_VOICE, wordsToUse: [], wordsToAvoid: [], sampleCaptions: [], preferredCtas: [] };
  const v = raw as Record<string, unknown>;
  return {
    niche: asVoiceString(v.niche),
    audience: asVoiceString(v.audience),
    language: asVoiceString(v.language),
    tone: asVoiceString(v.tone),
    writingStyle: asVoiceString(v.writingStyle),
    wordsToUse: asVoiceList(v.wordsToUse),
    wordsToAvoid: asVoiceList(v.wordsToAvoid),
    sampleCaptions: asVoiceList(v.sampleCaptions),
    preferredCtas: asVoiceList(v.preferredCtas),
  };
}

const listLine = (items: string[]): string => items.map((item) => item.trim()).filter(Boolean).join(", ");

/**
 * The compact plain-text block handed to a model prompt so generated content
 * sounds like this creator. Only fields the user actually filled in are stated;
 * avoided words are called out as a hard rule, and at most two sample captions
 * ride along as style examples. A profile with an empty voice returns "" so the
 * caller can omit the block entirely instead of sending a hollow heading.
 */
export function profilePromptBlock(p: BrandProfile): string {
  const voice = normalizeVoice(p?.voice);
  const lines: string[] = [];
  if (voice.niche.trim()) lines.push(`Niche: ${voice.niche.trim()}`);
  if (voice.audience.trim()) lines.push(`Audience: ${voice.audience.trim()}`);
  if (voice.language.trim()) lines.push(`Language: ${voice.language.trim()}`);
  if (voice.tone.trim()) lines.push(`Tone: ${voice.tone.trim()}`);
  if (voice.writingStyle.trim()) lines.push(`Writing style: ${voice.writingStyle.trim()}`);
  const use = listLine(voice.wordsToUse);
  if (use) lines.push(`Words to use: ${use}`);
  const avoid = listLine(voice.wordsToAvoid);
  if (avoid) lines.push(`Words to AVOID — never use these words or phrases: ${avoid}`);
  const ctas = listLine(voice.preferredCtas);
  if (ctas) lines.push(`Preferred calls to action: ${ctas}`);
  const samples = voice.sampleCaptions.map((s) => s.trim()).filter(Boolean).slice(0, 2);
  if (samples.length) {
    lines.push("Sample captions (style examples — match this voice, do not copy them):");
    for (const sample of samples) lines.push(`- ${sample}`);
  }
  if (!lines.length) return "";
  return ["Brand voice:", ...lines].join("\n");
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when `text` uses one of the voice's avoided words or phrases. Matching is
 * whole-word and case-insensitive: "sale" does not fire on "wholesale", a phrase
 * like "cheap tricks" matches as a phrase (any whitespace run between words), and
 * regex specials inside a word ("c++", "100%") are treated as literal characters.
 */
export function containsAvoidedWord(text: string, voice: BrandVoice): boolean {
  if (!text) return false;
  for (const raw of voice?.wordsToAvoid ?? []) {
    const phrase = typeof raw === "string" ? raw.trim() : "";
    if (!phrase) continue;
    const pattern = phrase.split(/\s+/).map(escapeRegExp).join("\\s+");
    if (new RegExp(`(?<![A-Za-z0-9_])${pattern}(?![A-Za-z0-9_])`, "i").test(text)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Client helpers for /api/v1/brand/profiles (authenticated via apiClient,
// the same route cloudAi.ts uses). The server owns the row shape; these just
// carry it.
// ---------------------------------------------------------------------------

export interface BrandProfilesResult {
  profiles: BrandProfile[];
  activeId: string | null;
  /** False until the voice columns exist on the server — profiles then carry an empty voice. */
  voiceReady: boolean;
}

export interface CreateBrandProfileInput {
  name: string;
  colors?: string[];
  fontId?: string | null;
  voice?: Partial<BrandVoice>;
  makeActive?: boolean;
}

export interface UpdateBrandProfileInput {
  name?: string;
  colors?: string[];
  fontId?: string | null;
  voice?: Partial<BrandVoice>;
}

export function fetchBrandProfiles(): Promise<BrandProfilesResult> {
  return apiClient.get<BrandProfilesResult>("/brand/profiles");
}

export function createBrandProfile(input: CreateBrandProfileInput): Promise<BrandProfile> {
  return apiClient.post<BrandProfile>("/brand/profiles", { json: input });
}

export function updateBrandProfile(id: string, input: UpdateBrandProfileInput): Promise<BrandProfile> {
  return apiClient.put<BrandProfile>(`/brand/profiles/${id}`, { json: input });
}

export function deleteBrandProfile(id: string): Promise<{ deleted: true }> {
  return apiClient.delete<{ deleted: true }>(`/brand/profiles/${id}`);
}

export function activateBrandProfile(id: string): Promise<{ activeId: string }> {
  return apiClient.post<{ activeId: string }>(`/brand/profiles/${id}/activate`);
}
