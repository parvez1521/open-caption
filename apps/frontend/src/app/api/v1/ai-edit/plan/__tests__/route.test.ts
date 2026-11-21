// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route tests for POST /api/v1/ai-edit/plan: the "Make a visual plan" step
 * runs the free server text AI over the timestamped transcript segments
 * (from the in-browser Whisper run) plus the chosen style, and returns a
 * validated per-segment visual plan. An unconfigured deployment answers
 * configured:false with no model call.
 *
 * The failure wording mirrors POST /api/v1/transcribe/correct (2026-11-20):
 * a dead key (401/403) says the key isn't working, a 429 says the daily
 * limit is used up — the planner used to swallow every failure into one
 * generic "could not be reached" message, so a dead key and a timeout
 * looked identical (seen live 2026-11-21).
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

const PLAN_JSON = JSON.stringify([
  { startMs: 0, endMs: 2000, kind: "image", prompt: "a wide shot of a desk", sourceText: "hello world" },
]);

vi.mock("@/lib/api/cloudAi", () => ({
  CloudAiError: errors.CloudAiError,
  cloudAiConfig: () =>
    state.configured ? { apiKey: "test-key", model: "test-model", endpoint: "https://example.test" } : null,
  cloudAiStatus: () => ({ configured: state.configured, provider: "Cloudflare", model: "test-model", modelName: "Test" }),
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
    return PLAN_JSON;
  },
}));
vi.mock("@/services/api-client", () => ({ apiClient: { post: vi.fn() } }));

import { POST } from "../route";

const ask = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/ai-edit/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const validBody = {
  segments: [{ startMs: 0, endMs: 2000, text: "hello world" }],
  styleId: "clean",
  durationMs: 2000,
};

beforeEach(() => {
  state.configured = true;
  state.failUpstream = false;
  state.failStatus = null;
  state.failKind = null;
  state.failDetail = null;
  ai.calls = [];
  rateLimitCalls.calls = [];
});

describe("POST /ai-edit/plan", () => {
  it("returns a validated plan and asks for a 1200-token cap, one 45s attempt (8 items fit)", async () => {
    const res = await ask(validBody);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { configured: boolean; plan: Array<{ kind: string; prompt: string }>; dropped: number };
    };
    expect(body.data.configured).toBe(true);
    expect(body.data.plan).toHaveLength(1);
    expect(body.data.plan[0]?.kind).toBe("image");
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]?.opts).toMatchObject({ temperature: 0.4, maxTokens: 1200, timeoutMs: 45000, maxAttempts: 1, responseFormat: "json_object" });
    // No model or provider name ever leaks into the prompt.
    expect(ai.calls[0]?.system).not.toMatch(/gpt|groq|whisper/i);
    expect(ai.calls[0]?.user).not.toMatch(/gpt|groq|whisper/i);
  });

  it("logs the parse outcome on success (answer length, kept/dropped, 400-char preview)", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const res = await ask(validBody);
      expect(res.status).toBe(200);
      const logged = infoSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const line = JSON.parse(logged.split("\n").find((l) => l.includes("ai-edit/plan free AI call succeeded")) ?? "{}") as Record<
        string,
        unknown
      >;
      expect(line.msg).toBe("ai-edit/plan free AI call succeeded");
      expect(line.kept).toBe(1);
      expect(line.dropped).toBe(0);
      expect(line.startsWith).toBe("[");
      expect(line.hasFence).toBe(false);
      expect(typeof line.answerLength).toBe("number");
      // TEMPORARY diagnostic preview (see route comment): the first 400
      // chars of the model's plan text, so the bullet format can be read.
      expect(typeof line.preview).toBe("string");
      expect((line.preview as string).length).toBeLessThanOrEqual(400);
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("reuses the free-AI limits: own 30/hour bucket + the shared site daily bucket", async () => {
    await ask(validBody);
    expect(rateLimitCalls.calls).toContainEqual(["user-1", "ai_edit_plan", 30, 3600]);
    expect(rateLimitCalls.calls).toContainEqual(["site", "create_ai_global", 600, 86400]);
  });

  it("unconfigured deployment → configured:false and NO model call", async () => {
    state.configured = false;
    const res = await ask(validBody);
    const body = (await res.json()) as { data: { configured: boolean } };
    expect(body.data.configured).toBe(false);
    expect(ai.calls).toHaveLength(0);
    expect(rateLimitCalls.calls).toHaveLength(0);
  });

  it("rejects empty segments before any model call", async () => {
    const res = await ask({ ...validBody, segments: [] });
    expect(res.status).toBe(422);
    expect(ai.calls).toHaveLength(0);
  });

  it("an unreachable free AI service answers 502 with the generic message", async () => {
    state.failUpstream = true;
    const res = await ask(validBody);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.error.message).toContain("could not be reached");
  });

  it("a dead free AI key (401) says the key isn't working, not 'could not be reached'", async () => {
    state.failUpstream = true;
    state.failStatus = 401;
    const res = await ask(validBody);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.error.message).toContain("key isn't working");
  });

  it("a free-tier daily limit (429) answers 429 with the limit message", async () => {
    state.failUpstream = true;
    state.failStatus = 429;
    const res = await ask(validBody);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toContain("daily limit");
  });

  it("a retired model (410) says the model was retired, not 'could not be reached'", async () => {
    state.failUpstream = true;
    state.failStatus = 410;
    const res = await ask(validBody);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.error.message).toContain("retired");
  });

  it("a timeout says the AI took too long, not 'could not be reached'", async () => {
    state.failUpstream = true;
    state.failKind = "timeout";
    const res = await ask(validBody);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.error.message).toContain("took too long");
  });

  it("an empty completion says the AI made no visuals, not 'could not be reached'", async () => {
    state.failUpstream = true;
    state.failKind = "empty";
    const res = await ask(validBody);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(body.error.message).toContain("made no visuals");
  });

  it("an empty completion logs the response shape detail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.failUpstream = true;
      state.failKind = "empty";
      state.failDetail = { bodyJson: true, choices: 1, contentType: "empty-string" };
      const res = await ask(validBody);
      expect(res.status).toBe(502);
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toContain('"detail"');
      expect(logged).toContain("empty-string");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
