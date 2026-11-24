// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Tests for the Cloudflare Whisper-large-v3-turbo speech path (lib/api/cloudSpeech.ts).
 *
 * What is verified here and what is NOT: the turbo `words[]` response field is UNVERIFIED
 * live — the documented turbo output lists `text`, `word_count`, `segments` and `vtt`, with
 * no `words` field (the older `@cf/openai/whisper` model is the one documented with `words`).
 * So the parser below treats `words` as a candidate shape only: it accepts a words array
 * solely when every entry validates (finite start/end, start < end, monotonic, inside the
 * chunk), and otherwise falls back to segment timestamps, then to plain text — it NEVER
 * invents word times. A live call against the real endpoint is still owed before the UI
 * may use word-level times from this route.
 */

import { parseWhisperTurboResult, runCloudSpeech, WHISPER_TURBO_MODEL } from "../cloudSpeech";
import { CloudAiError } from "../cloudAi";

describe("parseWhisperTurboResult", () => {
  it("names the turbo model id", () => {
    expect(WHISPER_TURBO_MODEL).toBe("@cf/openai/whisper-large-v3-turbo");
  });

  it("accepts a valid words array (seconds -> ms, chunk offset applied)", () => {
    const out = parseWhisperTurboResult(
      { result: { text: "hello there", word_count: 2, words: [{ word: "hello", start: 0.1, end: 0.4 }, { word: "there", start: 0.5, end: 0.9 }] } },
      { chunkStartMs: 1000 },
    );
    expect(out.wordTimestamps).toBe(true);
    expect(out.words).toEqual([
      { text: "hello", startMs: 1100, endMs: 1400 },
      { text: "there", startMs: 1500, endMs: 1900 },
    ]);
    expect(out.text).toBe("hello there");
  });

  it("accepts the timestamp-pair variant for words", () => {
    const out = parseWhisperTurboResult({ result: { text: "hi", words: [{ word: "hi", timestamp: [0, 0.3] }] } });
    expect(out.wordTimestamps).toBe(true);
    expect(out.words).toEqual([{ text: "hi", startMs: 0, endMs: 300 }]);
  });

  it("falls back to segments when words are absent (the documented turbo shape)", () => {
    const out = parseWhisperTurboResult({
      result: {
        text: "hello there",
        segments: [
          { start: 0.1, end: 0.9, text: "hello there" },
        ],
      },
    });
    expect(out.wordTimestamps).toBe(false);
    expect(out.words).toEqual([]);
    expect(out.segmentTimestamps).toBe(true);
    expect(out.segments).toEqual([{ text: "hello there", startMs: 100, endMs: 900 }]);
  });

  it("falls back to segments when words are malformed — never invents word times", () => {
    // start after end on the second word: the whole words array is unusable
    const out = parseWhisperTurboResult({
      result: {
        text: "one two",
        words: [
          { word: "one", start: 0, end: 0.4 },
          { word: "two", start: 0.9, end: 0.5 },
        ],
        segments: [{ start: 0, end: 0.9, text: "one two" }],
      },
    });
    expect(out.wordTimestamps).toBe(false);
    expect(out.words).toEqual([]);
    expect(out.segmentTimestamps).toBe(true);
  });

  it("rejects words whose times look like milliseconds, not seconds", () => {
    const out = parseWhisperTurboResult({
      result: { text: "hi", words: [{ word: "hi", start: 100, end: 400 }] },
      chunkDurationMs: 30_000,
    });
    expect(out.wordTimestamps).toBe(false);
    expect(out.words).toEqual([]);
  });

  it("rejects non-monotonic words and words past the chunk", () => {
    const backwards = parseWhisperTurboResult({
      result: { text: "a b", words: [{ word: "a", start: 0.5, end: 0.8 }, { word: "b", start: 0.2, end: 0.4 }] },
    });
    expect(backwards.wordTimestamps).toBe(false);
    const pastEnd = parseWhisperTurboResult(
      { result: { text: "a", words: [{ word: "a", start: 29, end: 32 }] } },
      { chunkDurationMs: 30_000 },
    );
    expect(pastEnd.wordTimestamps).toBe(false);
  });

  it("returns text only when neither words nor segments are usable", () => {
    const out = parseWhisperTurboResult({ result: { text: "just text", words: "nope", segments: [{ start: "x", end: 1 }] } });
    expect(out.text).toBe("just text");
    expect(out.wordTimestamps).toBe(false);
    expect(out.segmentTimestamps).toBe(false);
    expect(out.words).toEqual([]);
    expect(out.segments).toEqual([]);
  });

  it("derives text from segments when the text field is missing", () => {
    const out = parseWhisperTurboResult({ result: { segments: [{ start: 0, end: 0.5, text: "hello" }] } });
    expect(out.text).toBe("hello");
    expect(out.segmentTimestamps).toBe(true);
  });

  it("reads an unwrapped body (no result envelope)", () => {
    const out = parseWhisperTurboResult({ text: "hi", words: [{ word: "hi", start: 0, end: 0.3 }] });
    expect(out.wordTimestamps).toBe(true);
    expect(out.text).toBe("hi");
  });

  it("returns empty text and no times for a null body", () => {
    const out = parseWhisperTurboResult(null);
    expect(out.text).toBe("");
    expect(out.wordTimestamps).toBe(false);
    expect(out.segmentTimestamps).toBe(false);
  });
});

