/**
 * Frame-accurate timecode for the timeline playhead (Phase 2B pro precision).
 *
 * One frame is exactly `1000 / fps` ms at the project's actual frame rate
 * (StudioPage passes `video?.fps || 30`). Non-integer fps (e.g. 29.97) counts
 * frames at its rounded frames-per-second; drop-frame timecode is out of scope.
 * Format is always HH:MM:SS:FF so a pro can read it at a glance.
 */

/** Milliseconds per frame at this frame rate. */
export const frameDurationMs = (fps: number) => 1000 / Math.max(1, fps);

/** Frames counted per second (rounded — 29.97 counts as 30). */
const framesPerSecond = (fps: number) => Math.max(1, Math.round(fps));

/** Float dust guard: 1000 / (1000/30) is 29.999999999999996, not 30 — without this a playhead sitting exactly on a frame boundary reads as the previous frame. */
const FRAME_EPSILON = 1e-6;

export function formatTimecode(ms: number, fps: number): string {
  const f = framesPerSecond(fps);
  const totalFrames = Math.max(0, Math.floor(ms / frameDurationMs(fps) + FRAME_EPSILON));
  const ff = totalFrames % f;
  const totalSeconds = Math.floor(totalFrames / f);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}

/**
 * Parse what a pro types: `HH:MM:SS:FF`, `MM:SS:FF`, `SS:FF`, or plain seconds
 * (`12.5`). Returns the millisecond position, or null when the text is not a
 * timecode at all (the caller reverts to the playhead). Out-of-range values
 * clamp to the video instead of erroring; a frame number >= fps is malformed.
 */
export function parseTimecode(input: string, fps: number, durationMs: number): number | null {
  const text = input.trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.min(durationMs, Math.max(0, Number(text) * 1000));
  const parts = text.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 4) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const ff = nums[nums.length - 1];
  if (ff >= framesPerSecond(fps)) return null;
  const ss = nums[nums.length - 2];
  const mm = nums.length >= 3 ? nums[nums.length - 3] : 0;
  const hh = nums.length >= 4 ? nums[nums.length - 4] : 0;
  if (ss >= 60 || mm >= 60) return null;
  const ms = ((hh * 3600 + mm * 60 + ss) * 1000) + ff * frameDurationMs(fps);
  return Math.min(durationMs, Math.max(0, ms));
}

/**
 * Exactly one frame forward/back from the current frame boundary: a playhead
 * sitting mid-frame steps to the next/previous frame boundary, never by a
 * rounded or guessed amount. Clamped to [0, durationMs].
 */
export function stepFrameMs(ms: number, fps: number, dir: 1 | -1, durationMs: number): number {
  const frame = frameDurationMs(fps);
  const current = Math.floor(ms / frame + FRAME_EPSILON);
  const next = dir > 0 ? current + 1 : current - 1;
  return Math.min(durationMs, Math.max(0, next * frame));
}
