import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Favourite caption looks — local-only (owner 2026-11-15).
 *
 * The heart on a look in the Studio Looks panel stores the look's id in one
 * localStorage key. No account sync, no Supabase table: the app is
 * local-first (projects live in IndexedDB) and favourites are a device
 * preference, like the ad-consent choice (see adConsent.ts) and the
 * onboarding answers (`oc:onboarding-answers`). Account sync is a future
 * step if the owner wants it.
 *
 * Server rendering never sees this: the hook starts empty and reads the
 * stored set in an effect, so SSR and the first client render agree.
 */

export const FAVOURITE_LOOKS_KEY = "captionit:favourite-looks";

/** Fired on window whenever the stored set changes in this tab. */
export const FAVOURITE_LOOKS_EVENT = "captionit:favourite-looks";

const EMPTY: ReadonlySet<string> = new Set();

/** Parse one stored value: a JSON array of string ids. Anything else → empty. */
export function parseFavouriteLooks(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

/** Read the stored ids exactly as saved (unknown ids included). */
export function readRawFavouriteLooks(): Set<string> {
  try {
    return parseFavouriteLooks(window.localStorage.getItem(FAVOURITE_LOOKS_KEY));
  } catch {
    return new Set();
  }
}

/**
 * Read the stored ids, ignoring ids that are not in `knownIds` when given
 * (a look removed from the catalogue, or a saved template deleted since).
 * Unknown ids stay in storage — only the read view drops them — so a
 * slow-loading catalogue can never delete a favourite.
 */
export function readFavouriteLooks(knownIds?: ReadonlySet<string>): ReadonlySet<string> {
  const raw = readRawFavouriteLooks();
  if (!knownIds) return raw;
  return new Set([...raw].filter((id) => knownIds.has(id)));
}

export function writeFavouriteLooks(ids: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(FAVOURITE_LOOKS_KEY, JSON.stringify([...ids]));
    window.dispatchEvent(new Event(FAVOURITE_LOOKS_EVENT));
  } catch {
    // Storage unavailable (private mode, blocked): favourites just do not
    // persist. Nothing else breaks.
  }
}

/** Pure toggle: the set with `id` added or removed. */
export function toggleFavouriteLook(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Favourites for the Looks panel. The toggle is a stable reference and
 * always toggles against the stored set, so a TemplateCard's props only
 * change when its own heart flips — memo keeps the other cards still
 * (see looksPanelPerf.test.tsx).
 */
export function useFavouriteLooks(knownIds: ReadonlySet<string>): {
  favourites: ReadonlySet<string>;
  toggleFavourite: (id: string) => void;
} {
  const [favourites, setFavourites] = useState<ReadonlySet<string>>(EMPTY);
  const knownRef = useRef(knownIds);
  knownRef.current = knownIds;

  const refresh = useCallback(() => {
    setFavourites(readFavouriteLooks(knownRef.current));
  }, []);

  // Read after mount (never during render: SSR and the first client render
  // both start empty) and re-validate when the catalogue changes.
  useEffect(() => {
    refresh();
  }, [knownIds, refresh]);

  // Two tabs stay in sync: the `storage` event fires in every OTHER tab
  // when one tab writes; the custom event covers writes in this tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAVOURITE_LOOKS_KEY || e.key === null) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(FAVOURITE_LOOKS_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FAVOURITE_LOOKS_EVENT, refresh);
    };
  }, [refresh]);

  const toggleFavourite = useCallback((id: string) => {
    const next = toggleFavouriteLook(readRawFavouriteLooks(), id);
    writeFavouriteLooks(next);
    setFavourites(readFavouriteLooks(knownRef.current));
  }, []);

  return { favourites, toggleFavourite };
}
