import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));

import { apiClient } from "@/services/api-client";
import { runCloudModel } from "../cloudAi";

const postMock = vi.mocked(apiClient.post);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runCloudModel (client runner for the free AI route)", () => {
  it("posts the prompt to the generate route and resolves with the completion text", async () => {
    postMock.mockResolvedValue({ text: "hook one\nhook two" });
    await expect(runCloudModel({ system: "s", user: "u" })).resolves.toBe("hook one\nhook two");
    expect(postMock).toHaveBeenCalledWith("/create/generate", { json: { system: "s", user: "u" } });
  });

  it("throws when the route returns no text, so the service falls back", async () => {
    postMock.mockResolvedValue({ text: "  " });
    await expect(runCloudModel({ system: "s", user: "u" })).rejects.toThrow();
  });

  it("propagates route errors (rate limited / upstream down), so the service falls back", async () => {
    postMock.mockRejectedValue(new Error("RATE_LIMITED"));
    await expect(runCloudModel({ system: "s", user: "u" })).rejects.toThrow("RATE_LIMITED");
  });
});

describe("fetchCloudAiStatus", () => {
  it("returns the server status", async () => {
    vi.resetModules();
    const fresh = await import("../cloudAi");
    const freshClient = (await import("@/services/api-client")).apiClient;
    vi.mocked(freshClient.get).mockResolvedValue({
      configured: true,
      provider: "Groq",
      model: "openai/gpt-oss-120b",
      modelName: "GPT-OSS 120B",
    });
    await expect(fresh.fetchCloudAiStatus()).resolves.toEqual({
      configured: true,
      provider: "Groq",
      model: "openai/gpt-oss-120b",
      modelName: "GPT-OSS 120B",
    });
  });

  it("resolves null when the probe cannot reach the route (page then offers no cloud path)", async () => {
    vi.resetModules();
    const fresh = await import("../cloudAi");
    const freshClient = (await import("@/services/api-client")).apiClient;
    vi.mocked(freshClient.get).mockRejectedValue(new Error("offline"));
    await expect(fresh.fetchCloudAiStatus()).resolves.toBeNull();
  });
});
