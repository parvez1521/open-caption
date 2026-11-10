import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CloudAiError, cloudAiConfig, cloudAiStatus, runCloudChat } from "../api/cloudAi";

const CONFIG = {
  apiKey: "gsk_test_key",
  model: "openai/gpt-oss-120b",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
};

const jsonResponse = (ok: boolean, status: number, body: unknown): Response =>
  ({ ok, status, json: async () => body }) as unknown as Response;

describe("cloudAiConfig", () => {
  it("is null without a key — the cloud path does not exist then", () => {
    expect(cloudAiConfig({})).toBeNull();
    expect(cloudAiConfig({ GROQ_API_KEY: "   " })).toBeNull();
  });

  it("defaults to the production free-tier model on the Groq endpoint", () => {
    const cfg = cloudAiConfig({ GROQ_API_KEY: "gsk_x" });
    expect(cfg?.model).toBe("openai/gpt-oss-120b");
    expect(cfg?.endpoint).toContain("api.groq.com");
  });

  it("honours the GROQ_MODEL override, trimmed", () => {
    expect(cloudAiConfig({ GROQ_API_KEY: "k", GROQ_MODEL: " openai/gpt-oss-20b " })?.model).toBe("openai/gpt-oss-20b");
  });

  it("status reports unconfigured without a key, configured with the display name with one", () => {
    expect(cloudAiStatus({}).configured).toBe(false);
    const s = cloudAiStatus({ GROQ_API_KEY: "k" });
    expect(s.configured).toBe(true);
    expect(s.provider).toBe("Groq");
    expect(s.model).toBe("openai/gpt-oss-120b");
    expect(s.modelName).toBe("GPT-OSS 120B");
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
    expect(seen.current?.init?.headers).toMatchObject({ Authorization: "Bearer gsk_test_key" });
    const body = JSON.parse(seen.current?.init?.body as string) as { model: string; messages: unknown };
    expect(body.model).toBe("openai/gpt-oss-120b");
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

  it("propagates a network failure as a throw (the caller falls back)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(runCloudChat({ system: "s", user: "u" }, { config: CONFIG, fetchImpl })).rejects.toThrow("ECONNRESET");
  });
});
