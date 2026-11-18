/**
 * GIF Stickers — runtime library over Openverse (WordPress.org's openly-licensed
 * media search), the keyless CC source. No API key, no account, no server: the
 * browser calls api.openverse.org directly with plain GETs, and only the search
 * terms ever leave the device (no user data in any request).
 *
 * WHAT OPENVERSE IS (verified against its docs, 2026-11-18): GET
 * https://api.openverse.org/v1/images/?q=…&extension=gif&license_type=commercial
 * returns openly-licensed images with per-item licence, creator, attribution
 * string and direct file URL. Anonymous callers get at most 20 results per
 * page and about 20 requests/minute burst / 200/day — the loader caps page_size
 * at 20, caches repeat searches in memory, and reports a 429 as exactly that
 * (wait, don't hammer). Live verification from this sandbox was NOT possible —
 * api.openverse.org returns 403 through the sandbox egress — so the parser is
 * built against the documented response shape and ALL network access sits
 * behind an injectable fetch seam that the tests drive with fixtures of that
 * shape (same pattern as ./pixabay.ts).
 *
 * LICENCE: `license_type=commercial` restricts results to licences that allow
 * commercial use (CC BY / BY-SA / CC0 / Public Domain Mark). Openverse is an
 * index, not a warranty: every result carries its licence + creator + source
 * page, the panel shows the attribution line with each GIF, and the attribution
 * is recorded per imported asset (see saveGifAttribution) so the credit survives
 * the download. Openverse's terms forbid scraping — this is ordinary API use,
 * one search at a time, results cached, never bulk-downloaded.
 *
 * PREVIEW vs EXPORT, stated honestly: a GIF sticker is added as an image
 * overlay through the existing makeImageOverlay path (bytes land in the
 * on-device media bin, IndexedDB). In the preview the GIF animates (plain DOM
 * <img>). In the exported MP4 it renders as a STILL — the first frame — because
 * the composition draws image overlays with Remotion's <Img>, and Remotion's
 * own docs say not to use <Img> for GIFs (animated GIFs need @remotion/gif,
 * which this project does not install). The panel says so next to the library.
 */

export const OPENVERSE_API_BASE = "https://api.openverse.org/v1/images/";
export const OPENVERSE_API_HOST = "api.openverse.org";
/** Anonymous callers get at most 20 results per page — the API silently clamps more. */
export const OPENVERSE_MAX_PAGE_SIZE = 20;
export const OPENVERSE_LICENCE_URL = "https://api.openverse.org/v1/images/";
export const OPENVERSE_TERMS_URL = "https://docs.openverse.org/terms_of_service.html";

/** The one host a search request may ever be sent to — asserted in tests for every built URL. */
export function isOpenverseApiUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === OPENVERSE_API_HOST;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* search request                                                      */
/* ------------------------------------------------------------------ */

export function buildOpenverseGifSearchUrl(args: { query: string; page?: number; perPage?: number }): string {
  const u = new URL(OPENVERSE_API_BASE);
  u.searchParams.set("q", args.query.trim());
  u.searchParams.set("extension", "gif");
  u.searchParams.set("license_type", "commercial");
  u.searchParams.set("page", String(Math.max(1, args.page ?? 1)));
  u.searchParams.set("page_size", String(Math.min(OPENVERSE_MAX_PAGE_SIZE, Math.max(1, args.perPage ?? OPENVERSE_MAX_PAGE_SIZE))));
  return u.toString();
}

/* ------------------------------------------------------------------ */
/* response parsing                                                    */
/* ------------------------------------------------------------------ */

export interface OpenverseGif {
  id: string;
  title: string;
  creator: string | null;
  creatorUrl: string | null;
  /** licence slug as the API states it: "by" | "by-sa" | "cc0" | "pdm" | … */
  licence: string;
  licenceVersion: string | null;
  licenceUrl: string | null;
  /** ready-made credit line from the API ("" when the API gave none) */
  attribution: string;
  /** direct file URL (the GIF bytes) */
  url: string;
  /** small preview image for the grid (falls back to `url`) */
  thumbnailUrl: string;
  /** the work's page at its home provider — where the licence can be re-checked */
  sourceUrl: string | null;
  tags: string[];
  width: number | null;
  height: number | null;
}

