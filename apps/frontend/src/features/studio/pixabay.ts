import type { AssetLicenceRecord } from "./mediaAssets";

/**
 * Pixabay browse-import (Phase 8, A10b) — the client half.
 *
 * THE KEY DEAL, stated plainly because the UI repeats it: Pixabay's API needs
 * a free API key and this app has none of its own. The user pastes THEIR OWN
 * key; it is stored in this browser's localStorage only (the same on-device
 * preference pattern as features/transcribe/runtime.ts), and it is only ever
 * sent to api.pixabay.com — every request this module builds is asserted to
 * target that host, and the key never appears in any other payload (there is
 * no server round-trip in this feature at all: search and download both run
 * client-side, and imports land in the on-device media bin).
 *
 * API SHAPE: built against Pixabay's documented audio search API
 * (GET https://api.pixabay.com/api/audio/?key=…&q=…&audio_type=music|sound_effects,
 * response `{ total, totalHits, hits: [...] }`). Live verification from the
 * build sandbox was NOT possible — pixabay.com is blocked for the doc fetch
 * and api.pixabay.com returns an empty reply through the sandbox egress — so
 * the parser is deliberately tolerant about which of the documented URL
 * fields a hit carries, and ALL network access sits behind an injectable
 * fetch seam that the tests drive with fixtures of the documented shape.
 *
 * CONTENT-ID EVIDENCE: the documented audio response has NO Content-ID /
 * registered-track field (web track pages show a shield badge; the API does
 * not expose it). The parser therefore looks for a marker under several
 * plausible field names and reports `contentIdRegistered: null` — UNKNOWN —
 * when none is present, which is the expected case today. Unknown is never
 * presented as "clear": the import confirmation always carries the standing
 * note (PIXABAY_CONTENT_ID_NOTE). If Pixabay ever adds the field, a hit that
 * carries it gets the stronger per-track warning (contentIdWarningFor).
 */

export const PIXABAY_API_BASE = "https://api.pixabay.com/api/audio/";
export const PIXABAY_API_HOST = "api.pixabay.com";
/** Where the surface sends a keyless user: Pixabay's own API page (the key itself lives in the user's Pixabay profile). */
export const PIXABAY_API_PAGE = "https://pixabay.com/api/docs/";
export const PIXABAY_LICENCE_NAME = "Pixabay Content License";
export const PIXABAY_LICENCE_SUMMARY_URL = "https://pixabay.com/service/license-summary/";

export const PIXABAY_CONTENT_ID_NOTE =
  "Some Pixabay tracks are registered with Content ID systems. The Pixabay API does not say which ones, so check the track's Pixabay page (linked with each result) before you publish — a registered track can still be used, but your video may get a claim or need the licence proof Pixabay offers on that page.";
export const PIXABAY_USE_NOTE =
  "Pixabay tracks are licensed for use inside your projects. They are not licensed for standalone redistribution — don't re-upload or share the track on its own.";

/* ------------------------------------------------------------------ */
/* the user's own key — device-only storage                            */
/* ------------------------------------------------------------------ */

export const PIXABAY_KEY_STORAGE_KEY = "ce:pixabay-api-key";

