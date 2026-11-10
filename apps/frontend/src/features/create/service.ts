/**
 * The generation service: one entry point the page calls, which routes between the honest sources.
 *
 * Routing rules (first success wins):
 *   1. Cloud — when a `runCloud` runner is supplied (the page supplies it only when the server says
 *      the site's free AI is configured): build the prompt, run it, parse. This is the primary AI
 *      path: a full-size model on a server, nothing runs on the visitor's device.
 *   2. Local model — when the visitor opted in and it is ready (`modelEnabled` + `runModel`).
 *   3. Template engine — always available, deterministic, works offline.
 * ANY runner failure (load error, network error, rate limit, unusable output) moves to the next
 * source with `fellBack: true` and a plain note the page shows. A failed model never produces
 * an empty screen, and no batch ever hides which source actually wrote it.
 *
 * Runners are injected functions, so tests drive every path with fakes — no network, no downloads.
 */
import type { CaptionInput, HooksInput, IdeasInput } from "./templates";
import { generateCaptions, generateHooks, generateIdeas, clampCount } from "./templates";
import { buildPrompt, parseModelOutput, MIN_MODEL_RATIO } from "./prompts";
import type { GeneratedItem, GeneratorKind, Source } from "./model";

export type AnyInput = IdeasInput | HooksInput | CaptionInput;

/** Runs one prompt on a model and resolves with its raw text. Supplied by cloudAi.ts / localModel.ts. */
export type ModelRunner = (prompt: { system: string; user: string }) => Promise<string>;

export interface GenerationOutcome {
  items: GeneratedItem[];
  source: Source;
  /** True when a stronger source was asked for but the batch actually came from a weaker one. */
  fellBack: boolean;
  /** Plain-language note for the UI when a fallback happened. */
  note?: string;
}

const FALLBACK_NOTE = "The local model could not run on this device, so this batch came from the template engine instead.";
const CLOUD_FALLBACK_NOTE = "The free AI service was not available for this batch, so it came from the template engine instead.";
const CLOUD_TO_LOCAL_NOTE = "The free AI service was not available for this batch, so the local model wrote it instead.";
const CLOUD_AND_LOCAL_NOTE = "The free AI service and the local model were both unavailable for this batch, so it came from the template engine instead.";

export function templateBatch(kind: GeneratorKind, input: AnyInput): GeneratedItem[] {
  if (kind === "ideas") return generateIdeas(input as IdeasInput);
  if (kind === "hooks") return generateHooks(input as HooksInput);
  return generateCaptions(input as CaptionInput);
}

const wantedCount = (kind: GeneratorKind, input: AnyInput): number =>
  kind === "captions" ? 3 : clampCount((input as IdeasInput | HooksInput).count);

/** Run one runner and parse; null on ANY failure or when too few usable items came back. */
async function tryRunner(runner: ModelRunner, kind: GeneratorKind, input: AnyInput): Promise<GeneratedItem[] | null> {
  try {
    const raw = await runner(buildPrompt(kind, input));
    const wanted = wantedCount(kind, input);
    const items = parseModelOutput(kind, raw, wanted);
    return items.length >= Math.max(1, Math.ceil(wanted * MIN_MODEL_RATIO)) ? items : null;
  } catch {
    return null;
  }
}

export interface GenerationDeps {
  /** The site's free cloud AI runner — supplied by the page only when the server reports it configured. Tried first. */
  runCloud?: ModelRunner;
  /** The on-device model, when the visitor opted in and it finished loading. */
  modelEnabled: boolean;
  runModel?: ModelRunner;
}

export async function generateContent(
  kind: GeneratorKind,
  input: AnyInput,
  deps: GenerationDeps,
): Promise<GenerationOutcome> {
  let cloudFailed = false;
  if (deps.runCloud) {
    const items = await tryRunner(deps.runCloud, kind, input);
    if (items) return { items, source: "cloud", fellBack: false };
    cloudFailed = true;
  }
  if (deps.modelEnabled && deps.runModel) {
    const items = await tryRunner(deps.runModel, kind, input);
    if (items) {
      return cloudFailed
        ? { items, source: "model", fellBack: true, note: CLOUD_TO_LOCAL_NOTE }
        : { items, source: "model", fellBack: false };
    }
    return {
      items: templateBatch(kind, input),
      source: "template",
      fellBack: true,
      note: cloudFailed ? CLOUD_AND_LOCAL_NOTE : FALLBACK_NOTE,
    };
  }
  if (cloudFailed) {
    return { items: templateBatch(kind, input), source: "template", fellBack: true, note: CLOUD_FALLBACK_NOTE };
  }
  return { items: templateBatch(kind, input), source: "template", fellBack: false };
}
