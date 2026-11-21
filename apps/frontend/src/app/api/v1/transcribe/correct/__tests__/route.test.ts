// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route tests for POST /api/v1/transcribe/correct: the correction pass runs
 * the free server text AI over sentence-aware chunks of the plain transcript
 * text (never timed captions), with the same per-user + shared site buckets
 * Growth Coach and AI Edit use. An unconfigured deployment answers
 * configured:false with no model call.
 */

const state = vi.hoisted(() => ({ configured: true, failUpstream: false, failStatus: null as number | null, failKind: null as string | null, failDetail: null as Record<string, unknown> | null }));
const ai = vi.hoisted(() => ({ calls: [] as Array<{ system: string; user: string; opts: unknown }> }));
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
    detail?: Record<string, unknown>;
    constructor(message: string, status?: number, kind?: string, detail?: Record<string, unknown>) {
      super(message);
      this.name = "CloudAiError";
      this.status = status;
      this.kind = kind ?? (status !== undefined ? "http" : undefined);
      this.detail = detail;
    }
  },
}));

vi.mock("@/lib/api/cloudAi", () => ({
  CloudAiError: errors.CloudAiError,
  cloudAiConfig: () =>
    state.configured ? { apiKey: "test-key", model: "test-model", endpoint: "https://example.test" } : null,
  runCloudChat: async (prompt: { system: string; user: string }, opts?: unknown) => {
    if (state.failUpstream) {
      if (state.failStatus !== null || state.failKind !== null) {
        throw new errors.CloudAiError(
          state.failKind ? `The free AI request ${state.failKind}.` : `The free AI service answered with HTTP ${state.failStatus}.`,
          state.failStatus ?? undefined,
          state.failKind ?? undefined,
          state.failDetail ?? undefined,
        );
      }
      throw new Error("upstream down");
    }
    ai.calls.push({ ...prompt, opts });
    return `FIXED: ${prompt.user}`;
  },
}));
vi.mock("@/services/api-client", () => ({ apiClient: { post: vi.fn() } }));

import { POST } from "../route";

const ask = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/transcribe/correct", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.configured = true;
  state.failUpstream = false;
  state.failStatus = null;
  state.failKind = null;
  state.failDetail = null;
  ai.calls = [];
  rateLimitCalls.calls = [];
});

describe("POST /transcribe/correct", () => {
  it("corrects chunk by chunk, conservative settings, and joins the result", async () => {
    const sentence = "Aaj hum ek nayi video banayenge jo bahut acchi hogi. ";
    const text = sentence.repeat(30); // ~1,650 chars -> 2 chunks at 1,200
    const res = await ask({ text, language: "hinglish" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { configured: boolean; corrected: string; chunks: number } };
    expect(body.data.configured).toBe(true);
    expect(body.data.chunks).toBe(2);
    expect(body.data.corrected).toContain("FIXED:");
    expect(ai.calls).toHaveLength(2);
    for (const call of ai.calls) {
      expect(call.system).toContain("Roman");
      expect(call.system).not.toMatch(/gpt|groq|whisper/i);
      expect(call.opts).toMatchObject({ temperature: 0.2, maxTokens: 800 });
    }
  });

  it("reuses the free-AI limits: own 10/hour bucket + the shared site daily bucket", async () => {
    await ask({ text: "Hello world.", language: "en" });
    expect(rateLimitCalls.calls).toContainEqual(["user-1", "transcribe_correct", 10, 3600]);
    expect(rateLimitCalls.calls).toContainEqual(["site", "create_ai_global", 600, 86400]);
  });

  it("unconfigured deployment → configured:false and NO model call", async () => {
    state.configured = false;
    const res = await ask({ text: "Hello world.", language: "en" });
    const body = (await res.json()) as { data: { configured: boolean } };
    expect(body.data.configured).toBe(false);
    expect(ai.calls).toHaveLength(0);
    expect(rateLimitCalls.calls).toHaveLength(0);
  });

  it("rejects empty and over-long text before any model call", async () => {
    const empty = await ask({ text: "   ", language: "en" });
    expect(empty.status).toBe(422);
    const long = await ask({ text: "x".repeat(6001), language: "en" });
    expect(long.status).toBe(422);
    expect(ai.calls).toHaveLength(0);
  });

  it("an unreachable free AI service answers 502, not a silent empty correction", async () => {
    state.failUpstream = true;
    const res = await ask({ text: "Hello world.", language: "en" });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UPSTREAM_FAILED");
  });

  it("a dead free AI key (401) says the key isn't working, not 'could not be reached'", async () => {
    state.failUpstream = true;
    state.failStatus = 401;
    const res = await ask({ text: "Hello world.", language: "en" });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.error.message).toContain("key isn't working");
  });

  it("a free-tier daily limit (429) answers 429 with the limit message", async () => {
    state.failUpstream = true;
    state.failStatus = 429;
    const res = await ask({ text: "Hello world.", language: "en" });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toContain("daily limit");
  });

  it("a retired model (410) says the model was retired, not 'could not be reached'", async () => {
    state.failUpstream = true;
    state.failStatus = 410;
    const res = await ask({ text: "Hello world.", language: "en" });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.error.message).toContain("retired");
  });

  it("a timeout says the AI took too long, not 'could not be reached'", async () => {
    state.failUpstream = true;
    state.failKind = "timeout";
    const res = await ask({ text: "Hello world.", language: "en" });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.error.message).toContain("took too long");
  });

  it("an empty completion says the AI made no correction, not 'could not be reached'", async () => {
    state.failUpstream = true;
    state.failKind = "empty";
    const res = await ask({ text: "Hello world.", language: "en" });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.error.message).toContain("made no correction");
  });

  it("an empty completion logs the response shape detail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.failUpstream = true;
      state.failKind = "empty";
      state.failDetail = { bodyJson: true, choices: 1, contentType: "empty-string" };
      const res = await ask({ text: "Hello world.", language: "en" });
      expect(res.status).toBe(502);
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toContain('"detail"');
      expect(logged).toContain("empty-string");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
