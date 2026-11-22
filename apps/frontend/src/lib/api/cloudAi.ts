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
 * Called through Workers AI's OpenAI-compatible endpoint, so the
 * request/response shape is unchanged:
 * `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions`
 * (verified on developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/,
 * updated 2026-09-17). Standing free allocation: 10,000 Neurons/day, resets
 * 00:00 UTC, hard stop when exhausted.
 *
 * Model history: the switch first kept Groq's model (`@cf/openai/gpt-oss-120b`,
 * a reasoning model — Workers AI runs it at medium reasoning by default).
 * Live on 2026-11-21 it failed the AI Edit plan step twice in a row: once
 * the call never came back inside the 25s timeout (reasoning models are
 * slow), once it answered but with no plan items the parser could use
 * (Workers AI blank/unparseable completions are a known failure mode of
 * the free tier). Auth was never the problem — no 401/403 in either
 * attempt. So the default moved to `@cf/meta/llama-3.1-8b-instruct`, a fast
 * non-reasoning instruct model — and that one was dead on arrival:
 * Cloudflare retired the Llama 3.1 8B family on 2026-11-20 (changelog
 * 2026-11-05; the deprecated list names the `-fp8` variant, our exact id
 * was not listed, but every live call to it returned HTTP 410 Gone from
 * 18:13 IST on 2026-11-21 — five logged failures, all status 410, no
 * 401/403/429). A retired model answers 410, never a plan, so no timeout
 * or token change can fix it. The default is now
 * `@cf/google/gemma-4-26b-a4b-it`, Cloudflare's own recommended smaller
 * replacement for the retired models. Live on 2026-11-21 Gemma answered
 * the plan twice (21:17/21:18 IST) with an EMPTY completion after 26s/40s
 * of generation — kind "empty", no status, HTTP 502 to the caller. Cause:
 * Gemma 4 thinks before it answers and can put its whole answer in a
 * `reasoning` field with `content` empty (documented on Ollama's
 * /v1/chat/completions for gemma4:26b, ollama/ollama #15288, where
 * `reasoning_effort: "none"` moved the answer back into `content`). The
 * client now sends `reasoning_effort: "none"` and reads the reasoning
 * fields as a fallback; a still-empty completion logs its structural
 * shape (`detail`) instead of just "empty". That fixed the empty
 * completions — Gemma started answering with text — but the plan still
 * parsed to 0 items. A success-path parse log then showed why: Gemma
 * answers the plan prompt with a long Markdown bullet list (~4,200
 * chars, startsWith "*", no fence, HTTP 200), even with
 * `response_format: json_object` (the endpoint silently ignores JSON
 * mode for this model — no 400) and even with the prompt demanding one
 * `{"plan": [...]}` object. A 400-char preview of the answer (logged
 * 00:40 IST 2026-11-22) showed the real shape: Gemma ECHOES the user
 * message back as bullets — "Video length: 43.5s.", "Visual style:
 * Cinematic (...).", "Transcript:", then the transcript lines
 * numbered — and spends its whole 1200-token budget restating the
 * input, never reaching a plan. The system instruction ("Return ONLY
 * one JSON object...") is sent correctly but has no visible effect, so
 * the planner prompt now ALSO carries the instruction inside the user
 * message itself (first line and last line). And the default is back
 * to `@cf/openai/gpt-oss-120b`: it is the only model with a PROVEN plan
 * on this exact flow — the owner's own run on 2026-11-21 planned 8
 * visuals on his "Untitled AI Edit" project. It is slow (a reasoning
 * model; the plan call gets one 45s attempt), but a slow plan beats a
 * fast echo. Exhaustion answers 429 and the routes report it as
 * "daily limit" — the same message as before. The model stays
 * overridable via CLOUDFLARE_AI_MODEL, so a swap needs no code change.
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

/** Failure kind, so callers (and the server logs) can tell a timeout from an
 * empty answer instead of both collapsing into "unknown": "http" is an HTTP
 * error status from Workers AI, "timeout" is the request abort, "network"
 * is a fetch-level failure before any response, "empty" is a 200 whose
 * completion carried no usable text. */
export type CloudAiErrorKind = "http" | "timeout" | "network" | "empty";

export class CloudAiError extends Error {
  readonly status?: number;
  readonly kind?: CloudAiErrorKind;
  /** Structural detail about the failure (never content text): the routes log it. */
  readonly detail?: Record<string, unknown>;
  constructor(message: string, status?: number, kind?: CloudAiErrorKind, detail?: Record<string, unknown>) {
    super(message);
    this.name = "CloudAiError";
    this.status = status;
    this.kind = kind ?? (status !== undefined ? "http" : undefined);
    this.detail = detail;
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

interface ChatCompletionMessage {
  content?: unknown;
  reasoning_content?: unknown;
  reasoning?: unknown;
}

interface ChatCompletionBody {
  choices?: { message?: ChatCompletionMessage; finish_reason?: unknown }[];
}

/** Reasoning models can put their whole answer in a `reasoning` /
 * `reasoning_content` field and leave `content` empty (seen on Ollama's
 * /v1/chat/completions for gemma4:26b — GitHub ollama/ollama #15288).
 * Live on Workers AI 2026-11-21 Gemma answered the AI Edit plan twice
 * with an empty completion after 26s/40s of generation — the thinking
 * consumed the call and `content` came back empty. So the reader below
 * reads the reasoning fields as a fallback. Do NOT also send
 * `reasoning_effort: "none"`: it was added for Gemma on 2026-11-21, but
 * live on 2026-11-22 the endpoint answered the GPT-OSS plan call with
 * HTTP 400 in ~2s — and "none" is not in OpenAI's reasoning_effort enum
 * (low/medium/high), so it is a suspect for the rejection. Likewise do
 * NOT send `response_format: json_object`: it was added for the planner
 * on 2026-11-21, Gemma silently ignored it, and it is the other suspect
 * for the same 400. The request body now carries ONLY model, messages,
 * temperature and max_tokens — the exact shape of the owner's one
 * successful GPT-OSS plan run (2026-11-21 17:21 IST, 8 visuals). The
 * planner's JSON format is enforced by the prompt alone (the instruction
 * sits in the user message, first and last line). */

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
 * Callers with a tight serverless budget pass `maxAttempts: 1` instead and
 * spend the whole budget on one longer attempt (the AI Edit planner does
 * this: two 25s attempts timed out twice on the live test project
 * 2026-11-21, while one 45s attempt fits the route's budget).
 *
 * Every throw is a CloudAiError with a kind — a fetch-level throw used to
 * escape as a raw AbortError/TypeError, and an empty completion carried no
 * status, so both logged server-side as status "unknown" and the user saw
 * the same generic message for a timeout, a dead network and an unusable
 * answer (seen live 2026-11-21 on Gemma: two plan failures, both
 * "unknown"). Callers map the kind to the user-facing wording.
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
    /** max attempts (transient retry included); defaults to 2. Callers with a
     *  tight serverless budget pass 1 and spend it all on one longer attempt. */
    maxAttempts?: number;
  } = {},
): Promise<string> {
  const config = opts.config !== undefined ? opts.config : cloudAiConfig();
  if (!config) throw new CloudAiError("The free AI service is not configured (Cloudflare credentials are unset).");
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 2);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await attemptCloudChat(prompt, config, opts);
    } catch (err) {
      lastError = err;
      // Retryable: a free-tier 429 / 5xx from Workers AI, or a fetch-level throw (network blip,
      // timeout abort). Not retryable: any other HTTP status, or an empty/malformed completion.
      const retryable =
        (err instanceof CloudAiError &&
          (err.status === 429 ||
            (err.status !== undefined && err.status >= 500) ||
            err.kind === "timeout" ||
            err.kind === "network")) ||
        !(err instanceof CloudAiError);
      if (!retryable || attempt === maxAttempts - 1) throw err;
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
    let res: Response;
    try {
      res = await doFetch(config.endpoint, {
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
          // NOTHING else goes in this body. Two extra params were tried
          // and both are suspects for a live HTTP 400 on GPT-OSS
          // (2026-11-22 09:46 IST, rejected in ~2s): `reasoning_effort:
          // "none"` ("none" is not in OpenAI's low/medium/high enum) and
          // `response_format: json_object` (Gemma silently ignored it).
          // The prompt alone carries the JSON format instruction.
        }),
        signal: ctrl.signal,
      });
    } catch (err) {
      // A fetch-level throw has no HTTP status — name it, or the caller
      // logs "unknown" and the user gets the generic message (2026-11-21).
      if (ctrl.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
        throw new CloudAiError("The free AI request timed out.", undefined, "timeout");
      }
      throw new CloudAiError("The free AI request failed before answering.", undefined, "network");
    }
    if (!res.ok) throw new CloudAiError(`The free AI service answered with HTTP ${res.status}.`, res.status, "http");
    const body = (await res.json().catch(() => null)) as ChatCompletionBody | null;
    // Some models answer content as text parts instead of one string —
    // join the parts instead of calling the completion empty; a reasoning
    // model can also put its answer in a reasoning field with `content`
    // empty, so read those fields too (see the note above).
    const content = extractMessageText(body?.choices?.[0]?.message);
    if (!content.trim())
      throw new CloudAiError(
        "The free AI service returned an empty completion.",
        undefined,
        "empty",
        describeCompletion(body),
      );
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** A completion message's text: `content` first (a plain string, or an
 * array of `{type:"text",text}` parts — some Workers AI models answer that
 * way), then the reasoning fields Gemma 4 can use instead (`reasoning_content`,
 * `reasoning`). Anything else is empty. */
