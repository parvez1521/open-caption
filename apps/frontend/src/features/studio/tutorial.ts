/**
 * First-run mini tutorial: pure helpers (seen-flag + step navigation) kept separate from the React
 * component so they can be unit-tested without a DOM tour running. The tour is shown exactly once:
 * the flag is set when the user finishes OR skips, and never unset.
 */

export const TUTORIAL_SEEN_KEY = "ce:tutorial-seen:v1";

export interface TutorialStep {
  id: string;
  /** value of the `data-tour` attribute on the studio element this step highlights */
  anchor: string;
  title: string;
  body: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "ready",
    anchor: "captions",
    title: "Your captions are ready",
    body: "We wrote your captions word by word, timed to the speech. Every word here can be edited.",
  },
  {
    id: "fix-word",
    anchor: "captions",
    title: "Fix any word",
    body: "Tap a word to correct it, make it the key word, or change its timing. Nothing is locked in.",
  },
  {
    id: "template",
    anchor: "templates",
    title: "Pick a template",
    body: "Templates are animated, not static. Tap one in the Templates tab and watch it play on your words.",
  },
  {
    id: "timing",
    anchor: "captions",
    title: "Nudge the timing",
    body: "Tick the checkbox on any line to select it, then shift the selected lines together — or shift all captions at once from the top of this panel.",
  },
  {
    id: "style",
    anchor: "style",
    title: "Make it yours",
    body: "Fonts, colours, outlines and position live in the Style tab. Changes show on the preview straight away.",
  },
  {
    id: "export",
    anchor: "export",
    title: "Export",
    body: "Export an MP4 with the captions burned in, or download an SRT file. Your edits are saved automatically.",
  },
];

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** True when the tour has never been finished or skipped on this browser. */
export function shouldShowTutorial(storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(TUTORIAL_SEEN_KEY) == null;
  } catch {
    return false;
  }
}

/** Record that the tour was finished or skipped, so it never shows again. */
export function markTutorialSeen(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(TUTORIAL_SEEN_KEY, "1");
  } catch {
    // storage unavailable (private mode quota etc.): the tour simply may show again next time
  }
}

/** Step navigation, clamped to the tour: Back on the first step and Next on the last stay put. */
export function stepIndexAfter(current: number, direction: 1 | -1, total: number = TUTORIAL_STEPS.length): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, current + direction));
}

export const isLastStep = (index: number, total: number = TUTORIAL_STEPS.length): boolean => index >= total - 1;
export const isFirstStep = (index: number): boolean => index <= 0;
