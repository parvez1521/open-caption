import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CloudAiError, cloudAiConfig, cloudAiStatus, runCloudChat } from "../api/cloudAi";

const CONFIG = {
  apiKey: "cf_test_token",
  model: "@cf/google/gemma-4-26b-a4b-it",
  endpoint: "https://api.cloudflare.com/client/v4/accounts/test-acct/ai/v1/chat/completions",
};

const jsonResponse = (ok: boolean, status: number, body: unknown): Response =>
  ({ ok, status, json: async () => body }) as unknown as Response;

describe("cloudAiConfig", () => {
  it("is null without credentials — the cloud path does not exist then", () => {
    expect(cloudAiConfig({})).toBeNull();
    expect(cloudAiConfig({ CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_KEY: "   " })).toBeNull();
    expect(cloudAiConfig({ CLOUDFLARE_API_KEY: "tok" })).toBeNull();
  });

  it("defaults to the production free-tier model on the Workers AI endpoint", () => {
    const cfg = cloudAiConfig({ CLOUDFLARE_ACCOUNT_ID: "acct-1", CLOUDFLARE_API_KEY: "tok" });
    expect(cfg?.model).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(cfg?.endpoint).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/chat/completions",
    );
  });

  it("honours the CLOUDFLARE_AI_MODEL override, trimmed", () => {
    expect(
      cloudAiConfig({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_KEY: "k", CLOUDFLARE_AI_MODEL: " @cf/openai/gpt-oss-20b " })?.model,
    ).toBe("@cf/openai/gpt-oss-20b");
  });

  it("status reports unconfigured without credentials, configured with the display name with them", () => {
    expect(cloudAiStatus({}).configured).toBe(false);
    const s = cloudAiStatus({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_KEY: "k" });
    expect(s.configured).toBe(true);
    expect(s.provider).toBe("Cloudflare");
    expect(s.model).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(s.modelName).toBe("Gemma 4 26B");
  });
});

