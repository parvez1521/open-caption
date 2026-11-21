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

const state = vi.hoisted(() => ({ configured: true, failUpstream: false, failStatus: null as number | null }));
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
    constructor(message: string, status?: number) {
      super(message);
      this.name = "CloudAiError";
      this.status = status;
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
      if (state.failStatus !== null) {
        throw new errors.CloudAiError(`The free AI service answered with HTTP ${state.failStatus}.`, state.failStatus);
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
  ai.calls = [];
  rateLimitCalls.calls = [];
});

describe("POST /ai-edit/plan", () => {
  it("returns a validated plan and asks for a 2000-token cap (12 items fit)", async () => {
    const res = await ask(validBody);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { configured: boolean; plan: Array<{ kind: string; prompt: string }>; dropped: number };
    };
    expect(body.data.configured).toBe(true);
    expect(body.data.plan).toHaveLength(1);
    expect(body.data.plan[0]?.kind).toBe("image");
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]?.opts).toMatchObject({ temperature: 0.4, maxTokens: 2000 });
    // No model or provider name ever leaks into the prompt.
    expect(ai.calls[0]?.system).not.toMatch(/gpt|groq|whisper/i);
    expect(ai.calls[0]?.user).not.toMatch(/gpt|groq|whisper/i);
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
});