/** Human-readable licence label from the API's slug + version, e.g. "CC BY 2.0" / "CC0 1.0". */
export function openverseLicenceLabel(gif: Pick<OpenverseGif, "licence" | "licenceVersion">): string {
  const slug = gif.licence.toLowerCase();
  const v = gif.licenceVersion ? ` ${gif.licenceVersion}` : "";
  if (slug === "cc0") return "CC0 1.0";
  if (slug === "pdm") return "Public Domain Mark";
  return `CC ${slug.toUpperCase()}${v}`;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseOpenverseGif(hit: unknown): OpenverseGif | null {
  if (!hit || typeof hit !== "object") return null;
  const h = hit as Record<string, unknown>;
  const id = str(h.id);
  const url = str(h.url);
  // No id or no direct file URL = nothing honest to download or credit: skip the hit.
  if (!id || !url || !/^https:\/\//.test(url)) return null;
  const tagsRaw = h.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((t) => (typeof t === "string" ? t : typeof t === "object" && t !== null ? str((t as Record<string, unknown>).name) : null)).filter((t): t is string => Boolean(t))
    : [];
  const thumb = str(h.thumbnail);
  return {
    id,
    title: str(h.title) ?? `Openverse GIF ${id}`,
    creator: str(h.creator),
    creatorUrl: str(h.creator_url),
    licence: str(h.license) ?? "unknown",
    licenceVersion: str(h.license_version),
    licenceUrl: str(h.license_url),
    attribution: str(h.attribution) ?? "",
    url,
    thumbnailUrl: thumb && /^https:\/\//.test(thumb) ? thumb : url,
    sourceUrl: str(h.foreign_landing_url),
    tags,
    width: num(h.width),
    height: num(h.height),
  };
}

export interface OpenverseGifSearchResult {
  total: number;
  gifs: OpenverseGif[];
  page: number;
  pageCount: number;
}

export function parseOpenverseGifSearchResponse(json: unknown): OpenverseGifSearchResult {
  if (!json || typeof json !== "object") throw new Error("Openverse sent back something we couldn't read. Try the search again.");
  const j = json as Record<string, unknown>;
  const hits = Array.isArray(j.results) ? j.results : [];
  const gifs = hits.map(parseOpenverseGif).filter((g): g is OpenverseGif => g !== null);
  return {
    total: num(j.result_count) ?? gifs.length,
    gifs,
    page: num(j.page) ?? 1,
    pageCount: num(j.page_count) ?? 1,
  };
}

/* ------------------------------------------------------------------ */
/* search (client-side, fetch behind a seam, results cached in memory) */
/* ------------------------------------------------------------------ */

export type OpenverseFetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; blob?: () => Promise<Blob> }>;

const defaultFetch: OpenverseFetch = async (url) => {
  const res = await fetch(url);
  return { ok: res.ok, status: res.status, json: () => res.json() as Promise<unknown>, blob: () => res.blob() };
};

/** In-memory cache of search pages, so repeat searches don't burn the 200/day anonymous budget. */
const searchCache = new Map<string, OpenverseGifSearchResult>();

export function clearGifSearchCache(): void {
  searchCache.clear();
}

export async function searchOpenverseGifs(
  args: { query: string; page?: number },
  fetchFn: OpenverseFetch = defaultFetch,
): Promise<OpenverseGifSearchResult> {
  const query = args.query.trim();
  if (!query) throw new Error("Type something to search for — e.g. “birthday” or “cat”.");
  const page = Math.max(1, args.page ?? 1);
  const cacheKey = `${query.toLowerCase()}|${page}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;
  const url = buildOpenverseGifSearchUrl({ query, page });
  if (!isOpenverseApiUrl(url)) throw new Error("Refusing to search anywhere except api.openverse.org.");
  let res: Awaited<ReturnType<OpenverseFetch>> | null = null;
  // Openverse occasionally drops a search (gateway timeouts seen live): retry once
  // on a network failure or a 5xx before telling the user the search failed.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchFn(url);
      res = r;
      if (r.ok || r.status < 500) break;
    } catch {
      // network failure — fall through to the retry below
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
  }
  if (res === null) throw new Error("Couldn't reach Openverse. Check your connection and try again.");
  if (res.status === 429) {
    throw new Error("Openverse rate limit — free anonymous searches are capped per hour. Wait a minute and try again.");
  }
  if (!res.ok) throw new Error(`Openverse search failed (HTTP ${res.status}). Try again in a moment.`);
  const parsed = parseOpenverseGifSearchResponse(await res.json());
  searchCache.set(cacheKey, parsed);
  return parsed;
}

/* ------------------------------------------------------------------ */
/* curated browse categories — one honest query each                  */
/* ------------------------------------------------------------------ */

export interface GifCategory {
  id: string;
  label: string;
  /** the Openverse query this category runs (plain words — GIFs are a thin slice of the index) */
  query: string;
}

export const GIF_CATEGORIES: GifCategory[] = [
  { id: "celebration", label: "Celebration", query: "birthday confetti" },
  { id: "reactions", label: "Reactions", query: "happy dance" },
  { id: "love", label: "Love", query: "heart love" },
  { id: "animals", label: "Animals", query: "cat funny" },
  { id: "food", label: "Food", query: "pizza" },
  { id: "sport", label: "Sport", query: "football goal" },
  { id: "music", label: "Music", query: "dancing music" },
  { id: "nature", label: "Nature", query: "flower blooming" },
  { id: "funny", label: "Funny", query: "funny fail" },
  { id: "pointing", label: "Pointing", query: "arrow pointing" },
];

/* ------------------------------------------------------------------ */
/* download + attribution record                                       */
/* ------------------------------------------------------------------ */

/** File name for the downloaded GIF in the media bin: unique per Openverse id, so a
 *  GIF already imported is found again by name instead of downloaded twice. */
export function gifFileName(gif: Pick<OpenverseGif, "id">): string {
  return `openverse-${gif.id.replace(/[^a-zA-Z0-9_-]/g, "-")}.gif`;
}

/**
 * Download one GIF's bytes (plain public GET of the direct file URL Openverse indexed;
 * the file lives on the work's home provider, e.g. Flickr/Wikimedia — no user data is
 * sent). Throws a plain message on failure; the panel shows it.
 */
export async function downloadGifBlob(gif: OpenverseGif, fetchFn: OpenverseFetch = defaultFetch): Promise<Blob> {
  if (!/^https:\/\//.test(gif.url)) throw new Error("That GIF has no usable download link.");
  let res: Awaited<ReturnType<OpenverseFetch>>;
  try {
    res = await fetchFn(gif.url);
  } catch {
    throw new Error("Couldn't download that GIF. Check your connection and try again.");
  }
  if (!res.ok || !res.blob) throw new Error(`Couldn't download that GIF (HTTP ${res.status}). Try another one.`);
  const blob = await res.blob();
  if (blob.size === 0) throw new Error("That GIF downloaded empty. Try another one.");
  return blob;
}

/**
 * Per-item attribution record, stored device-local (localStorage) under the imported
 * media-bin asset id — the credit survives the download, and the panel can show it
 * again for anything already placed. NOTE: the shared AssetLicenceRecord type only
 * allows sources "kenney" | "freesound" | "pixabay" | "synth", so an Openverse record
 * cannot live on the asset itself without a change to mediaAssets.ts; this store is
 * the honest stand-in until that union gains "openverse".
 */
export interface GifAttribution {
  title: string;
  creator: string | null;
  licence: string;
  licenceUrl: string | null;
  sourceUrl: string | null;
  attribution: string;
}

export const GIF_ATTRIBUTION_STORAGE_KEY = "ce:gif-attributions";

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

function readAttributionMap(storage: KeyValueStorage | null): Record<string, GifAttribution> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(GIF_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, GifAttribution>) : {};
  } catch {
    return {};
  }
}

