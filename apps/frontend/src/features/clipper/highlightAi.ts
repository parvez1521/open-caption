/**
 * Client side of the AI Clipping Studio's free AI (the server route is
 * /api/v1/clipper/highlights; the provider record lives in lib/api/cloudAi.ts —
 * Groq free tier, GPT-OSS 120B, key server-side only).
 *
 * Mirrors features/create/cloudAi.ts: the status probe is cached for the
 * session, and only a "configured" answer makes the panel offer the cloud
 * runner to the highlight engine. All calls go through the authed apiClient
 * (the Growth lesson: a raw fetch here would 401 — the route requires the
 * Bearer token the client attaches). Only transcript text is ever sent.
 */
import { apiClient } from "@/services/api-client";
import type { ModelRunner } from "../create/service";

export interface ClipAiStatus {
  configured: boolean;
  provider: string;
  model: string;
  modelName: string;
}

let statusPromise: Promise<ClipAiStatus | null> | null = null;

/** Session-cached status probe; resolves null when the route cannot be reached at all. */
export function fetchClipAiStatus(): Promise<ClipAiStatus | null> {
  statusPromise ??= apiClient.get<ClipAiStatus>("/clipper/highlights").catch(() => null);
  return statusPromise;
}

/** A ModelRunner (create/service.ts shape): sends the built prompt to our server route, resolves with raw text. */
export const runClipCloudModel: ModelRunner = async (prompt) => {
  const data = await apiClient.post<{ text: string }>("/clipper/highlights", { json: prompt });
  if (!data?.text?.trim()) throw new Error("The free AI service returned nothing.");
  return data.text;
};
