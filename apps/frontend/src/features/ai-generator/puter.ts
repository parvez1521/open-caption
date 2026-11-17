/**
 * Minimal typed surface of the Puter.js SDK used by the AI Generator.
 *
 * Verified against the official Puter.js docs (read 2026-11-17) and the
 * shipped https://js.puter.com/v2/ bundle (fetched 2026-11-17):
 * - `puter.ai.chat(prompt, { normalize: true })` resolves with a response
 *   whose `message.content` is a string on normalized responses; the array
 *   shape (`content[0].text`) is still handled defensively.
 * - `puter.ai.txt2img(prompt)` resolves with an HTMLImageElement; read
 *   `image.src` (hosted URL or data URI, provider-dependent). The SDK
 *   builds that src as a blob: URL from the returned bytes, so no extra
 *   img-src host is needed in the CSP.
 * - `puter.ai.txt2vid(prompt, options)` resolves with an HTMLVideoElement
 *   (docs.puter.com/AI/txt2vid/); read `video.src`. Default model is
 *   `togetherai:wan-ai/wan2.7-t2v` (Wan 2.7 text-to-video, per-second
 *   pricing, 2–15 s, default 5 s, 720P/1080P) — the shipped code passes no
 *   model name and lets Puter use that default. `seconds: 5` and
 *   `size: "720P"` are passed explicitly to keep a visitor's free
 *   allowance lasting: video costs far more credits than text or images.
 * - Auth is automatic: calling chat/txt2img/txt2vid while signed out opens
 *   the Puter sign-in popup from the user action. `isSignedIn()` is
 *   synchronous; `signIn()` must be called from a click, never on load.
 *   No API key, no backend, no cost to Captionit (User-Pays).
 *
 * No `any` anywhere: the lint config (eslint-config-next/typescript)
 * forbids it, and the SDK surface we touch is small enough to type fully.
 */

export interface PuterChatContentPart {
  type?: string;
  text?: string;
}

export type PuterChatContent = string | PuterChatContentPart[];

export interface PuterChatResponse {
  message?: {
    content?: PuterChatContent;
  };
}

export interface PuterAuth {
  isSignedIn: () => boolean;
  signIn: () => Promise<unknown>;
}

export interface PuterTxt2VidOptions {
  seconds?: number;
  size?: string;
}

export interface PuterAi {
  chat: (prompt: string, options?: { normalize?: boolean }) => Promise<PuterChatResponse>;
  txt2img: (prompt: string) => Promise<HTMLImageElement>;
  txt2vid: (prompt: string, options?: PuterTxt2VidOptions) => Promise<HTMLVideoElement>;
}

export interface PuterGlobal {
  ai: PuterAi;
  auth: PuterAuth;
}

declare global {
  interface Window {
    puter?: PuterGlobal;
  }
}

/** The Puter.js SDK global when the script has loaded, undefined otherwise. */
export function getPuter(): PuterGlobal | undefined {
  return typeof window === "undefined" ? undefined : window.puter;
}

/** Pull the reply text out of a chat response, handling both content shapes. */
export function extractChatText(response: PuterChatResponse): string {
  const content = response.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return "";
}

/** Turn whatever the SDK rejected with into a readable message for the page. */
export function puterErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as { message?: unknown; code?: unknown; error?: unknown };
    const message = typeof record.message === "string" ? record.message : "";
    const code = typeof record.code === "string" ? record.code : "";
    const fallback = typeof record.error === "string" ? record.error : "";
    const text = message || fallback;
    if (text && code) return `${text} (${code})`;
    if (text) return text;
    if (code) return `Generation failed (${code})`;
  }
  if (typeof error === "string" && error) return error;
  return "Generation failed. Try again.";
}
