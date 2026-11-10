/**
 * Motion Studio presets: a user's saved text / colour / duration for one template, kept
 * device-local in localStorage under a versioned key. Presets deliberately do NOT carry the
 * avatar/QR image: that asset lives in a project's media bin, so a preset cannot promise it —
 * applying a preset leaves the current image selection untouched.
 *
 * Every read/write tolerates storage failure (private mode, quota, blocked storage): a failed
 * save reports false, a failed read reads as "no presets" — the page never crashes over it.
 */

export interface MotionPreset {
  name: string;
  text: string;
  color: string;
  durationMs: number;
  savedAt: number;
}

export const MOTION_PRESETS_KEY = "opencaption:motion-presets:v1";

type PresetStore = Record<string, MotionPreset[]>;

function defaultStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readStore(storage: Storage | null): PresetStore {
  if (!storage) return {};
  try {
    const raw = storage.getItem(MOTION_PRESETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: PresetStore = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      out[k] = v.filter(
        (p): p is MotionPreset =>
          Boolean(p) && typeof p === "object" &&
          typeof (p as MotionPreset).name === "string" &&
          typeof (p as MotionPreset).text === "string" &&
          typeof (p as MotionPreset).color === "string" &&
          typeof (p as MotionPreset).durationMs === "number",
      );
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(storage: Storage | null, store: PresetStore): boolean {
  if (!storage) return false;
  try {
    storage.setItem(MOTION_PRESETS_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function listMotionPresets(templateId: string, storage: Storage | null = defaultStorage()): MotionPreset[] {
  return [...(readStore(storage)[templateId] ?? [])].sort((a, b) => a.savedAt - b.savedAt);
}

/** Save (or overwrite, by name) a preset for a template. Returns false when storage failed. */
export function saveMotionPreset(
  templateId: string,
  preset: Omit<MotionPreset, "savedAt">,
  storage: Storage | null = defaultStorage(),
  now: number = Date.now(),
): boolean {
  const name = preset.name.trim();
  if (!name) return false;
  const store = readStore(storage);
  const list = (store[templateId] ?? []).filter((p) => p.name !== name);
  list.push({ ...preset, name, savedAt: now });
  store[templateId] = list;
  return writeStore(storage, store);
}

/** Delete one preset by name. Returns false when it did not exist or storage failed. */
export function deleteMotionPreset(templateId: string, name: string, storage: Storage | null = defaultStorage()): boolean {
  const store = readStore(storage);
  const list = store[templateId] ?? [];
  if (!list.some((p) => p.name === name)) return false;
  store[templateId] = list.filter((p) => p.name !== name);
  return writeStore(storage, store);
}
