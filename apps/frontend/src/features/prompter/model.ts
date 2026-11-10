/**
 * Teleprompter — pure model (Phase 7, slice 7.2).
 *
 * Everything testable about the prompter lives here: the settings shape and
 * its clamping, the scroll maths (offsets, progress, time remaining), the
 * reading-time estimate, the keyboard map, and the Script Studio import.
 *
 * Pure module: no DOM, no storage, no network. The page owns the side
 * effects (requestAnimationFrame loop, fullscreen, measurement); it feeds
 * measured heights and elapsed times in here and renders what comes back.
 *
 * Honesty rules:
 * - The imported text is `scriptToText(scriptDocFromBody(item.body))`
 *   VERBATIM — the Phase-3 carry pattern (see features/create). Nothing is
 *   reformatted, summarised or "tidied" on the way into the prompter.
 * - The reading-time estimate is a display estimate at a stated speaking
 *   pace (SPEAKING_WPM). It is not a measurement of the reader.
 * - This slice is read-only prompting: there is no recording anywhere in
 *   this feature.
 */
import type { ContentItem } from "@/features/create/library";
import { scriptDocFromBody } from "@/features/create/libraryMigration";
import { scriptToText } from "@/features/create/scripts";

/* --------------------------------- settings -------------------------------- */

export type PrompterPosition = "left" | "center" | "right";

export const PROMPTER_POSITIONS: readonly PrompterPosition[] = ["left", "center", "right"];

export interface PrompterSettings {
  /** Scroll speed, pixels per second. */
  speedPxPerSec: number;
  /** Reading text size, pixels. */
  fontSizePx: number;
  /** Horizontal placement of the text column. */
  position: PrompterPosition;
  /** Mirror the text (scaleX(-1)) for use through a reflective prompter rig. */
  mirror: boolean;
  /** Seconds of countdown shown before scrolling starts on a fresh play. One of COUNTDOWN_OPTIONS. */
  countdownSec: number;
}

export const DEFAULT_PROMPTER_SETTINGS: PrompterSettings = {
  speedPxPerSec: 40,
  fontSizePx: 40,
  position: "center",
  mirror: false,
  countdownSec: 3,
};

export const SPEED = { min: 5, max: 200, step: 5 } as const;
export const FONT = { min: 20, max: 96, step: 2 } as const;

/** The only countdown lengths offered, in seconds (0 = no countdown). */
export const COUNTDOWN_OPTIONS: readonly number[] = [0, 3, 5, 10];

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

/** Snap a value to the nearest allowed countdown; ties go to the lower option. */
const snapCountdown = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PROMPTER_SETTINGS.countdownSec;
  let best: number = COUNTDOWN_OPTIONS[0]!;
  for (const option of COUNTDOWN_OPTIONS) {
    if (Math.abs(option - value) < Math.abs(best - value)) best = option;
  }
  return best;
};

/**
 * Return a clean settings object: numbers clamped into their ranges,
 * position validated against the allowed set, countdown snapped to the
 * nearest allowed option, mirror coerced to a boolean. Unknown / missing
 * fields fall back to the defaults rather than leaking through.
 */
export function clampSettings(input: Partial<PrompterSettings> | null | undefined): PrompterSettings {
  const s = input ?? {};
  return {
    speedPxPerSec: clampNumber(s.speedPxPerSec, SPEED.min, SPEED.max, DEFAULT_PROMPTER_SETTINGS.speedPxPerSec),
    fontSizePx: clampNumber(s.fontSizePx, FONT.min, FONT.max, DEFAULT_PROMPTER_SETTINGS.fontSizePx),
    position: PROMPTER_POSITIONS.includes(s.position as PrompterPosition)
      ? (s.position as PrompterPosition)
      : DEFAULT_PROMPTER_SETTINGS.position,
    mirror: s.mirror === true,
    countdownSec: snapCountdown(s.countdownSec),
  };
}

/* ------------------------------- scroll maths ------------------------------ */

