import "server-only";
import { MAX_TITLE_LENGTH, type GrowthPostInput } from "@/features/growth/model";
import type { ConnectPlatform } from "./config";

/**
 * One post fetched from a connected platform, shaped for the EXISTING growth
 * data model: the sync writes these into growth_posts with the platform as
 * the row's source and `externalId` as its platform-side id. A metric the
 * platform did not report stays null — missing data, never a silent zero
 * (the growth model's standing rule).
 */
export interface SyncedPost extends GrowthPostInput {
  externalId: string;
  source: ConnectPlatform;
}

/** Platform counters arrive as strings (YouTube) or numbers; anything unparsable is missing data (null). */
export function parseCount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  return null;
}

/** Titles are clamped to the growth model's cap, on a word boundary where possible. */
export function clampTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_TITLE_LENGTH) return clean;
  return clean.slice(0, MAX_TITLE_LENGTH).trimEnd();
}

export type FetchImpl = typeof fetch;

/** GET/POST JSON with a hard failure on !ok — provider error bodies are never trusted as data. */
export async function fetchJson(
  fetchImpl: FetchImpl,
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`provider request failed (${res.status})`);
  const body: unknown = await res.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("provider returned an unexpected response");
  return body as Record<string, unknown>;
}

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
