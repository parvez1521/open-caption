/**
 * AI Clipper durable-run checkpoints — pure record builders.
 *
 * Storage itself lives in features/upload/localVideos (the same IndexedDB
 * database as transcription progress: `saveClipperRun` / `getClipperRun` /
 * `deleteClipperRun`), mirroring the transcription session's
 * saveProgress/getProgress shape. These helpers only build and merge the
 * record, so the checkpoint logic is testable without IndexedDB.
 */
import type { ClipperRunCheckpoint } from "@/features/upload/localVideos";
import type { HighlightClip, RawCandidate } from "@/features/clipper/highlights/types";

export function newRunCheckpoint(projectId: string, windowsTotal: number): ClipperRunCheckpoint {
  return {
    id: projectId,
    runId: `clip-${Math.random().toString(36).slice(2, 8)}`,
    status: "running",
    windowsDone: 0,
    windowsTotal,
    seedWindows: Array.from({ length: windowsTotal }, () => null),
    clips: [],
    notes: [],
    savedAt: Date.now(),
  };
}

/** Record one finished window's candidates (also `[]` when the window failed — a resume does not re-read it). */
export function withWindowCheckpoint(
  record: ClipperRunCheckpoint,
  windowIndex: number,
  candidates: RawCandidate[],
): ClipperRunCheckpoint {
  const seedWindows = record.seedWindows.slice();
  seedWindows[windowIndex] = candidates;
  return {
    ...record,
    seedWindows,
    windowsDone: seedWindows.filter((w) => w !== null).length,
    savedAt: Date.now(),
  };
}

export function withFinishedCheckpoint(
  record: ClipperRunCheckpoint,
  clips: HighlightClip[],
  notes: string[],
): ClipperRunCheckpoint {
  return { ...record, status: "done", clips, notes, savedAt: Date.now() };
}

export function withCancelledCheckpoint(record: ClipperRunCheckpoint): ClipperRunCheckpoint {
  return { ...record, status: "cancelled", savedAt: Date.now() };
}

/** A checkpoint worth offering Resume for: an unfinished run that already read at least one window. */
export function isResumable(record: ClipperRunCheckpoint | null): record is ClipperRunCheckpoint {
  return !!record && record.status !== "done" && record.windowsDone > 0;
}

/** Seed windows for the engine: only the finished windows' candidates; unfinished windows stay `null`. */
export function resumeSeeds(record: ClipperRunCheckpoint): (RawCandidate[] | null)[] {
  return record.seedWindows.slice();
}
