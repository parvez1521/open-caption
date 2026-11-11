import { PIXABAY_API_HOST, PIXABAY_LICENCE_NAME, savedPixabayKey } from "../studio/pixabay";
import type { AssetLicenceRecord } from "../studio/mediaAssets";

/**
 * Package 3 item I.4 — B-ROLL suggestions for a clip, from the stock source already
 * wired into this product: Pixabay, with the user's OWN free API key — the same key,
 * the same device-only storage and the same host discipline as the Pixabay audio
 * search in the Sound Effects panel (features/studio/pixabay.ts). The videos endpoint
 * is the sibling of the audio endpoint on the same host with the same key:
 * GET https://api.pixabay.com/api/videos/?key=…&q=…
 *
 * Suggestions are thumbnails only. A video file is downloaded ONLY when the user has
 * selected that suggestion and creates the clip — then it lands in the new project's
 * media bin with its licence record, like every other stock import.
 */
export interface BrollSuggestion {
  id: number;
  previewUrl: string;
  fileUrl: string;
  durationSec: number;
  width: number;
  height: number;
  pageUrl: string;
  tags: string;
  user: string | null;
}

export const BROLL_API_BASE = "https://api.pixabay.com/api/videos/";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "for", "with",
  "is", "are", "was", "were", "it", "its", "this", "that", "you", "your", "we", "i",
  "how", "what", "when", "why", "just", "like", "get", "got", "one", "all", "can",
]);

/** Deterministic search terms from a clip's transcript snippet: the first three
 *  content words (length > 3, not stopwords); "video" when nothing usable remains. */
export function brollQueryFor(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  return words.slice(0, 3).join(" ") || "video";
}

export function brollSearchUrl(query: string, key: string): string {
  const u = new URL(BROLL_API_BASE);
  u.searchParams.set("key", key);
  u.searchParams.set("q", query);
  u.searchParams.set("per_page", "6");
  u.searchParams.set("video_type", "film");
  u.searchParams.set("safesearch", "true");
  if (u.host !== PIXABAY_API_HOST) throw new Error("B-roll search would leave api.pixabay.com — refused.");
  return u.toString();
}

interface PixabayVideoHit {
  id: number;
  pageURL?: string;
  tags?: string;
  duration?: number;
  user?: string;
  videos?: Record<string, { url: string; width: number; height: number; thumbnail?: string } | undefined>;
}

export function mapBrollHits(json: unknown): BrollSuggestion[] {
  const hits = (json as { hits?: PixabayVideoHit[] } | null)?.hits ?? [];
  const out: BrollSuggestion[] = [];
  for (const h of hits) {
    const file = h.videos?.medium ?? h.videos?.small ?? h.videos?.large ?? h.videos?.tiny;
    if (!file?.url || !file.thumbnail) continue;
    out.push({
      id: h.id,
      previewUrl: file.thumbnail,
      fileUrl: file.url,
      durationSec: h.duration ?? 0,
      width: file.width,
      height: file.height,
      pageUrl: h.pageURL ?? "",
      tags: h.tags ?? "",
      user: h.user ?? null,
    });
  }
  return out;
}

export async function searchBroll(query: string, key: string, fetchFn: typeof fetch = fetch): Promise<BrollSuggestion[]> {
  const res = await fetchFn(brollSearchUrl(query, key));
  if (!res.ok) throw new Error(`Pixabay video search failed (${res.status}). Check the key in Sound Effects.`);
  return mapBrollHits(await res.json());
}

/** The user's saved Pixabay key, or null (the B-roll strip then points at Sound Effects). */
export function savedBrollKey(): string | null {
  return savedPixabayKey();
}

export function brollLicenceFor(s: BrollSuggestion, todayIso: string): AssetLicenceRecord {
  return {
    source: "pixabay",
    title: s.tags ? `Pixabay video — ${s.tags.split(",")[0]!.trim()}` : `Pixabay video ${s.id}`,
    author: s.user,
    sourceUrl: s.pageUrl,
    licence: PIXABAY_LICENCE_NAME,
    retrievedAt: todayIso,
    contentIdRegistered: null,
  };
}

export async function downloadBrollFile(s: BrollSuggestion, fetchFn: typeof fetch = fetch): Promise<File> {
  const res = await fetchFn(s.fileUrl);
  if (!res.ok) throw new Error(`Couldn't download that B-roll video (${res.status}).`);
  const blob = await res.blob();
  return new File([blob], `pixabay-video-${s.id}.mp4`, { type: blob.type || "video/mp4" });
}