export function saveGifAttribution(assetId: string, gif: OpenverseGif, storage: KeyValueStorage | null = defaultStorage()): void {
  if (!storage || !assetId) return;
  try {
    const map = readAttributionMap(storage);
    map[assetId] = {
      title: gif.title,
      creator: gif.creator,
      licence: openverseLicenceLabel(gif),
      licenceUrl: gif.licenceUrl,
      sourceUrl: gif.sourceUrl,
      attribution: gif.attribution || `${gif.title}${gif.creator ? ` by ${gif.creator}` : ""} — ${openverseLicenceLabel(gif)}`,
    };
    storage.setItem(GIF_ATTRIBUTION_STORAGE_KEY, JSON.stringify(map));
  } catch { /* private mode — the credit simply won't persist */ }
}

export function gifAttributionFor(assetId: string, storage: KeyValueStorage | null = defaultStorage()): GifAttribution | null {
  if (!storage || !assetId) return null;
  return readAttributionMap(storage)[assetId] ?? null;
}

/** One-line credit for a result row: the API's own attribution string when it has one. */
export function gifCreditLine(gif: OpenverseGif): string {
  if (gif.attribution) return gif.attribution;
  return `${gif.title}${gif.creator ? ` by ${gif.creator}` : ""} — ${openverseLicenceLabel(gif)}`;
}
