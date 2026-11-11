import "server-only";

/**
 * The Creator Studio "Free AI": one shared Groq free-tier key, called server-side only.
 *
 * Provider choice verified 2026-11-10 against official pages (full comparison:
 * workspace/open-caption-studio-2026-11-09/research/free-ai-options.md). Groq's Free Plan is a standing
 * tier — not a trial — with the production model openai/gpt-oss-120b (120B-class open-weight flagship):
 * 30 requests/min, 1,000 requests/day, 8,000 tokens/min, 200,000 tokens/day at organisation level,
 * no card required, no training on inputs, no retention by default. Cloudflare Workers AI is the
 * documented runner-up if Groq ever withdraws the tier.
 *
 * Groq churns its free roster (Llama 3.3 70B left the free tier in Aug 2026), so the model id can be
 * swapped via GROQ_MODEL without a code change — but the user-facing name in features/create/model.ts
 * (CLOUD_AI) describes the DEFAULT model; update both together if the default ever changes.
 *
 * Nothing in here may run without GROQ_API_KEY: with no key the config is null, the status route
 * reports "not configured", and /create simply never offers the cloud path (template engine instead).
 */

export const CLOUD_AI_PROVIDER = "Groq";
export const CLOUD_AI_DEFAULT_MODEL = "openai/gpt-oss-120b";
/** Display name for the default model (an operator-set GROQ_MODEL override shows its raw id instead). */
export const CLOUD_AI_DEFAULT_MODEL_NAME = "GPT-OSS 120B";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 25_000;
/** Short batches only (hooks/ideas/captions): caps token spend well inside the free 200K tokens/day. */
const MAX_TOKENS = 700;

export interface CloudAiConfig {
  apiKey: string;
  model: string;
  endpoint: string;
}

export interface CloudAiStatus {
  configured: boolean;
  provider: string;
  /** The model id that will serve requests (the default, or the GROQ_MODEL override). */
  model: string;
  /** Human-readable model name for UI copy. */
  modelName: string;
}

export class CloudAiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "CloudAiError";
    this.status = status;
  }
}

/** The only env this module reads (a minimal shape so tests can pass plain objects). */
export interface CloudAiEnv {
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
}

/** process.env, viewed through the only two keys this module reads. */
const defaultEnv = (): CloudAiEnv => process.env as unknown as CloudAiEnv;

/** Null when GROQ_API_KEY is unset or blank — the cloud path simply does not exist then. */
export function cloudAiConfig(env: CloudAiEnv = defaultEnv()): CloudAiConfig | null {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;
  const model = env.GROQ_MODEL?.trim() || CLOUD_AI_DEFAULT_MODEL;
  return { apiKey, model, endpoint: GROQ_ENDPOINT };
}

export function cloudAiStatus(env: CloudAiEnv = defaultEnv()): CloudAiStatus {
  const config = cloudAiConfig(env);
  const model = config?.model ?? CLOUD_AI_DEFAULT_MODEL;
  return {
    configured: !!config,
    provider: CLOUD_AI_PROVIDER,
    model,
    modelName: model === CLOUD_AI_DEFAULT_MODEL ? CLOUD_AI_DEFAULT_MODEL_NAME : model,
  };
}

interface ChatCompletionBody {
  choices?: { message?: { content?: unknown } }[];
}

/**
 * One chat completion against Groq's OpenAI-compatible endpoint. Resolves with the raw text;
 * throws CloudAiError on any failure (HTTP error, timeout, malformed or empty completion) —
 * callers treat every throw the same way: the generation falls back to another honest source.
 * `fetchImpl`/`config` are injectable so tests never touch the network or a real key.
 */
export async function runCloudChat(
  prompt: { system: string; user: string },
  opts: {
    config?: CloudAiConfig | null;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    /** response cap; defaults to MAX_TOKENS (the short-batch budget). The clipper's
     *  highlight route passes a larger one — its replies carry several candidates. */
    maxTokens?: number;
    /** defaults to 0.8 (creative batches). The clipper passes 0.4 (editorial judgment). */
    temperature?: number;
  } = {},
): Promise<string> {
  const config = opts.config !== undefined ? opts.config : cloudAiConfig();
  if (!config) throw new CloudAiError("The free AI service is not configured (GROQ_API_KEY is unset).");
  const doFetch = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await doFetch(config.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? MAX_TOKENS,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new CloudAiError(`The free AI service answered with HTTP ${res.status}.`, res.status);
    const body = (await res.json().catch(() => null)) as ChatCompletionBody | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new CloudAiError("The free AI service returned an empty completion.");
    return content;
  } finally {
    clearTimeout(timer);
  }
}
