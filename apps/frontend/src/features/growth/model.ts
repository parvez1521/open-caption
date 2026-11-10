/**
 * Growth Studio — shared pure model (Phase 6 slice 6.2).
 *
 * This module is the single source of validation truth for a growth post:
 * the API routes stamp + store exactly what `validatePostRow` accepts, and
 * the CSV importer (csv.ts) feeds every row through it too. It is pure and
 * dependency-free so client code, routes and tests all import it directly.
 *
 * Honesty rules (brief §11 — Growth Studio is manual / CSV-first):
 * - Every metric is `number | null`. Null means "the creator did not enter
 *   this metric" — missing data, never a silent zero. Aggregates that need
 *   a total (summariseMetric) report how many posts actually reported the
 *   metric next to the sum, so a total is never mistaken for complete data.
 * - `source` records how a row arrived ('manual' | 'csv'). It is stamped by
 *   the routes, never accepted from the client, and deliberately NOT part of
 *   the validator: a row's origin is a server fact, not user input.
 * - No scraping and no platform sync exist anywhere in this feature; every
 *   number here is one the creator typed or imported themselves.
 */

export type PostSource = "manual" | "csv";

export type MetricKey = "views" | "reach" | "likes" | "comments" | "shares" | "saves";

export const METRIC_KEYS: readonly MetricKey[] = ["views", "reach", "likes", "comments", "shares", "saves"];

export interface GrowthPost {
  id: string;
  platform: string;
  title: string;
  postUrl: string | null;
  /** ISO 8601 timestamp of when the post was published. */
  postedAt: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  source: PostSource;
  createdAt: string;
  updatedAt: string;
}

/** A validated post ready to store — everything except id / timestamps / source. */
export interface GrowthPostInput {
  platform: string;
  title: string;
  postUrl: string | null;
  postedAt: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

export interface CompetitorProfile {
  id: string;
  name: string;
  platform: string;
  handle: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Suggestions for the platform picker only — platform itself stays free text. */
export const PLATFORM_SUGGESTIONS: readonly string[] = [
  "instagram",
  "youtube",
  "linkedin",
  "x",
  "facebook",
  "threads",
];

export const MAX_PLATFORM_LENGTH = 40;
export const MAX_TITLE_LENGTH = 200;
export const MAX_POST_URL_LENGTH = 500;
export const MAX_METRIC_VALUE = 1e12;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Coerce one metric field. Absent / null / empty string → null (not entered).
 * Numbers and numeric strings are accepted; anything that is not a
 * non-negative integer within range earns a per-field error naming the field.
 */
function parseMetric(
  raw: Record<string, unknown>,
  key: MetricKey,
  errors: string[],
): number | null {
  const value = raw[key];
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  let num: number | null = null;
  if (typeof value === "number") {
    num = value;
  } else if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    num = Number(value.trim());
  }
  if (num === null || !Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > MAX_METRIC_VALUE) {
    errors.push(`${key} must be a non-negative integer no larger than ${MAX_METRIC_VALUE}`);
    return null;
  }
  return num;
}

/**
 * Validate one untrusted post row (API body, CSV row, import row) into a
 * GrowthPostInput. Every rule failure is collected so the caller can show
 * them all at once; each message names its field.
 */
export function validatePostRow(
  raw: unknown,
): { ok: true; value: GrowthPostInput } | { ok: false; errors: string[] } {
  if (!isRecord(raw)) return { ok: false, errors: ["row must be an object"] };
  const errors: string[] = [];

  // platform — required, free text (suggestions live in PLATFORM_SUGGESTIONS).
  let platform = "";
  if (typeof raw.platform !== "string" || raw.platform.trim() === "") {
    errors.push("platform is required");
  } else if (raw.platform.trim().length > MAX_PLATFORM_LENGTH) {
    errors.push(`platform must be at most ${MAX_PLATFORM_LENGTH} characters`);
  } else {
    platform = raw.platform.trim();
  }

  // title — optional, defaults to "".
  let title = "";
  if (raw.title !== undefined && raw.title !== null) {
    if (typeof raw.title !== "string") {
      errors.push("title must be text");
    } else if (raw.title.trim().length > MAX_TITLE_LENGTH) {
      errors.push(`title must be at most ${MAX_TITLE_LENGTH} characters`);
    } else {
      title = raw.title.trim();
    }
  }

  // postUrl — optional; when present it must be an http(s) link.
  let postUrl: string | null = null;
  if (raw.postUrl !== undefined && raw.postUrl !== null && !(typeof raw.postUrl === "string" && raw.postUrl.trim() === "")) {
    if (typeof raw.postUrl !== "string") {
      errors.push("postUrl must be text");
    } else if (raw.postUrl.trim().length > MAX_POST_URL_LENGTH) {
      errors.push(`postUrl must be at most ${MAX_POST_URL_LENGTH} characters`);
    } else if (!raw.postUrl.trim().startsWith("http://") && !raw.postUrl.trim().startsWith("https://")) {
      errors.push("postUrl must start with http:// or https://");
    } else {
      postUrl = raw.postUrl.trim();
    }
  }

  // postedAt — required and Date.parse-able; stored normalised to ISO.
  let postedAt = "";
  if (typeof raw.postedAt !== "string" || raw.postedAt.trim() === "") {
    errors.push("postedAt is required");
  } else {
    const parsed = Date.parse(raw.postedAt.trim());
    if (Number.isNaN(parsed)) {
      errors.push("postedAt must be a valid date");
    } else {
      postedAt = new Date(parsed).toISOString();
    }
  }

  const metrics = {} as Record<MetricKey, number | null>;
  for (const key of METRIC_KEYS) metrics[key] = parseMetric(raw, key, errors);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { platform, title, postUrl, postedAt, ...metrics } };
}

/**
 * Per-post engagement: likes + comments + shares + saves. A single post's
 * engagement treats unentered metrics as 0 — that is the definition of this
 * one number, and it is documented as such wherever it is shown. Cross-post
 * totals use summariseMetric instead, which keeps the reported counts
 * visible so incomplete data is never presented as complete.
 */
export function engagementOf(post: Pick<GrowthPost, "likes" | "comments" | "shares" | "saves">): number {
  return (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0) + (post.saves ?? 0);
}

/**
 * Sum one metric across posts, counting only the posts that actually
 * reported it. `total` is the sum of reported values; `reportedCount` is
 * how many posts reported — the two travel together so nothing is invented.
 */
export function summariseMetric(
  posts: ReadonlyArray<Pick<GrowthPost, MetricKey>>,
  key: MetricKey,
): { total: number; reportedCount: number } {
  let total = 0;
  let reportedCount = 0;
  for (const post of posts) {
    const value = post[key];
    if (value !== null && value !== undefined) {
      total += value;
      reportedCount += 1;
    }
  }
  return { total, reportedCount };
}
