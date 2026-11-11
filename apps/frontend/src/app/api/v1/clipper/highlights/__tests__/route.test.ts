// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route tests for the AI Clipping Studio's free-AI proxy: auth is required,
 * the status is the cloudAi status verbatim, an unconfigured deployment gets
 * an honest UPSTREAM_FAILED (never a fake success), prompt caps are enforced,
 * the clip-sized token/temperature options reach the provider call, and both
 * rate-limit buckets are hit with the clip_ai names.
 */

const cloud = vi.hoisted(() => ({
  configured: true,
  calls: [] as { prompt: { system: string; user: string }; opts: Record<string, unknown> }[],
  fail: false,
}));
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
vi.mock("@/lib/api/cloudAi", () => ({
  cloudAiConfig: () => (cloud.configured ? { apiKey: "k", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" } : null),
  cloudAiStatus: () => ({
    configured: cloud.configured,
    provider: cloud.configured ? "groq" : "none",
    model: cloud.configured ? "openai/gpt-oss-120b" : "",
    modelName: cloud.configured ? "GPT-OSS 120B" : "",
  }),
  runCloudChat: async (prompt: { system: string; user: string }, opts: Record<string, unknown>) => {
    cloud.calls.push({ prompt, opts });
    if (cloud.fail) throw new Error("upstream down");
    return '{"clips": []}';
  },
}));

import { GET, POST } from "../route";

const get = () => new Request("https://x.test/api/v1/clipper/highlights");
const post = (body: unknown) =>
  new Request("https://x.test/api/v1/clipper/highlights", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  cloud.configured = true;
  cloud.calls = [];
  cloud.fail = false;
  rateLimitCalls.calls = [];
});

describe("clipper highlights route", () => {
  it("GET returns the cloud status", async () => {
    const res = await GET(get());
    const body = (await res.json()) as { success: boolean; data: { configured: boolean; modelName: string } };
    expect(body.success).toBe(true);
    expect(body.data.configured).toBe(true);
    expect(body.data.modelName).toBe("GPT-OSS 120B");
  });

  it("POST runs the prompt with clip-sized options and both rate buckets", async () => {
    const res = await POST(post({ system: "sys", user: "a very long transcript window" }));
    const body = (await res.json()) as { success: boolean; data: { text: string } };
    expect(body.success).toBe(true);
    expect(body.data.text).toBe('{"clips": []}');
    expect(cloud.calls).toHaveLength(1);
    expect(cloud.calls[0]!.opts).toMatchObject({ maxTokens: 2000, temperature: 0.4 });
    const buckets = rateLimitCalls.calls.map((c) => c[1]);
    expect(buckets).toContain("clip_ai");
    expect(buckets).toContain("clip_ai_global");
  });

  it("an unconfigured deployment answers UPSTREAM_FAILED, never a fake success", async () => {
    cloud.configured = false;
    const res = await POST(post({ system: "sys", user: "user" }));
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("UPSTREAM_FAILED");
    expect(cloud.calls).toHaveLength(0);
  });

  it("an upstream failure becomes UPSTREAM_FAILED (the client falls back honestly)", async () => {
    cloud.fail = true;
    const res = await POST(post({ system: "sys", user: "user" }));
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("UPSTREAM_FAILED");
  });

  it("rejects an over-cap prompt before any provider call", async () => {
    const res = await POST(post({ system: "sys", user: "x".repeat(24_001) }));
    expect(res.status).toBe(422);
    expect(cloud.calls).toHaveLength(0);
  });
});
