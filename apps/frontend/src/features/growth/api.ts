/**
 * Client side of Growth Studio (Phase 6 slice 6.2; server routes:
 * /api/v1/growth/…, server record: lib/api/growth.ts, schema:
 * supabase/migrations/20261110050000_growth_studio.sql, shared types +
 * validator: features/growth/model.ts).
 *
 * Honest degradation mirrors the server: until the owner applies the
 * database update (supabase/APPLY-GROWTH-STUDIO.sql) the tables do not
 * exist, list calls resolve with `ready: false` and an empty list instead
 * of throwing, and write calls fail with the server's plain "not set up
 * yet" message. Callers can therefore render a "Growth Studio pending"
 * state rather than an error screen.
 *
 * Data honesty: every metric stays `number | null` end to end — null is
 * "not entered", never rewritten to 0 here — and `source` is whatever the
 * server stamped ('manual' | 'csv'); rows whose source is anything else
 * are dropped by the defensive mapper below.
 */
import { apiClient } from "@/services/api-client";
import type { CompetitorProfile, GrowthPost, GrowthPostInput, PostSource } from "./model";

export interface GrowthPostList {
  ready: boolean;
  posts: GrowthPost[];
}

export interface CompetitorList {
  ready: boolean;
  competitors: CompetitorProfile[];
}

export interface ImportResult {
  imported: number;
  rejected: Array<{ index: number; errors: string[] }>;
}

export interface CreateCompetitorInput {
  name: string;
  platform?: string;
  handle?: string | null;
  notes?: string | null;
}

export interface UpdateCompetitorPatch {
  name?: string;
  platform?: string;
  handle?: string | null;
  notes?: string | null;
}

/** Partial edit for a post — deliberately has NO `source`: it is server-stamped and never patchable. */
export type UpdateGrowthPostPatch = Partial<GrowthPostInput>;

// ---------------------------------------------------------------------------
// Response mapping (pure — defensive pass at the boundary). Malformed rows
// are dropped rather than smuggled into the typed shapes; a metric that is
// not a finite number becomes null (not entered), never an invented value.
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

const asNullableString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const asMetric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asSource = (value: unknown): PostSource | null =>
  value === "manual" || value === "csv" ? value : null;

export function mapGrowthPost(raw: unknown): GrowthPost | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  const source = asSource(raw.source);
  if (source === null) return null;
  return {
    id: raw.id,
    platform: asString(raw.platform),
    title: asString(raw.title),
    postUrl: asNullableString(raw.postUrl),
    postedAt: asString(raw.postedAt),
    views: asMetric(raw.views),
    reach: asMetric(raw.reach),
    likes: asMetric(raw.likes),
    comments: asMetric(raw.comments),
    shares: asMetric(raw.shares),
    saves: asMetric(raw.saves),
    source,
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt),
  };
}

export function mapCompetitorProfile(raw: unknown): CompetitorProfile | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  return {
    id: raw.id,
    name: raw.name,
    platform: asString(raw.platform),
    handle: asNullableString(raw.handle),
    notes: asNullableString(raw.notes),
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt),
  };
}

export function mapGrowthPostList(raw: unknown): GrowthPostList {
  if (!isRecord(raw)) return { ready: false, posts: [] };
  const posts = Array.isArray(raw.posts)
    ? raw.posts.map(mapGrowthPost).filter((x): x is GrowthPost => x !== null)
    : [];
  return { ready: raw.ready === true, posts };
}

export function mapCompetitorList(raw: unknown): CompetitorList {
  if (!isRecord(raw)) return { ready: false, competitors: [] };
  const competitors = Array.isArray(raw.competitors)
    ? raw.competitors.map(mapCompetitorProfile).filter((x): x is CompetitorProfile => x !== null)
    : [];
  return { ready: raw.ready === true, competitors };
}

// ---------------------------------------------------------------------------
// Fetch helpers — all go through apiClient (authenticated, standard envelope).
// ---------------------------------------------------------------------------

export async function fetchGrowthPosts(): Promise<GrowthPostList> {
  return mapGrowthPostList(await apiClient.get<unknown>("/growth/posts"));
}

export async function createGrowthPost(input: GrowthPostInput): Promise<GrowthPost> {
  const raw = await apiClient.post<unknown>("/growth/posts", { json: input });
  const post = mapGrowthPost(raw);
  if (!post) throw new Error("The server returned an unexpected growth post.");
  return post;
}

export async function updateGrowthPost(id: string, patch: UpdateGrowthPostPatch): Promise<GrowthPost> {
  const raw = await apiClient.patch<unknown>(`/growth/posts/${encodeURIComponent(id)}`, { json: patch });
  const post = mapGrowthPost(raw);
  if (!post) throw new Error("The server returned an unexpected growth post.");
  return post;
}

export async function deleteGrowthPost(id: string): Promise<void> {
  await apiClient.delete(`/growth/posts/${encodeURIComponent(id)}`);
}

export async function importGrowthPosts(rows: unknown[]): Promise<ImportResult> {
  const raw = await apiClient.post<unknown>("/growth/posts/import", { json: { rows } });
  if (!isRecord(raw)) return { imported: 0, rejected: [] };
  const rejected = Array.isArray(raw.rejected)
    ? raw.rejected
        .filter(isRecord)
        .map((r) => ({
          index: typeof r.index === "number" ? r.index : -1,
          errors: Array.isArray(r.errors) ? r.errors.filter((e): e is string => typeof e === "string") : [],
        }))
    : [];
  return { imported: typeof raw.imported === "number" ? raw.imported : 0, rejected };
}

export async function fetchCompetitors(): Promise<CompetitorList> {
  return mapCompetitorList(await apiClient.get<unknown>("/growth/competitors"));
}

export async function createCompetitor(input: CreateCompetitorInput): Promise<CompetitorProfile> {
  const raw = await apiClient.post<unknown>("/growth/competitors", { json: input });
  const profile = mapCompetitorProfile(raw);
  if (!profile) throw new Error("The server returned an unexpected competitor profile.");
  return profile;
}

export async function updateCompetitor(id: string, patch: UpdateCompetitorPatch): Promise<CompetitorProfile> {
  const raw = await apiClient.patch<unknown>(`/growth/competitors/${encodeURIComponent(id)}`, { json: patch });
  const profile = mapCompetitorProfile(raw);
  if (!profile) throw new Error("The server returned an unexpected competitor profile.");
  return profile;
}

export async function deleteCompetitor(id: string): Promise<void> {
  await apiClient.delete(`/growth/competitors/${encodeURIComponent(id)}`);
}
