/**
 * Replace footage, keep captions: the pure rules behind the swap, kept apart from
 * the panels so they are unit-testable without rendering the Studio.
 *
 * The swap itself is two moves: the new bytes land in IndexedDB under the SAME video
 * id (device.attach), and the server updates that video row in place (replace-footage)
 * — never a new video row, never a doc reset, never a new transcribe job.
 */

/** A new cut more than ~2 s longer or shorter than the old one probably re-timed the audio. */
export const FOOTAGE_SWAP_DRIFT_WARN_MS = 2000;

/** Absolute duration change, or null when either side is unknown (no warning then). */
export function footageSwapDriftMs(previousMs: number | null | undefined, nextMs: number | null | undefined): number | null {
  if (previousMs == null || nextMs == null) return null;
  return Math.abs(nextMs - previousMs);
}

/** True when the new footage is far enough from the old one that caption timing may drift. */
export function needsFootageSwapDriftWarning(previousMs: number | null | undefined, nextMs: number | null | undefined): boolean {
  const drift = footageSwapDriftMs(previousMs, nextMs);
  return drift != null && drift > FOOTAGE_SWAP_DRIFT_WARN_MS;
}

/** "1:24" for a duration — the drift warning shows old vs new side by side. */
export function formatClockMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

export type UploadOutcome = "keep" | "reset";

/**
 * What an upload means for the caption document. A footage swap uploads under the
 * SAME video id, so the doc stays; a fresh upload registers a NEW video id, so the
 * old captions belonged to the old video and go. With no current video there is
 * nothing to keep — the fresh path is the only honest one.
 */
export function resolveUploadOutcome(opts: { uploadedVideoId: string; currentVideoId: string | null }): UploadOutcome {
  if (!opts.currentVideoId) return "reset";
  return opts.uploadedVideoId === opts.currentVideoId ? "keep" : "reset";
}