describe("runCloudSpeech", () => {
  const config = { apiKey: "test-key", endpoint: "https://example.test/ai/run/turbo" };
  const okBody = { result: { text: "hello", words: [{ word: "hello", start: 0, end: 0.4 }] } };
  const fetchOk = (body: unknown = okBody) =>
    vi.fn(async () => new Response(JSON.stringify({ success: true, result: (body as { result: unknown }).result }), { status: 200, headers: { "content-type": "application/json" } }));

  it("posts base64 audio as JSON and returns parsed words", async () => {
    const fetchImpl = fetchOk();
    const out = await runCloudSpeech("aGVsbG8=", { config, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, { body: string }];
    expect(url).toBe(config.endpoint);
    expect(JSON.parse(init.body)).toEqual({ audio: "aGVsbG8=" });
    expect(out.wordTimestamps).toBe(true);
    expect(out.words).toEqual([{ text: "hello", startMs: 0, endMs: 400 }]);
  });

  it("passes language through when given", async () => {
    const fetchImpl = fetchOk();
    await runCloudSpeech("aGVsbG8=", { config, fetchImpl, language: "hi" });
    const [, langInit] = fetchImpl.mock.calls[0]! as unknown as [string, { body: string }];
    expect(JSON.parse(langInit.body)).toEqual({ audio: "aGVsbG8=", language: "hi" });
  });

  it("throws when unconfigured", async () => {
    await expect(runCloudSpeech("aGVsbG8=", { config: null, fetchImpl: fetchOk() })).rejects.toThrow(CloudAiError);
  });

  it("maps HTTP errors to CloudAiError with status", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad key", { status: 401 }));
    await expect(runCloudSpeech("aGVsbG8=", { config, fetchImpl })).rejects.toMatchObject({ status: 401, kind: "http" });
  });

  it("maps a network failure to kind network and an abort to kind timeout", async () => {
    await expect(runCloudSpeech("aGVsbG8=", { config, fetchImpl: vi.fn(async () => { throw new Error("down"); }) })).rejects.toMatchObject({ kind: "network" });
    const aborting = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    await expect(runCloudSpeech("aGVsbG8=", { config, fetchImpl: aborting as unknown as typeof fetch, timeoutMs: 1 })).rejects.toMatchObject({ kind: "timeout" });
  });

  it("throws kind empty when the answer carries no text and no times", async () => {
    const fetchImpl = fetchOk({ result: {} });
    await expect(runCloudSpeech("aGVsbG8=", { config, fetchImpl })).rejects.toMatchObject({ kind: "empty" });
  });
});
