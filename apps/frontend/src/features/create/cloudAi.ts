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

/** Session-cached status probe; resolves null when the route cannot be reached at all. */
export function fetchCloudAiStatus(): Promise<CloudAiStatus | null> {
  statusPromise ??= apiClient.get<CloudAiStatus>("/create/generate").catch(() => null);
  return statusPromise;
}

/** A ModelRunner (service.ts): sends the built prompt to our server route, resolves with raw text. */
export async function runCloudModel(prompt: ChatPrompt): Promise<string> {
  const data = await apiClient.post<{ text: string }>("/create/generate", { json: prompt });
  if (!data?.text?.trim()) throw new Error("The free AI service returned nothing.");
  return data.text;
}