function extractMessageText(message: ChatCompletionMessage | undefined): string {
  if (!message) return "";
  return extractContent(message.content) || extractContent(message.reasoning_content) || extractContent(message.reasoning);
}

/** A completion's text: a plain string, or an array of `{type:"text",text}`
 * parts (some Workers AI models answer that way). Anything else is empty. */
function extractContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part && typeof (part as { text: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .join("");
  }
  return "";
}

/**
 * The structural shape of an empty completion — field names and types only,
 * never any text — so the next failure names exactly where the answer went
 * instead of just "empty". Recorded on the CloudAiError as `detail` and
 * logged by the routes.
 */
function describeCompletion(body: ChatCompletionBody | null): Record<string, unknown> {
  if (body === null) return { bodyJson: false };
  const choice = body.choices?.[0];
  const message = choice?.message;
  return {
    bodyJson: true,
    choices: Array.isArray(body.choices) ? body.choices.length : 0,
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
    messageKeys: message && typeof message === "object" ? Object.keys(message).sort() : [],
    contentType: message === undefined ? "no-message" : contentTypeOf(message.content),
    reasoningContentType: message === undefined ? "no-message" : contentTypeOf(message.reasoning_content),
    reasoningType: message === undefined ? "no-message" : contentTypeOf(message.reasoning),
  };
}

function contentTypeOf(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value.length === 0 ? "empty-string" : "string";
  if (Array.isArray(value)) return `array:${value.length}`;
  return typeof value;
}
