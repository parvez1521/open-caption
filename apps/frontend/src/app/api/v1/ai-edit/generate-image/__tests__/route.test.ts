// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route tests for POST /api/v1/ai-edit/generate-image: the panel sends ONE
 * prompt and the route runs Cloudflare Workers AI FLUX.1 schnell
 * server-side, returning the image as a data URL — no visitor sign-in,
 * no Puter. An unconfigured deployment answers configured:false with no
 * model call. The failure wording mirrors POST /api/v1/ai-edit/plan
 * (2026-11-20): a dead key (401/403) says the key isn't working, a 429
 * says the daily image limit is used up.
 */

const state = vi.hoisted(() => ({ configured: true, failUpstream: false, failStatus: null as number | null, failKind: null as string | null }));
const image = vi.hoisted(() => ({ calls: [] as Array<{ prompt: string }> }));
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
  cloudImageConfig: () =>
    state.configured ? { apiKey: "test-key", endpoint: "https://example.test/ai/run/flux" } : null,
  runCloudImage: async (prompt: string) => {
    if (state.failUpstream) {
      if (state.failStatus !== null || state.failKind !== null) {
        throw new errors.CloudAiError(
          state.failKind ? `The free AI image request ${state.failKind}.` : `The free AI service answered with HTTP ${state.failStatus}.`,
          state.failStatus ?? undefined,
          state.failKind ?? undefined,
        );
      }
      throw new Error("upstream down");
    }
    image.calls.push({ prompt });
    return { imageBase64: "aGVsbG8=", mime: "image/jpeg" };
  },
}));

import { POST } from "../route";

const ask = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/ai-edit/generate-image", {
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
  image.calls = [];
  rateLimitCalls.calls = [];
});

describe("POST /ai-edit/generate-image", () => {
  it("returns a data URL for the prompt, with per-user and site image limits", async () => {
    const res = await ask({ prompt: "a sunrise over hills" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { configured: boolean; imageDataUrl: string } };
    expect(body.data.configured).toBe(true);
    expect(body.data.imageDataUrl).toBe("data:image/jpeg;base64,aGVsbG8=");
    expect(image.calls).toEqual([{ prompt: "a sunrise over hills" }]);
    expect(rateLimitCalls.calls).toContainEqual(["user-1", "ai_edit_generate_image", 20, 86_400]);
    expect(rateLimitCalls.calls).toContainEqual(["site", "ai_edit_generate_image_site", 50, 86_400]);
  });

  it("answers configured:false with no model call when the free AI is not set up", async () => {
    state.configured = false;
    const res = await ask({ prompt: "a sunrise over hills" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { configured: boolean } };
    expect(body.data.configured).toBe(false);
    expect(image.calls).toHaveLength(0);
  });

  it("a dead key says the key isn't working, a spent limit says try tomorrow", async () => {
    state.failUpstream = true;
    state.failStatus = 401;
    const keyRes = await ask({ prompt: "a sunrise over hills" });
    expect(keyRes.status).toBe(502);
    const keyBody = (await keyRes.json()) as { error: { message: string } };
    expect(keyBody.error.message).toMatch(/key isn't working/);

    state.failStatus = 429;
    const limitRes = await ask({ prompt: "a sunrise over hills" });
    expect(limitRes.status).toBe(429);
    const limitBody = (await limitRes.json()) as { error: { message: string } };
    expect(limitBody.error.message).toMatch(/used up for today/);
  });

  it("a timeout says the drawing took too long, an empty answer says no image", async () => {
    state.failUpstream = true;
    state.failKind = "timeout";
    const timeoutRes = await ask({ prompt: "a sunrise over hills" });
    const timeoutBody = (await timeoutRes.json()) as { error: { message: string } };
    expect(timeoutBody.error.message).toMatch(/took too long/);

    state.failKind = "empty";
    const emptyRes = await ask({ prompt: "a sunrise over hills" });
    const emptyBody = (await emptyRes.json()) as { error: { message: string } };
    expect(emptyBody.error.message).toMatch(/made no image/);
  });

  it("rejects an empty or over-long prompt", async () => {
    expect((await ask({ prompt: "" })).status).toBe(422);
    expect((await ask({ prompt: "x".repeat(1001) })).status).toBe(422);
    expect(image.calls).toHaveLength(0);
  });
});
