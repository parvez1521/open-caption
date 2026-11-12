import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("fetchTranscribeLink (direct media links)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const headers = (init: Record<string, string>) => new Headers(init);
  /** Mock fetch: HEAD/GET answers come from `get`, the no-cors probe from `probe` (default: fail). */
  const mockFetch = (get: (url: string, init?: RequestInit) => Promise<Response>, probe?: () => Promise<Response>) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (init?.mode === "no-cors") {
          if (probe) return probe();
          throw new TypeError("Failed to fetch");
        }
        return get(url, init);
      }),
    );
    return calls;
  };

  it("fetches a direct mp4 link and returns it as a File for the same pipeline", async () => {
    const calls = mockFetch(async (_url, init) => {
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: headers({ "content-length": "1000" }) });
      return new Response(new Blob(["x"], { type: "video/mp4" }), { status: 200, headers: headers({ "content-type": "video/mp4", "content-length": "1000" }) });
    });
    const f = await fetchTranscribeLink("https://cdn.example.com/clip.mp4");
    expect(f).toBeInstanceOf(File);
    expect(f.name).toBe("clip.mp4");
    expect(f.type).toBe("video/mp4");
    expect(calls.some((c) => c.init?.method === "HEAD")).toBe(true);
  });

  it("names a link with no media filename from its content-type", async () => {
    mockFetch(async (_url, init) => {
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: headers({}) });
      return new Response(new Blob(["x"], { type: "audio/mpeg" }), { status: 200, headers: headers({ "content-type": "audio/mpeg" }) });
    });
    const f = await fetchTranscribeLink("https://cdn.example.com/download?id=7");
    expect(f.name).toBe("transcribed-file.mp3");
  });

  it("refuses a link the HEAD pre-check already shows is over the limit, without GET", async () => {
    const calls = mockFetch(async (_url, init) => {
      if (init?.method === "HEAD")
        return new Response(null, { status: 200, headers: headers({ "content-length": String(TRANSCRIBE_LIMITS.maxBytes + 1) }) });
      return new Response(new Blob(["x"]), { status: 200 });
    });
    await expect(fetchTranscribeLink("https://cdn.example.com/big.mp4")).rejects.toThrow(/over the 50 MB limit/);
    expect(calls.some((c) => c.init?.method !== "HEAD")).toBe(false);
  });

  it("refuses a link whose GET says it is over the limit", async () => {
    mockFetch(async (_url, init) => {
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: headers({}) });
      return new Response(new Blob(["x"]), { status: 200, headers: headers({ "content-type": "video/mp4", "content-length": String(TRANSCRIBE_LIMITS.maxBytes + 1) }) });
    });
    await expect(fetchTranscribeLink("https://cdn.example.com/big.mp4")).rejects.toThrow(/over the 50 MB limit/);
  });

  it("refuses a link whose body is over the limit even with no content-length", async () => {
    // Raw bytes as the Response body: a jsdom Blob handed to undici's Response loses its size,
    // so the oversize body has to be built from bytes, not from a Blob.
    mockFetch(async (_url, init) => {
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: headers({}) });
      return new Response(new Uint8Array(TRANSCRIBE_LIMITS.maxBytes + 1), {
        status: 200,
        headers: headers({ "content-type": "video/mp4" }),
      });
    });
    await expect(fetchTranscribeLink("https://cdn.example.com/big.mp4")).rejects.toThrow(/over the 50 MB limit/);
  });

  it("reports an HTTP error status plainly", async () => {
    mockFetch(async (_url, init) => {
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: headers({}) });
      return new Response("nope", { status: 404, headers: headers({}) });
    });
    await expect(fetchTranscribeLink("https://cdn.example.com/gone.mp4")).rejects.toThrow(/couldn't be opened \(HTTP 404\)/);
  });

  it("refuses a link that isn't a video or audio file", async () => {
    mockFetch(async (_url, init) => {
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: headers({}) });
      return new Response("<html/>", { status: 200, headers: headers({ "content-type": "text/html" }) });
    });
    await expect(fetchTranscribeLink("https://example.com/page")).rejects.toThrow(/isn't a video or audio file/);
  });

  it("tells a dead link from a CORS block: both fetches fail means unreachable", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchTranscribeLink("https://dead.example.com/clip.mp4")).rejects.toThrow(/Couldn't reach this link/);
  });

  it("tells a dead link from a CORS block: no-cors probe succeeding means the host blocks downloads", async () => {
    mockFetch(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => new Response(null, { status: 200 }),
    );
    await expect(fetchTranscribeLink("https://blocked.example.com/clip.mp4")).rejects.toThrow(/blocks downloads/);
  });

  it("refuses non-http links and bare words", async () => {
    await expect(fetchTranscribeLink("notaurl")).rejects.toThrow(/http:\/\/ or https:\/\//);
    await expect(fetchTranscribeLink("ftp://example.com/clip.mp4")).rejects.toThrow(/http:\/\/ or https:\/\//);
  });
});
