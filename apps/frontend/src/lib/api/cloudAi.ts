import "server-only";

/**
 * The Creator Studio "Free AI": one shared server-side key for a small
 * production Next.js app; short-form text generation (hooks, content ideas,
 * caption suggestions, transcript correction, visual plans, clip highlights).
 *
 * Provider history: Groq's Free Plan served this from 2026-11-10 (model
 * openai/gpt-oss-120b — 30 RPM / 1,000 RPD / 8,000 TPM / 200K TPD, no card,
 * no training on inputs). In production the Groq calls started failing on
 * every feature from 2026-11-20 with no named cause, and the owner ordered
 * the switch off Groq on 2026-11-21. Note for the record: Groq's free tier
 * itself was still live when checked publicly on 2026-11-19, so the likeliest
 * cause was the production key (expired/revoked) rather than the tier being
 * withdrawn — regenerating the Groq key would probably have fixed it, but the
 * owner chose a new provider instead.
 *
 * Current provider (2026-11-21): Cloudflare Workers AI — the documented
 * runner-up from the 2026-11-10 comparison (research/free-ai-options.md).
 * Same 120B model (`@cf/openai/gpt-oss-120b`), called through Workers AI's
 * OpenAI-compatible endpoint, so the request/response shape is unchanged:
 * `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions`
 * (verified on developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/,
 * updated 2026-09-17). Standing free allocation: 10,000 Neurons/day, resets
 * 00:00 UTC, hard stop when exhausted. At the official Neuron rates
 * (31,818/M input, 68,182/M output) a short call costs ~17 Neurons
 * (~600/day); a full 2,000-token planner reply costs ~200 Neurons, so the
 * Neuron budget binds before the site's own daily buckets only if planner
 * use grows far past today's traffic. Exhaustion answers 429 and the routes
 * report it as "daily limit" — the same message as before.
 *
 * Why not Gemini free (the owner asked for "Gemini or any other free model"):
 * the 2026-11-10 research rejected it — Google's Unpaid Services terms let
 * Google use submitted content to improve its products with human review
 * possible, numeric limits are unpublished per-project and "not guaranteed",
 * and the free tier may not serve EEA/CH/UK users. It also matches the
 * owner's own history of dropping Gemini free as unreliable.
 *
 * Data terms (Workers AI): zero data retention for standard inference,
 * "Cloudflare does not use Customer Content processed by Workers AI to train
 * AI models" — developers.cloudflare.com/workers-ai/platform/data-usage/.
 * No commercial ban found; REST API callable from Vercel with an API token
 * + account id. The token is created in the Cloudflare dashboard (Workers AI
 * page → "Use REST API" → "Create a Workers AI API Token"); it needs the
 * Account > Workers AI > Read permission.
 *
 * Nothing in here may run without the Cloudflare credentials: with no account
 * id or token the config is null, the status route reports "not configured",
 * and /create simply never offers the cloud path (template engine instead).
 */

export const CLOUD_AI_PROVIDER = "Cloudflare";
export const CLOUD_AI_DEFAULT_MODEL = "@cf/openai/gpt-oss-120b";
/** Display name for the default model (an operator-set CLOUDFLARE_AI_MODEL override shows its raw id instead). */
export const CLOUD_AI_DEFAULT_MODEL_NAME = "GPT-OSS 120B";

const WORKERS_AI_BASE = "https://api.cloudflare.com/client/v4/accounts";
const TIMEOUT_MS = 25_000;
/** Short batches only (hooks/ideas/captions): caps token spend well inside the free 10,000 Neurons/day. */
const MAX_TOKENS = 700;

export interface CloudAiConfig {
  apiKey: string;
  model: string;
  endpoint: string;
}

export interface CloudAiStatus {
  configured: boolean;
  provider: string;
  /** The model id that will serve requests (the default, or the CLOUDFLARE_AI_MODEL override). */
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
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_KEY?: string;
  CLOUDFLARE_AI_MODEL?: string;
}

/** process.env, viewed through the only two keys this module reads. */
const defaultEnv = (): CloudAiEnv => process.env as unknown as CloudAiEnv;

/**
 * Null when CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_KEY is unset or blank —
 * the cloud path simply does not exist then.
 */
export function cloudAiConfig(env: CloudAiEnv = defaultEnv()): CloudAiConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiKey = env.CLOUDFLARE_API_KEY?.trim();
  if (!accountId || !apiKey) return null;
  const model = env.CLOUDFLARE_AI_MODEL?.trim() || CLOUD_AI_DEFAULT_MODEL;
  return { apiKey, model, endpoint: `${WORKERS_AI_BASE}/${accountId}/ai/v1/chat/completions` };
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
 * One chat completion against Workers AI's OpenAI-compatible endpoint.
 * Resolves with the raw text; throws CloudAiError on any failure (HTTP
 * error, timeout, malformed or empty completion) — callers treat every
 * throw the same way: the generation falls back to another honest source.
 * `fetchImpl`/`config` are injectable so tests never touch the network or a
 * real token.
 *
 * Transient upstream failures (a 429 when the daily Neuron budget is spent,
 * 5xx, a network blip, a timeout) get exactly ONE retry after a short
 * delay — a single-attempt call turned every free-tier hiccup into a dead
 * feature. Deterministic failures (other 4xx, an empty or malformed
 * completion) are never retried: a second attempt would fail the same way.
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
    /** delay before the single transient retry; defaults to 1000ms. Tests pass 0. */
    retryDelayMs?: number;
  } = {},
): Promise<string> {
  const config = opts.config !== undefined ? opts.config : cloudAiConfig();
  if (!config) throw new CloudAiError("The free AI service is not configured (Cloudflare credentials are unset).");
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await attemptCloudChat(prompt, config, opts);
    } catch (err) {
      lastError = err;
      // Retryable: a free-tier 429 / 5xx from Workers AI, or a fetch-level throw (network blip,
      // timeout abort). Not retryable: any other HTTP status, or an empty/malformed completion.
      const retryable =
        (err instanceof CloudAiError && (err.status === 429 || (err.status !== undefined && err.status >= 500))) ||
        !(err instanceof CloudAiError);
      if (!retryable || attempt === 1) throw err;
      await sleep(opts.retryDelayMs ?? 1000);
    }
  }
  throw lastError;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function attemptCloudChat(
  prompt: { system: string; user: string },
  config: CloudAiConfig,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; maxTokens?: number; temperature?: number },
): Promise<string> {
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
