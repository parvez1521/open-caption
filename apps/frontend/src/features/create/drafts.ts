/**
 * Saved drafts for the generators: a small localStorage list, on this device only.
 * There is deliberately no server library in this wave; the page labels drafts as stored
 * on this device, and this module is the whole persistence story.
 */
import type { GeneratedItem, GeneratorKind, Source } from "./model";

export interface Draft {
  id: string;
  kind: GeneratorKind;
  source: Source;
  item: GeneratedItem;
  savedAt: number;
}

export const DRAFTS_KEY = "ce:create-drafts";
export const MAX_DRAFTS = 50;

export function loadDrafts(storage: Storage | null = safeStorage()): Draft[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(DRAFTS_KEY) ?? "[]") as Draft[];
    return Array.isArray(parsed) ? parsed.filter((d) => d && typeof d.id === "string" && d.item) : [];
  } catch {
    return [];
  }
}

export function addDraft(draft: Omit<Draft, "id" | "savedAt">, storage: Storage | null = safeStorage()): Draft[] {
  if (!storage) return [];
  const entry: Draft = {
    ...draft,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
  };
  const next = [entry, ...loadDrafts(storage)].slice(0, MAX_DRAFTS);
  try {
    storage.setItem(DRAFTS_KEY, JSON.stringify(next));
  } catch { /* private mode or quota: drafts are a convenience, never an error surface */ }
  return next;
}

export function removeDraft(id: string, storage: Storage | null = safeStorage()): Draft[] {
  if (!storage) return [];
  const next = loadDrafts(storage).filter((d) => d.id !== id);
  try {
    storage.setItem(DRAFTS_KEY, JSON.stringify(next));
  } catch { /* see addDraft */ }
  return next;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
