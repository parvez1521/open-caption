import { isFreeLaunchWindow } from "@/lib/billing/freeLaunch";

/**
 * Homepage "Free until 5th December" popup (owner order 2026-11-28).
 * Shows once, 5s after the entrance animation finishes; a dismissal hides
 * it for 7 days. The popup never shows after the free window ends
 * (5 Dec 2026, 23:59 IST) — the window check comes from freeLaunch.ts,
 * so the popup expires on its own with no manual step and no deploy.
 *
 * Storage key follows the `ce:` prefix used by the tutorial flags
 * (ce:tutorial-seen:v3, ce:tutorial-never-show).
 */

/** localStorage key holding the dismissal timestamp (ISO string). */
export const FREE_POPUP_DISMISSED_KEY = "ce:free-popup-dismissed-at";
/** ms after the entrance finishes before the popup appears. */
export const FREE_POPUP_DELAY_MS = 5000;
/** Days a dismissal suppresses the popup. */
export const FREE_POPUP_SUPPRESS_DAYS = 7;

const SUPPRESS_MS = FREE_POPUP_SUPPRESS_DAYS * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * True when the popup may show: the free window is still running and the
 * visitor has not dismissed it in the last 7 days. A missing or unreadable
 * record means "never dismissed", so the popup shows.
 */
export function shouldShowFreePopup(
  now: Date = new Date(),
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!isFreeLaunchWindow(now)) return false;
  if (!storage) return true;
  let raw: string | null = null;
  try {
    raw = storage.getItem(FREE_POPUP_DISMISSED_KEY);
  } catch {
    return true;
  }
  if (!raw) return true;
  const dismissedAt = Date.parse(raw);
  if (Number.isNaN(dismissedAt)) return true;
  return now.getTime() - dismissedAt >= SUPPRESS_MS;
}

/** Record a dismissal now: the popup stays hidden for 7 days. */
export function dismissFreePopup(
  now: Date = new Date(),
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(FREE_POPUP_DISMISSED_KEY, now.toISOString());
  } catch {
    // storage unavailable (private mode) — the popup just shows again next visit
  }
}
