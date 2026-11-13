/**
 * Client side of the Creator Studio "Free AI" (the server route is /api/v1/create/generate,
 * the provider record lives in lib/api/cloudAi.ts — Groq free tier, model GPT-OSS 120B).
 *
 * The status probe is cached for the session: the page asks once whether this deployment has a
 * provider key configured, and only then offers the cloud runner to the generation service.
 * If the probe fails (offline, old deployment) the answer is "not configured" and /create behaves
 * exactly as it did before the cloud path existed.
 */
import { apiClient } from "@/services/api-client";
import type { ChatPrompt } from "./prompts";

export interface CloudAiStatus {
  configured: boolean;
  provider: string;
  model: string;
  modelName: string;
}

let statusPromise: Promise<CloudAiStatus | null> | null = null;

/**
 * What runCloudModel throws when the generate route answers with an error: the server's error
 * code (RATE_LIMITED, UPSTREAM_FAILED, VALIDATION …) survives the throw, so a caller can tell
 * "the free AI is at its limit, wait a while" apart from "Groq blipped, retry now" apart from
 * "this request can never succeed". Duck-typed off the thrown value's `code` — the real
 * ApiError carries it, and the api-client mock in tests does not export the class.
 */
export class CloudModelError extends Error {
  readonly code?: string;
  readonly status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = "CloudModelError";
    this.code = code;
    this.status = status;
  }
}

/** Session-cached status probe; resolves null when the route cannot be reached at all. */
export function fetchCloudAiStatus(): Promise<CloudAiStatus | null> {
  statusPromise ??= apiClient.get<CloudAiStatus>("/create/generate").catch(() => null);
  return statusPromise;
}

/**
 * A ModelRunner (service.ts): sends the built prompt to our server route, resolves with raw text.
 * Route errors keep their server code on the throw (see CloudModelError); an empty completion
 * is a plain Error with no code, i.e. a transient-looking failure.
 */
export async function runCloudModel(prompt: ChatPrompt): Promise<string> {
  let data: { text: string };
  try {
    data = await apiClient.post<{ text: string }>("/create/generate", { json: prompt });
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    const status = (err as { status?: unknown })?.status;
    throw new CloudModelError(
      err instanceof Error ? err.message : "The free AI service could not be reached.",
      typeof code === "string" ? code : undefined,
      typeof status === "number" ? status : undefined,
    );
  }
  if (!data?.text?.trim()) throw new Error("The free AI service returned nothing.");
  return data.text;
}
