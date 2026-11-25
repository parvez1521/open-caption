/**
 * First-run mini tutorial: pure helpers (seen-flag + step navigation) kept separate from the React
 * component so they can be unit-tested without a DOM tour running. The tour is shown exactly once:
 * the flag is set when the user finishes OR skips, and never unset.
 */

// v3 (2026-11-25): three positioning steps were added (single move,
// Select All, multi drag-select), so the updated tour shows once more for
// existing users (v2 holders have the old flag, never this one).
export const TUTORIAL_SEEN_KEY = "ce:tutorial-seen:v3";

// Permanent opt-out (owner 2026-11-25): "Never show again" on the tour's
// final step. A separate key from the versioned seen flag, so it survives
// seen-flag bumps (v4 would re-show to everyone except never-opted-out users).
export const TUTORIAL_NEVER_KEY = "ce:tutorial-never-show";

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
    body: "Tap a word to correct it. Make it the key word. Or change its timing. Nothing is locked in.",
  },
  {
    id: "template",
    anchor: "templates",
    title: "Pick a template",
    body: "Templates are animated, not static. Tap one in the Templates tab. Watch it play on your words.",
  },
  {
    id: "timing",
    anchor: "shift-all",
    title: "Nudge the timing",
    body: "Drag across words to select them. Then drag the selection left or right to retime it. Or shift every caption at once here. Tap a quick nudge. Or type the seconds and Apply shift.",
  },
  {
    id: "move-caption",
    anchor: "move-caption",
    title: "Move one caption",
    body: "Drag the caption itself on the video, or the handle beside it, to move it. With nothing selected it moves every caption together.",
  },
  {
    id: "select-all-captions",
    anchor: "select-all-captions",
    title: "Select all captions",
    body: "Tap Select all captions in the Captions tab to pick every caption at once. Then any move applies to all of them.",
  },
  {
    id: "multi-select-captions",
    anchor: "multi-select-captions",
    title: "Move several captions",
    body: "Tap Multiple captions, then drag across the timeline to pick just those captions. Drag a caption to move only the picked ones. Esc clears the pick.",
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
    body: "Export an MP4 with the captions burned in. Or download an SRT file. You'll need a free account to export — it takes a minute to create, and your work carries over. Your edits are saved automatically.",
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

/**
 * Should the auto tour start? Pure gate so it can be unit-tested: the tour
 * belongs to the editing room, never the upload screen (owner 2026-11-25) —
 * it starts only once a video is actually on this device (videoReady) AND
 * captions have landed (the session just saved, or an adopted document
 * already has words). A saved document alone must not start it while the
 * upload option is showing (video gone / being replaced / still uploading).
 */
export function shouldStartTutorial(opts: { phase?: string | null; hasWords: boolean; videoReady: boolean }): boolean {
  if (!opts.videoReady) return false;
  return opts.phase === "saved" || opts.hasWords;
}

/** True when the tour has never been finished or skipped on this browser. */
export function shouldShowTutorial(storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    // the permanent opt-out wins over everything, including version bumps
    if (storage.getItem(TUTORIAL_NEVER_KEY) != null) return false;
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

/** True when the user permanently opted out via "Never show again". */
export function tutorialNeverShown(storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(TUTORIAL_NEVER_KEY) != null;
  } catch {
    return false;
  }
}

/** Record the permanent opt-out, so the auto tour never starts again. */
export function markTutorialNever(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(TUTORIAL_NEVER_KEY, "1");
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
