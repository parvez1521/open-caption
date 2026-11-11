// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState, type Row } from "./fake-db";

/**
 * Route tests for the Growth Coach chat (P2): the dataset is assembled from
 * the CALLER's rows only (another user's posts never reach the prompt), the
 * free-AI rate limits are reused (own bucket + the shared site bucket), and
 * an unconfigured deployment answers configured:false with no model call —
 * never a canned answer.
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));
const ai = vi.hoisted(() => ({
  configured: true,
  calls: [] as Array<{ system: string; user: string }>,
}));
const rateLimitCalls = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: fakeDb(state.current) }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  rateLimit: async (...args: unknown[]) => {
    rateLimitCalls.calls.push(args);
  },
}));
vi.mock("@/lib/api/cloudAi", () => ({
  cloudAiConfig: () => (ai.configured ? { apiKey: "<redacted>", model: "openai/gpt-oss-120b", endpoint: "https://api.groq.com" } : null),
  cloudAiStatus: () => ({ configured: ai.configured, provider: "Groq", model: "openai/gpt-oss-120b", modelName: "GPT-OSS 120B" }),
  runCloudChat: async (prompt: { system: string; user: string }) => {
    ai.calls.push(prompt);
    return "Your top post earned 117 engagement.";
  },
}));

import { GET, POST } from "../chat/route";

const post = (over: Partial<Row> = {}): Row => ({
  id: "post-1",
  owner_id: "user-1",
  platform: "instagram",
  title: "My Reel",
  post_url: null,
  posted_at: "2026-11-08T10:00:00.000Z",
  views: 4321,
  reach: 3000,
  likes: 100,
  comments: 12,
  shares: 5,
  saves: 0,
  source: "manual",
  created_at: "2026-11-08T11:00:00.000Z",
  updated_at: "2026-11-08T11:00:00.000Z",
  ...over,
});

const ask = (question: string) =>
  POST(
    new Request("http://localhost/api/v1/growth/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    }),
  );

beforeEach(() => {
  ai.configured = true;
  ai.calls = [];
  rateLimitCalls.calls = [];
  state.current = makeState({
    growth_posts: [
      post({}),
      post({ id: "post-other", owner_id: "user-2", title: "Someone Else's Post", views: 999999, likes: 88888 }),
    ],
  });
});

describe("POST /growth/chat", () => {
  it("grounds the prompt in the caller's rows ONLY and returns the model's answer", async () => {
    const res = await ask("How did my posts do?");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { configured: boolean; answer: string } };
    expect(body.data.configured).toBe(true);
    expect(body.data.answer).toContain("117 engagement");
    expect(ai.calls).toHaveLength(1);
    const prompt = ai.calls[0]!;
    expect(prompt.system).toContain("Never invent, estimate, or extrapolate");
    expect(prompt.user).toContain("My Reel");
    expect(prompt.user).toContain("4,321");
    expect(prompt.user).not.toContain("Someone Else's Post");
    expect(prompt.user).not.toContain("999,999");
    expect(prompt.user).not.toContain("99,999");
  });

  it("reuses the free-AI limits: own 30/hour bucket + the shared site daily bucket", async () => {
    await ask("Best time?");
    expect(rateLimitCalls.calls).toContainEqual(["user-1", "growth_ai", 30, 3600]);
    expect(rateLimitCalls.calls).toContainEqual(["site", "create_ai_global", 600, 86400]);
  });

  it("unconfigured deployment → configured:false and NO model call", async () => {
    ai.configured = false;
    const res = await ask("How did I do?");
    const body = (await res.json()) as { data: { configured: boolean } };
    expect(body.data.configured).toBe(false);
    expect(ai.calls).toHaveLength(0);
  });

  it("rejects an empty question before any model call", async () => {
    const res = await ask("   ");
    expect(res.status).toBe(422); // the API's VALIDATION status
    expect(ai.calls).toHaveLength(0);
  });
});

describe("GET /growth/chat", () => {
  it("reports the free-AI status for the panel badge", async () => {
    const res = await GET(new Request("http://localhost/api/v1/growth/chat"));
    const body = (await res.json()) as { data: { configured: boolean; provider: string; modelName: string } };
    expect(body.data).toMatchObject({ configured: true, provider: "Groq", modelName: "GPT-OSS 120B" });
  });
});
