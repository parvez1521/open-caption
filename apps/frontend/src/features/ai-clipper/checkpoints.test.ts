import { describe, expect, it } from "vitest";
import {
  isResumable,
  newRunCheckpoint,
  resumeSeeds,
  withCancelledCheckpoint,
  withFinishedCheckpoint,
  withWindowCheckpoint,
} from "./checkpoints";
import type { HighlightClip, RawCandidate } from "@/features/clipper/highlights/types";

/**
 * AI Clipper Slice 1 — durable runs: the checkpoint record itself (pure
 * builders; the IndexedDB read/write lives in features/upload/localVideos
 * alongside transcription progress and has no fake-indexeddb harness here).
 */

const candidate = (startWord: number): RawCandidate => ({
  startWord,
  endWord: startWord + 40,
  title: "A moment",
  summary: "About this moment.",
  reason: "Strong hook.",
  modelScore: 80,
  breakdown: { hook: 80, value: 80, storyCompleteness: 80, engagement: 80 },
  windowIndex: 0,
});

const finishedClip = (): HighlightClip => ({
  id: "ai-0-30000",
  startWord: 0,
  endWord: 40,
  startMs: 0,
  endMs: 30000,
  speechStartMs: 0,
  speechEndMs: 30000,
  durationMs: 30000,
  title: "A moment",
  hook: "The first sentence.",
  summary: "About this moment.",
  reason: "Strong hook.",
  score: 83,
  breakdown: [],
  rank: 1,
  text: "The first sentence.",
});

describe("clipper run checkpoints", () => {
  it("starts running with every window unread", () => {
    const record = newRunCheckpoint("project-1", 3);
    expect(record.status).toBe("running");
    expect(record.windowsDone).toBe(0);
    expect(record.seedWindows).toEqual([null, null, null]);
    expect(record.clips).toEqual([]);
  });

  it("records each finished window and counts it — including a failed window saved as empty", () => {
    let record = newRunCheckpoint("project-1", 3);
    record = withWindowCheckpoint(record, 0, [candidate(0)]);
    expect(record.windowsDone).toBe(1);
    expect(record.seedWindows[0]).toHaveLength(1);
    record = withWindowCheckpoint(record, 2, []);
    expect(record.windowsDone).toBe(2);
    expect(record.seedWindows[2]).toEqual([]);
    expect(record.seedWindows[1]).toBeNull();
  });

  it("is resumable only when an unfinished run already read a window", () => {
    expect(isResumable(null)).toBe(false);
    expect(isResumable(newRunCheckpoint("p", 2))).toBe(false);
    const partial = withWindowCheckpoint(newRunCheckpoint("p", 2), 0, [candidate(0)]);
    expect(isResumable(partial)).toBe(true);
    expect(isResumable(withFinishedCheckpoint(partial, [finishedClip()], []))).toBe(false);
    expect(isResumable(withCancelledCheckpoint(partial))).toBe(true);
  });

  it("a cancelled checkpoint keeps its seeds so a resume re-reads only unfinished windows", () => {
    const partial = withWindowCheckpoint(newRunCheckpoint("p", 2), 0, [candidate(0)]);
    const cancelled = withCancelledCheckpoint(partial);
    expect(cancelled.status).toBe("cancelled");
    expect(resumeSeeds(cancelled)).toEqual([[candidate(0)], null]);
  });

  it("a finished checkpoint stores the clips and stops offering resume", () => {
    const done = withFinishedCheckpoint(newRunCheckpoint("p", 1), [finishedClip()], ["Re-ranked 1 of 1 clips."]);
    expect(done.status).toBe("done");
    expect(done.clips).toHaveLength(1);
    expect(done.notes).toEqual(["Re-ranked 1 of 1 clips."]);
    expect(isResumable(done)).toBe(false);
  });
});