const saneHeight = (value: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

/** How far the content can scroll: the overflow past one viewport, never negative. */
export function maxScrollOffset(contentHeight: number, viewportHeight: number): number {
  return Math.max(0, saneHeight(contentHeight) - saneHeight(viewportHeight));
}

/**
 * Advance an offset by the elapsed time at the settings' speed. Returns the
 * offset unchanged when paused. Deliberately NOT clamped — an offset past
 * the end is how the caller detects "finished"; clampOffset bounds it for
 * display.
 */
export function advanceOffset(
  offset: number,
  elapsedMs: number,
  settings: Pick<PrompterSettings, "speedPxPerSec">,
  playing: boolean,
): number {
  if (!playing) return offset;
  const elapsed = typeof elapsedMs === "number" && Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  return offset + (settings.speedPxPerSec * elapsed) / 1000;
}

/** Bound an offset to the scrollable range [0, maxScrollOffset]. */
export function clampOffset(offset: number, contentHeight: number, viewportHeight: number): number {
  if (typeof offset !== "number" || !Number.isFinite(offset)) return 0;
  return Math.min(maxScrollOffset(contentHeight, viewportHeight), Math.max(0, offset));
}

/** Scroll progress 0..1; 0 when there is nothing scrollable. */
export function scrollProgress(offset: number, contentHeight: number, viewportHeight: number): number {
  const max = maxScrollOffset(contentHeight, viewportHeight);
  if (max <= 0) return 0;
  return clampOffset(offset, contentHeight, viewportHeight) / max;
}

/**
 * Whole seconds left to scroll at the given speed, rounded up. 0 when the
 * speed is not positive or nothing remains.
 */
export function estimatedSecondsRemaining(
  offset: number,
  contentHeight: number,
  viewportHeight: number,
  speedPxPerSec: number,
): number {
  if (typeof speedPxPerSec !== "number" || !Number.isFinite(speedPxPerSec) || speedPxPerSec <= 0) return 0;
  const remaining = maxScrollOffset(contentHeight, viewportHeight) - clampOffset(offset, contentHeight, viewportHeight);
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / speedPxPerSec);
}

/* ------------------------------ reading estimate --------------------------- */

/**
 * Typical speaking pace used for the reading-time DISPLAY estimate, in
 * words per minute. It is a stated constant, not a measurement — the UI
 * labels the estimate "at a typical speaking pace" wherever it shows it.
 */
export const SPEAKING_WPM = 150;

/** Word count of a text: whitespace-separated tokens; 0 for blank text. */
export function wordCount(text: string): number {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Estimated seconds to speak the text aloud, from its word count at
 * SPEAKING_WPM, rounded up. The settings argument is accepted so call
 * sites can pass the current settings symmetrically with the scroll
 * helpers, but it is deliberately NOT used: speaking pace does not depend
 * on scroll speed or font size.
 */
export function estimatedReadSeconds(text: string, settings?: PrompterSettings): number {
  void settings;
  const words = wordCount(text);
  if (words <= 0) return 0;
  return Math.ceil(words / (SPEAKING_WPM / 60));
}

/* --------------------------------- keyboard -------------------------------- */

/** Pixels a nudge key moves the text. */
export const NUDGE_PX = 120;

export type PrompterKeyAction =
  | "toggle-play"
  | "speed-up"
  | "speed-down"
  | "nudge-up"
  | "nudge-down"
  | "restart"
  | "exit";

export interface PrompterKeyEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/**
 * Map a keyboard event to a prompter action. Any modifier (meta / ctrl /
 * alt) held means the keypress belongs to the browser or OS, never to the
 * prompter, so it maps to null.
 */
export function keyActionFor(event: PrompterKeyEventLike): PrompterKeyAction | null {
  if (!event || event.metaKey || event.ctrlKey || event.altKey) return null;
  switch (event.key) {
    case " ":
      return "toggle-play";
    case "ArrowUp":
      return "speed-up";
    case "ArrowDown":
      return "speed-down";
    case "ArrowRight":
    case "PageDown":
      return "nudge-down";
    case "ArrowLeft":
    case "PageUp":
      return "nudge-up";
    case "Home":
      return "restart";
    case "Escape":
      return "exit";
    default:
      return null;
  }
}

/**
 * The documented shortcut list the page renders. Every `keys` entry names
 * the `KeyboardEvent.key` it stands for ("Space" stands for " "), and each
 * one maps to a non-null action through keyActionFor — the tests pin that.
 */
export const PROMPTER_SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: "Space", action: "Play or pause" },
  { keys: "ArrowUp", action: "Scroll faster" },
  { keys: "ArrowDown", action: "Scroll slower" },
  { keys: "ArrowRight", action: "Nudge the text down" },
  { keys: "PageDown", action: "Nudge the text down" },
  { keys: "ArrowLeft", action: "Nudge the text up" },
  { keys: "PageUp", action: "Nudge the text up" },
  { keys: "Home", action: "Restart from the top" },
  { keys: "Escape", action: "Leave full screen" },
];

/* ------------------------------ script import ------------------------------ */

/**
 * The prompter text for a saved content-library item: the item's body read
 * as a ScriptDoc and rendered with scriptToText, verbatim. Returns null
 * when the body isn't a script (the caller then says so rather than
 * prompting the wrong text).
 */
export function prompterTextForScriptItem(item: ContentItem): string | null {
  if (!item) return null;
  const doc = scriptDocFromBody(item.body);
  if (!doc) return null;
  return scriptToText(doc);
}
