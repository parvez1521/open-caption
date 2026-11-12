import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Word } from "@capseasy/shared";
import {
  STAGE_LABELS,
  TRANSCRIBE_LIMITS,
  buildTranscriptDownloads,
  fetchTranscribeLink,
  transcriptPlainText,
  validateTranscribeFile,
  wordsToTranscriptPages,
} from "../standalone";
import { SHIPPED_LANGUAGES } from "../runtime";

vi.mock("@/services/api-client", () => ({ apiClient: { getBlob: vi.fn() } }));

import { apiClient } from "@/services/api-client";

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
    const big = new File([new Uint8Array(TRANSCRIBE_LIMITS.maxBytes + 1)], "big.mp4", { type: "video/mp4" });
    expect(validateTranscribeFile(big)).toMatch(/over the 50 MB limit/);
    expect(validateTranscribeFile(new File([], "empty.mp4", { type: "video/mp4" }))).toMatch(/empty/);
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

describe("fetchTranscribeLink (direct media links, via the same-origin proxy)", () => {
  const getBlob = apiClient.getBlob as unknown as Mock;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /** The proxy's answer for one link: the streamed bytes plus the name/type headers it sends. */
  const proxyOk = (fileName: string | null, contentType: string | null, body = "x") =>
    getBlob.mockResolvedValueOnce({
      blob: new Blob([body], { type: contentType ?? "video/mp4" }),
      fileName,
      contentType,
    });

  it("fetches a direct mp4 link through the proxy and returns it as a File for the same pipeline", async () => {
    proxyOk("clip.mp4", "video/mp4");
    const f = await fetchTranscribeLink("https://cdn.example.com/clip.mp4");
    expect(f).toBeInstanceOf(File);
    expect(f.name).toBe("clip.mp4");
    expect(f.type).toBe("video/mp4");
    expect(getBlob).toHaveBeenCalledWith("/transcribe/proxy?url=https%3A%2F%2Fcdn.example.com%2Fclip.mp4", expect.anything());
  });

  it("names a link with no media filename from its content-type", async () => {
    proxyOk(null, "audio/mpeg");
    const f = await fetchTranscribeLink("https://cdn.example.com/download?id=7");
    expect(f.name).toBe("transcribed-file.mp3");
  });

  it("refuses non-http links and bare words without calling the proxy", async () => {
    await expect(fetchTranscribeLink("notaurl")).rejects.toThrow(/http:\/\/ or https:\/\//);
    await expect(fetchTranscribeLink("ftp://example.com/clip.mp4")).rejects.toThrow(/http:\/\/ or https:\/\//);
    expect(getBlob).not.toHaveBeenCalled();
  });

  it("surfaces the proxy's over-limit error unchanged", async () => {
    getBlob.mockRejectedValueOnce(new Error("This file is over the 50 MB limit for this tool. Trim it and try again."));
    await expect(fetchTranscribeLink("https://cdn.example.com/big.mp4")).rejects.toThrow(/over the 50 MB limit/);
  });

  it("refuses a file the proxy returned over the limit even with no content-length", async () => {
    getBlob.mockResolvedValueOnce({
      blob: new Blob([new Uint8Array(TRANSCRIBE_LIMITS.maxBytes + 1)], { type: "video/mp4" }),
      fileName: "big.mp4",
      contentType: "video/mp4",
    });
    await expect(fetchTranscribeLink("https://cdn.example.com/big.mp4")).rejects.toThrow(/over the 50 MB limit/);
  });

  it("surfaces the proxy's HTTP error status plainly", async () => {
    getBlob.mockRejectedValueOnce(new Error("This link couldn't be opened (HTTP 404). Check the link and try again."));
    await expect(fetchTranscribeLink("https://cdn.example.com/gone.mp4")).rejects.toThrow(/couldn't be opened \(HTTP 404\)/);
  });

  it("surfaces the proxy's non-media error plainly", async () => {
    getBlob.mockRejectedValueOnce(new Error("This link isn't a video or audio file."));
    await expect(fetchTranscribeLink("https://example.com/page")).rejects.toThrow(/isn't a video or audio file/);
  });

  it("surfaces the proxy's unreachable-link error plainly", async () => {
    getBlob.mockRejectedValueOnce(new Error("Couldn't reach this link — check it and try again."));
    await expect(fetchTranscribeLink("https://dead.example.com/clip.mp4")).rejects.toThrow(/Couldn't reach this link/);
  });
});
