// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route tests for POST /api/v1/transcribe/whisper-turbo: the client sends ONE audio chunk
 * (base64, up to ~30 s) and the route runs Cloudflare Workers AI Whisper-large-v3-turbo
 * server-side, returning text plus word or segment timestamps when the answer carries
 * usable ones. The in-browser Whisper-base path stays the fallback/offline path and is
 * never removed. An unconfigured deployment answers configured:false with no model call.
 * The failure wording mirrors POST /api/v1/ai-edit/generate-image: a dead key (401/403)
 * says the key isn't working, a 429 says the daily limit is used up, a 410 says the model
 * was retired. The turbo words[] field is UNVERIFIED live — the route returns whatever
 * times the parser could validate and flags which kind they are, so the client falls back
 * to segments or to the in-browser path instead of trusting invented word times.
 */

const state = vi.hoisted(() => ({ configured: true, failUpstream: false, failStatus: null as number | null, failKind: null as string | null }));
const spoken = vi.hoisted(() => ({ calls: [] as Array<{ audioBase64: string; language?: string }> }));
const rateLimitCalls = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  rateLimit: async (...args: unknown[]) => {
    rateLimitCalls.calls.push(args);
  },
}));
const errors = vi.hoisted(() => ({
  CloudAiError: class extends Error {
    status?: number;
    kind?: string;
    constructor(message: string, status?: number, kind?: string) {
      super(message);
      this.name = "CloudAiError";
      this.status = status;
      this.kind = kind ?? (status !== undefined ? "http" : undefined);
    }
  },
}));

vi.mock("@/lib/api/cloudAi", () => ({
  CloudAiError: errors.CloudAiError,
}));
vi.mock("@/lib/api/cloudSpeech", () => ({
  cloudSpeechConfig: () =>
    state.configured ? { apiKey: "test-key", endpoint: "https://example.test/ai/run/turbo" } : null,
  runCloudSpeech: async (audioBase64: string, opts?: { language?: string }) => {
    if (state.failUpstream) {
      if (state.failStatus !== null || state.failKind !== null) {
        throw new errors.CloudAiError(
          state.failKind ? `The free AI speech request ${state.failKind}.` : `The free AI service answered with HTTP ${state.failStatus}.`,
          state.failStatus ?? undefined,
          state.failKind ?? undefined,
        );
      }
      throw new Error("upstream down");
    }
    spoken.calls.push({ audioBase64, language: opts?.language });
    return {
      text: "hello there",
      words: [{ text: "hello", startMs: 100, endMs: 400 }],
      segments: [{ text: "hello there", startMs: 100, endMs: 900 }],
      wordTimestamps: true,
      segmentTimestamps: true,
    };
  },
}));

import { GET, POST } from "../route";

const body = (over: Record<string, unknown> = {}) =>
  new Request("https://example.test/api/v1/transcribe/whisper-turbo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audioBase64: "aGVsbG8=", ...over }),
  });

beforeEach(() => {
  state.configured = true;
  state.failUpstream = false;
  state.failStatus = null;
  state.failKind = null;
  spoken.calls = [];
  rateLimitCalls.calls = [];
});

describe("GET /api/v1/transcribe/whisper-turbo", () => {
  it("reports configured", async () => {
    const res = await GET(new Request("https://example.test/api/v1/transcribe/whisper-turbo"));
    expect(await res.json()).toEqual({ success: true, data: { configured: true } });
  });

  it("reports unconfigured when the free AI credentials are unset", async () => {
    state.configured = false;
    const res = await GET(new Request("https://example.test/api/v1/transcribe/whisper-turbo"));
    expect(await res.json()).toEqual({ success: true, data: { configured: false } });
  });
});

describe("POST /api/v1/transcribe/whisper-turbo", () => {
  it("transcribes one chunk and returns its validated times", async () => {
    const res = await POST(body());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ configured: true, text: "hello there", wordTimestamps: true });
    expect(json.data.words).toEqual([{ text: "hello", startMs: 100, endMs: 400 }]);
    expect(spoken.calls).toHaveLength(1);
  });

  it("rate-limits per user and site-wide", async () => {
    await POST(body());
    expect(rateLimitCalls.calls).toEqual([
      ["user-1", "transcribe_whisper_turbo", 20, 86_400],
      ["site", "transcribe_whisper_turbo_site", 100, 86_400],
    ]);
  });

  it("answers configured:false with no model call when unconfigured", async () => {
    state.configured = false;
    const res = await POST(body());
    expect(await res.json()).toEqual({ success: true, data: { configured: false } });
    expect(spoken.calls).toHaveLength(0);
    expect(rateLimitCalls.calls).toHaveLength(0);
  });

  it("rejects an empty audio body and a non-base64 body", async () => {
    const empty = await POST(body({ audioBase64: "" }));
    expect(empty.status).toBe(422);
    const junk = await POST(body({ audioBase64: "not base64!!!" }));
    expect(junk.status).toBe(422);
  });

  it("rejects a chunk start past the clip", async () => {
    const res = await POST(body({ chunkStartMs: 3_600_001 }));
    expect(res.status).toBe(422);
  });

  it("says the key isn't working on 401/403 and the daily limit is used up on 429", async () => {
    state.failUpstream = true;
    state.failStatus = 401;
    const dead = await POST(body());
    expect(dead.status).toBe(502);
    expect((await dead.json()).error.message).toMatch(/key isn't working/);
    state.failStatus = 429;
    const spent = await POST(body());
    const spentJson = await spent.json();
    expect(spentJson.error).toMatchObject({ code: "RATE_LIMITED" });
    expect(spentJson.error.message).toMatch(/daily limit is used up/);
  });

  it("says the model was retired on 410 and names a timeout plainly", async () => {
    state.failUpstream = true;
    state.failStatus = 410;
    const retired = await POST(body());
    expect((await retired.json()).error.message).toMatch(/retired/);
    state.failStatus = null;
    state.failKind = "timeout";
    const slow = await POST(body());
    expect((await slow.json()).error.message).toMatch(/took too long/);
  });

  it("keeps the could-not-be-reached wording for anything else", async () => {
    state.failUpstream = true;
    const res = await POST(body());
    expect((await res.json()).error.message).toMatch(/could not be reached/);
  });
});