describe("runCloudChat", () => {
  it("posts an OpenAI-shaped request and returns the completion text", async () => {
    const seen: { current: { url: string; init?: RequestInit } | null } = { current: null };
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.current = { url, init };
      return jsonResponse(true, 200, { choices: [{ message: { content: "hook line" } }] });
    }) as unknown as typeof fetch;
    const text = await runCloudChat({ system: "sys", user: "usr" }, { config: CONFIG, fetchImpl });
    expect(text).toBe("hook line");
    expect(seen.current?.url).toBe(CONFIG.endpoint);
    expect(seen.current?.init?.headers).toMatchObject({ Authorization: "Bearer cf_test_token" });
    const body = JSON.parse(seen.current?.init?.body as string) as { model: string; messages: unknown };
    expect(body.model).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
  });

  it("throws CloudAiError carrying the status on an HTTP failure (e.g. a free-tier 429)", async () => {
    const fetchImpl = (async () => jsonResponse(false, 429, {})) as unknown as typeof fetch;
    await expect(runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl })).rejects.toMatchObject({
      name: "CloudAiError",
      status: 429,
    });
  });

  it("retries ONCE on a free-tier 429, then returns the completion", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(false, 429, {}) : jsonResponse(true, 200, { choices: [{ message: { content: "hook line" } }] });
    }) as unknown as typeof fetch;
    const text = await runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl, retryDelayMs: 0 });
    expect(text).toBe("hook line");
    expect(calls).toBe(2);
  });

  it("retries ONCE on a 5xx, and gives up after the second failure", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse(false, 503, {});
    }) as unknown as typeof fetch;
    await expect(
      runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ name: "CloudAiError", status: 503 });
    expect(calls).toBe(2);
  });

  it("does NOT retry a deterministic 4xx (a second attempt would fail the same way)", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse(false, 400, {});
    }) as unknown as typeof fetch;
    await expect(
      runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });

  it("maxAttempts: 1 spends the whole budget on one attempt (no retry even on a 5xx)", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse(false, 503, {});
    }) as unknown as typeof fetch;
    await expect(
      runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl, retryDelayMs: 0, maxAttempts: 1 }),
    ).rejects.toMatchObject({ name: "CloudAiError", status: 503 });
    expect(calls).toBe(1);
  });

  it("does NOT retry an empty completion (deterministic, not transient)", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse(true, 200, { choices: [{ message: { content: "  " } }] });
    }) as unknown as typeof fetch;
    await expect(
      runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl, retryDelayMs: 0 }),
    ).rejects.toBeInstanceOf(CloudAiError);
    expect(calls).toBe(1);
  });

  it("retries ONCE on a network blip, then returns the completion", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) throw new Error("ECONNRESET");
      return jsonResponse(true, 200, { choices: [{ message: { content: "hook line" } }] });
    }) as unknown as typeof fetch;
    const text = await runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl, retryDelayMs: 0 });
    expect(text).toBe("hook line");
    expect(calls).toBe(2);
  });

  it("throws on an empty or malformed completion", async () => {
    const empty = (async () =>
      jsonResponse(true, 200, { choices: [{ message: { content: "  " } }] })) as unknown as typeof fetch;
    await expect(runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl: empty })).rejects.toBeInstanceOf(CloudAiError);
    const junk = (async () => jsonResponse(true, 200, { nope: true })) as unknown as typeof fetch;
    await expect(runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl: junk })).rejects.toBeInstanceOf(CloudAiError);
  });

  it("throws without calling fetch when unconfigured", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(runCloudChat({ system: "s", user: "u" }, { config: null, fetchImpl })).rejects.toBeInstanceOf(CloudAiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("propagates a network failure as a CloudAiError with kind network (the caller falls back)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl })).rejects.toMatchObject({
      name: "CloudAiError",
      kind: "network",
    });
  });

  it("a request that never answers aborts as kind timeout, not a raw AbortError", async () => {
    // A real fetch rejects when its signal aborts; the mock does the same.
    const fetchImpl = ((_: string, init?: { signal?: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as unknown as typeof fetch;
    await expect(
      runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl, timeoutMs: 5, maxAttempts: 1 }),
    ).rejects.toMatchObject({ name: "CloudAiError", kind: "timeout" });
  });

  it("joins text-part content instead of calling the completion empty", async () => {
    const fetchImpl = (async () =>
      jsonResponse(true, 200, {
        choices: [{ message: { content: [{ type: "text", text: "hello" }, { type: "text", text: " world" }] } }],
      })) as unknown as typeof fetch;
    const text = await runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl });
    expect(text).toBe("hello world");
  });

  it("an empty completion carries kind empty (so the route can name it, not log unknown)", async () => {
    const fetchImpl = (async () =>
      jsonResponse(true, 200, { choices: [{ message: { content: "  " } }] })) as unknown as typeof fetch;
    await expect(runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl })).rejects.toMatchObject({
      name: "CloudAiError",
      kind: "empty",
    });
  });

  it("asks for no reasoning (Gemma 4 thinks and can leave content empty)", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return jsonResponse(true, 200, { choices: [{ message: { content: "hook line" } }] });
    }) as unknown as typeof fetch;
    await runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl });
    expect(sentBody.reasoning_effort).toBe("none");
  });

  it("sends response_format json_object only when the caller asks for it", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return jsonResponse(true, 200, { choices: [{ message: { content: "hook line" } }] });
    }) as unknown as typeof fetch;
    await runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl, responseFormat: "json_object" });
    expect(sentBody.response_format).toEqual({ type: "json_object" });
    await runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl });
    expect(sentBody.response_format).toBeUndefined();
  });

  it("reads the answer from the reasoning field when content is empty", async () => {
    const fetchImpl = (async () =>
      jsonResponse(true, 200, {
        choices: [{ message: { content: "", reasoning_content: "hook line" } }],
      })) as unknown as typeof fetch;
    const text = await runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl });
    expect(text).toBe("hook line");
  });

  it("joins reasoning text parts when content is empty", async () => {
    const fetchImpl = (async () =>
      jsonResponse(true, 200, {
        choices: [{ message: { content: null, reasoning: [{ type: "text", text: "hello" }, { type: "text", text: " world" }] } }],
      })) as unknown as typeof fetch;
    const text = await runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl });
    expect(text).toBe("hello world");
  });

  it("a still-empty completion carries the response shape as detail (field names only, no text)", async () => {
    const fetchImpl = (async () =>
      jsonResponse(true, 200, {
        choices: [{ message: { content: "", reasoning_content: "" }, finish_reason: "stop" }],
      })) as unknown as typeof fetch;
    const err = await runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl }).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "CloudAiError", kind: "empty" });
    expect((err as CloudAiError).detail).toEqual({
      bodyJson: true,
      choices: 1,
      finishReason: "stop",
      messageKeys: ["content", "reasoning_content"],
      contentType: "empty-string",
      reasoningContentType: "empty-string",
      reasoningType: "undefined",
    });
  });
});