export interface KeyValueStorage {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function savedPixabayKey(storage: KeyValueStorage | null = defaultStorage()): string | null {
  if (!storage) return null;
  try {
    const v = storage.getItem(PIXABAY_KEY_STORAGE_KEY)?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

export function savePixabayKey(key: string, storage: KeyValueStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    const v = key.trim();
    if (v) storage.setItem(PIXABAY_KEY_STORAGE_KEY, v);
    else storage.removeItem(PIXABAY_KEY_STORAGE_KEY);
  } catch { /* private mode — the key simply won't persist */ }
}

export function clearPixabayKey(storage: KeyValueStorage | null = defaultStorage()): void {
  if (!storage) return;
  try { storage.removeItem(PIXABAY_KEY_STORAGE_KEY); } catch { /* private mode */ }
}

/* ------------------------------------------------------------------ */
/* search request                                                      */
/* ------------------------------------------------------------------ */

export type PixabayAudioType = "music" | "sound_effects";

export function buildPixabaySearchUrl(args: {
  key: string;
  query: string;
  type: PixabayAudioType;
  page?: number;
  perPage?: number;
}): string {
  const u = new URL(PIXABAY_API_BASE);
  u.searchParams.set("key", args.key);
  u.searchParams.set("q", args.query);
  u.searchParams.set("audio_type", args.type);
  u.searchParams.set("page", String(args.page ?? 1));
  u.searchParams.set("per_page", String(args.perPage ?? 20));
  return u.toString();
}

/** The one host the key may ever be sent to — asserted in tests for every built URL. */
export function isPixabayApiUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === PIXABAY_API_HOST;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* response parsing                                                    */
/* ------------------------------------------------------------------ */

export interface PixabayTrack {
  id: string;
  title: string;
  author: string | null;
  durationSec: number | null;
  tags: string[];
  /** the track's page on pixabay.com (where its licence / Content-ID badge can be checked) */
  pageUrl: string | null;
  /** streamable preview URL from the API response, when it carries one */
  previewUrl: string | null;
  /** downloadable audio file URL from the API response (Pixabay CDN), when it carries one */
  audioUrl: string | null;
  /** true/false ONLY when the response actually carries a marker; null = the API does not say */
  contentIdRegistered: boolean | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** First string field among `keys` that looks like an audio file / stream URL. */
function audioUrlFrom(hit: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(hit[k]);
    if (v && /^https:\/\//.test(v)) return v;
  }
  return null;
}

/**
 * Content-ID marker detection. The documented response carries no such
 * field; this checks the plausible names so that IF a response ever includes
 * one (boolean, or a string like "registered"), it is honoured instead of
 * dropped. Absent/unrecognisable → null (unknown), never false.
 */
export function contentIdRegisteredFrom(hit: Record<string, unknown>): boolean | null {
  const fields = ["contentIdRegistered", "content_id_registered", "isContentIdRegistered", "contentId", "content_id", "contentIdRegisteredTrack"];
  for (const f of fields) {
    const v = hit[f];
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "registered" || s === "true" || s === "yes") return true;
      if (s === "not_registered" || s === "not registered" || s === "false" || s === "no" || s === "none") return false;
    }
  }
  return null;
}

export function parsePixabayTrack(hit: unknown): PixabayTrack | null {
  if (!hit || typeof hit !== "object") return null;
  const h = hit as Record<string, unknown>;
  const idRaw = h.id;
  const id = typeof idRaw === "number" ? String(idRaw) : str(idRaw);
  if (!id) return null;
  const audioUrl = audioUrlFrom(h, ["audioUrl", "audioURL", "downloadUrl", "downloadURL", "url"]);
  const previewUrl = audioUrlFrom(h, ["previewUrl", "previewURL", "preview", "previewAudio"]) ?? audioUrl;
  const tagsRaw = h.tags;
  return {
    id,
    title: str(h.title) ?? str(h.name) ?? `Pixabay track ${id}`,
    author: str(h.user) ?? str(h.author) ?? str(h.username),
    durationSec: num(h.duration),
    tags: typeof tagsRaw === "string" ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : Array.isArray(tagsRaw) ? tagsRaw.filter((t): t is string => typeof t === "string") : [],
    pageUrl: str(h.pageURL) ?? str(h.pageUrl) ?? str(h.page_url),
    previewUrl,
    audioUrl,
    contentIdRegistered: contentIdRegisteredFrom(h),
  };
}

export interface PixabaySearchResult {
  total: number;
  tracks: PixabayTrack[];
}

export function parsePixabaySearchResponse(json: unknown): PixabaySearchResult {
  if (!json || typeof json !== "object") throw new Error("Pixabay sent back something we couldn't read. Try the search again.");
  const j = json as Record<string, unknown>;
  const hits = Array.isArray(j.hits) ? j.hits : [];
  const tracks = hits.map(parsePixabayTrack).filter((t): t is PixabayTrack => t !== null);
  const total = num(j.totalHits) ?? num(j.total) ?? tracks.length;
  return { total, tracks };
}

/* ------------------------------------------------------------------ */
/* licence record + Content-ID copy                                    */
/* ------------------------------------------------------------------ */

/** The per-track licence record stored WITH the imported asset in the bin. */
export function pixabayLicenceRecord(track: PixabayTrack, retrievedAt: string): AssetLicenceRecord {
  return {
    source: "pixabay",
    title: track.title,
    author: track.author,
    // the track page is the licence source of truth; fall back to the file URL when the API gave no page
    sourceUrl: track.pageUrl ?? track.audioUrl ?? PIXABAY_API_BASE,
    licence: PIXABAY_LICENCE_NAME,
    retrievedAt,
    contentIdRegistered: track.contentIdRegistered,
  };
}

/**
 * The Content-ID warning for one track: a per-track warning ONLY when the
 * API response actually marked the track; otherwise the standing note
 * (unknown is not "clear"). `registered: null` in, standing note out.
 */
export function contentIdWarningFor(track: Pick<PixabayTrack, "contentIdRegistered" | "title">): string {
  if (track.contentIdRegistered === true) {
    return `“${track.title}” is marked Content-ID registered in Pixabay's data. You can still use it in a project, but expect a possible claim on platforms like YouTube — keep this licence record and check the track's Pixabay page for its licence proof before publishing.`;
  }
  return PIXABAY_CONTENT_ID_NOTE;
}

/* ------------------------------------------------------------------ */
/* search (client-side, fetch behind a seam)                           */
/* ------------------------------------------------------------------ */

export type PixabayFetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const defaultFetch: PixabayFetch = async (url) => {
  const res = await fetch(url);
  return { ok: res.ok, status: res.status, json: () => res.json() as Promise<unknown> };
};

export async function searchPixabayAudio(
  args: { key: string; query: string; type: PixabayAudioType; page?: number },
  fetchFn: PixabayFetch = defaultFetch,
): Promise<PixabaySearchResult> {
  const url = buildPixabaySearchUrl(args);
  if (!isPixabayApiUrl(url)) throw new Error("Refusing to send the Pixabay key anywhere except api.pixabay.com.");
  let res: Awaited<ReturnType<PixabayFetch>>;
  try {
    res = await fetchFn(url);
  } catch {
    throw new Error("Couldn't reach Pixabay. Check your connection and try again.");
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error("Pixabay rejected that API key. Check the key you pasted — it comes from your Pixabay profile — and try again.");
  }
  if (!res.ok) throw new Error(`Pixabay search failed (HTTP ${res.status}). Try again in a moment.`);
  return parsePixabaySearchResponse(await res.json());
}
