import { describe, expect, it } from "vitest";
import type { Word } from "@capseasy/shared";
import {
  STAGE_LABELS,
  TRANSCRIBE_LIMITS,
  buildTranscriptDownloads,
  transcriptPlainText,
  validateTranscribeFile,
  wordsToTranscriptPages,
} from "../standalone";
import { SHIPPED_LANGUAGES } from "../runtime";

const w = (text: string, startMs: number, endMs: number): Word => ({
  id: `w-${startMs}`,
  text,
  startMs,
  endMs,
  confidence: 1,
});

describe("standalone transcribe", () => {
  it("ships all 14 transcription languages", () => {
    expect(SHIPPED_LANGUAGES.map((m) => m.key)).toEqual([
      "en",
      "hinglish",
      "hindi",
      "tamil",
      "telugu",
      "bengali",
      "marathi",
      "punjabi",
      "urdu",
      "spanish",
      "french",
      "german",
      "arabic",
      "portuguese",
    ]);
  });

  it("accepts video/audio files within the Free limit, refuses the rest", () => {
    const ok = new File(["x"], "clip.mp4", { type: "video/mp4" });
    expect(validateTranscribeFile(ok)).toBeNull();
    const audio = new File(["x"], "voice.mp3", { type: "audio/mpeg" });
    expect(validateTranscribeFile(audio)).toBeNull();
    // no MIME type at all (some browsers): the extension still counts
    const noType = new File(["x"], "voice.wav", { type: "" });
    expect(validateTranscribeFile(noType)).toBeNull();
    expect(validateTranscribeFile(new File(["x"], "notes.pdf", { type: "application/pdf" }))).toMatch(/video or audio/);
    // Oversize without allocating 2 GB in the test: the validator only reads
    // file.size, so a small file with an oversize size exercises the same path.
    const big = new File(["x"], "big.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: TRANSCRIBE_LIMITS.maxBytes + 1 });
    expect(validateTranscribeFile(big)).toMatch(/over the 2 GB limit/);
    expect(validateTranscribeFile(new File([], "empty.mp4", { type: "video/mp4" }))).toMatch(/empty/);
  });

  it("caps /transcribe at 2 GB and 15 minutes (owner decision 2026-11-14)", () => {
    expect(TRANSCRIBE_LIMITS.maxBytes).toBe(2 * 1024 * 1024 * 1024);
    expect(TRANSCRIBE_LIMITS.maxDurationSec).toBe(15 * 60);
  });

  it("groups words into timed segments: silence breaks, long runs split", () => {
    const words = [
      w("hello", 0, 300),
      w("world", 400, 700),
      // 2 s silence -> new segment
      w("again", 2700, 3000),
      w("and", 3100, 3300),
    ];
    const pages = wordsToTranscriptPages(words);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.startMs).toBe(0);
    expect(pages[0]!.endMs).toBe(700);
    expect(pages[1]!.words.map((x) => x.text)).toEqual(["again", "and"]);
    expect(pages[0]!.lines).toEqual([pages[0]!.words]);
    expect(transcriptPlainText(pages)).toBe("hello world\nagain and");
  });

  it("splits a segment that runs past the length cap", () => {
    // 20 words, 400 ms apart: spans 8 s, so the cap cuts it in two
    const words = Array.from({ length: 20 }, (_, i) => w(`w${i}`, i * 400, i * 400 + 300));
    const pages = wordsToTranscriptPages(words);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => p.words)).toHaveLength(20);
    // timings stay ordered and non-overlapping across the split
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i]!.startMs).toBeGreaterThanOrEqual(pages[i - 1]!.endMs);
    }
  });

  it("returns empty pages for an empty transcript", () => {
    expect(wordsToTranscriptPages([])).toEqual([]);
    expect(transcriptPlainText([])).toBe("");
    expect(buildTranscriptDownloads([])).toEqual({ txt: "", srt: "", vtt: "WEBVTT\n\n" });
  });

  it("builds TXT, SRT and VTT from the same words", () => {
    const words = [w("hello", 0, 300), w("world", 400, 700), w("again", 2700, 3000)];
    const out = buildTranscriptDownloads(words);
    expect(out.txt).toBe("hello world\nagain");
    expect(out.srt).toContain("00:00:00,000 --> 00:00:00,700\nhello world");
    expect(out.srt).toContain("00:00:02,700 --> 00:00:03,000\nagain");
    expect(out.vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(out.vtt).toContain("00:00:00.000 --> 00:00:00.700\nhello world");
  });

  it("labels every worker stage in plain words", () => {
    expect(Object.keys(STAGE_LABELS).sort()).toEqual(["audio", "download", "load", "transcribe"]);
    expect(STAGE_LABELS.download).toMatch(/Download/);
    expect(STAGE_LABELS.transcribe).toMatch(/Transcrib/);
  });
});
