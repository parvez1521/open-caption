/**
 * Diagnostic for the timeline edge-resize bug (owner video 2026-11-13):
 * the Timeline fires onRetimeRun, retimeRun stretches, useStudio keeps the edit —
 * so the last untested derivation is pages -> composition clips. This runs the
 * REAL derivePages + toComposition on the retimed doc and asserts the caption
 * clip for the stretched card ends at the retimed end.
 */
import { describe, expect, it } from "vitest";
import { CaptionDocSchema, defaultSettings, type CaptionDoc, type Word } from "@capseasy/shared";
import { derivePages, retimeRun } from "@motion-ai/caption-engine/core";
import { toComposition } from "../composition";

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });
const initialDoc: CaptionDoc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    word("w1", "hi", 14400, 14700),
    word("w2", "jagah", 14700, 15000),
    word("w3", "rah", 15000, 15300),
    word("w4", "rahi", 15300, 15600),
    word("w5", "ho,", 15600, 15900),
    word("w6", "mein", 20300, 20600),
    word("w7", "aur", 20600, 20900),
    word("w8", "raat", 20900, 21200),
  ],
});

describe("retimed doc derives an extended caption clip", () => {
  it("derivePages + toComposition carry the stretched end", () => {
    // The owner's project shows ONE 5-word card, so maxWordsPerCard must
    // allow it (default 3 splits the group into 3+2 — a settings difference,
    // not a revert). With one card, the page/clip end follows the retimed
    // word end (plus holdMs).
    const settings = { ...defaultSettings(), maxWordsPerCard: 6 };
    const retimed = retimeRun(initialDoc, "w1", "w5", 14400, 17398, false);
    expect(retimed.words[4]!.endMs).toBe(17398);

    const pages = derivePages(retimed, settings);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.endMs).toBeGreaterThanOrEqual(17398);
    expect(pages[0]!.words[pages[0]!.words.length - 1]!.endMs).toBe(17398);

    const comp = toComposition({
      media: { videoId: "v1", filename: "v.mp4", size: 1000, width: 1080, height: 1920, fps: 30, durationMs: 31500 },
      doc: retimed,
      pages,
      settings,
      durationMs: 31500,
    });
    const clips = comp.tracks.find((t) => t.kind === "captions")!.clips;
    expect(clips).toHaveLength(2);
    expect(clips[0]!.endMs).toBeGreaterThanOrEqual(17398);
    expect(clips[0]!.kind).toBe("caption");
    if (clips[0]!.kind === "caption") {
      expect(clips[0]!.wordIds).toEqual(["w1", "w2", "w3", "w4", "w5"]);
    }
  });
});
