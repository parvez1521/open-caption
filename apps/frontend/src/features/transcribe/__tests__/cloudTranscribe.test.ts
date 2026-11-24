import { describe, expect, it } from "vitest";
import { CLOUD_CHUNK_MS, CLOUD_OVERLAP_MS, mergeCloudChunkWords, planCloudChunks } from "../cloudTranscribe";

/**
 * Tests for the cloud-transcription client helper (NOT WIRED into the Studio flow yet:
 * the turbo words[] shape is unverified live, so no call site exists — see cloudTranscribe.ts).
 *
 * Chunking: Whisper works in 30 s windows, so audio is cut into 28 s chunks with a 2 s
 * overlap; a word split across a naive boundary would be lost or duplicated. The merge keeps
 * each word from exactly one chunk: the boundary between two chunks sits at the midpoint of
 * their overlap, and words are assigned to the chunk whose side of the midpoint they start on.
 */

const w = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });

describe("planCloudChunks", () => {
  it("keeps a short clip in one chunk", () => {
    expect(planCloudChunks(10_000)).toEqual([{ startMs: 0, endMs: 10_000 }]);
    expect(planCloudChunks(28_000)).toEqual([{ startMs: 0, endMs: 28_000 }]);
  });

  it("cuts a long clip into 28 s chunks with a 2 s overlap", () => {
    const chunks = planCloudChunks(60_000);
    expect(chunks).toEqual([
      { startMs: 0, endMs: 28_000 },
      { startMs: 26_000, endMs: 54_000 },
      { startMs: 52_000, endMs: 60_000 },
    ]);
    expect(CLOUD_CHUNK_MS).toBe(28_000);
    expect(CLOUD_OVERLAP_MS).toBe(2_000);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startMs).toBe(chunks[i - 1]!.endMs - CLOUD_OVERLAP_MS);
    }
  });

  it("never produces an empty or backwards chunk", () => {
    for (const dur of [1, 100, 27_999, 28_001, 55_999, 56_001, 120_000]) {
      const chunks = planCloudChunks(dur);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0]!.startMs).toBe(0);
      expect(chunks[chunks.length - 1]!.endMs).toBe(dur);
      for (const c of chunks) expect(c.endMs).toBeGreaterThan(c.startMs);
    }
  });

  it("returns no chunks for no audio", () => {
    expect(planCloudChunks(0)).toEqual([]);
  });
});

describe("mergeCloudChunkWords", () => {
  it("keeps each word once, assigning overlap words by the overlap midpoint", () => {
    // chunks [0,28000] and [26000,54000]: overlap [26000,28000], midpoint 27000.
    // "mid" starts at 26500 (before the midpoint: kept from chunk 1); "late" starts at
    // 27500 (after it: kept from chunk 2, chunk 1's copy dropped).
    const merged = mergeCloudChunkWords([
      { startMs: 0, endMs: 28_000, words: [w("early", 1000, 1500), w("mid", 26_500, 27_000), w("late", 27_500, 27_900)] },
      { startMs: 26_000, endMs: 54_000, words: [w("mid", 26_500, 27_000), w("late", 27_500, 27_900), w("after", 30_000, 30_500)] },
    ]);
    expect(merged.map((x) => x.text)).toEqual(["early", "mid", "late", "after"]);
  });

  it("drops an exact duplicate even outside the overlap", () => {
    const merged = mergeCloudChunkWords([
      { startMs: 0, endMs: 28_000, words: [w("a", 1000, 1500)] },
      { startMs: 26_000, endMs: 54_000, words: [w("a", 1000, 1500), w("b", 30_000, 30_500)] },
    ]);
    expect(merged.map((x) => x.text)).toEqual(["a", "b"]);
  });

  it("keeps words monotonic, dropping a word that starts before the previous one ends", () => {
    const merged = mergeCloudChunkWords([
      { startMs: 0, endMs: 28_000, words: [w("a", 1000, 1500), w("b", 1400, 1800), w("c", 2000, 2400)] },
    ]);
    expect(merged.map((x) => x.text)).toEqual(["a", "c"]);
  });

  it("returns words sorted by start across chunks", () => {
    const merged = mergeCloudChunkWords([
      { startMs: 0, endMs: 28_000, words: [w("b", 5000, 5500)] },
      { startMs: 26_000, endMs: 54_000, words: [w("a", 1000, 1500)] },
    ]);
    // "a" (1000) sorts before "b" (5000) even though it arrived in the later chunk
    expect(merged.map((x) => x.text)).toEqual(["a", "b"]);
  });

  it("returns [] for no chunks", () => {
    expect(mergeCloudChunkWords([])).toEqual([]);
  });
});
