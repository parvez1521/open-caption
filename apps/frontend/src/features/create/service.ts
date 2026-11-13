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
import { generateCaptions, generateHooks, generateIdeas, clampCount, HOOK_MECHANISMS } from "./templates";
import type { RepurposeInput } from "./repurpose";
import { generateRepurposed } from "./repurpose";
import { applySponsored } from "./captionStudio";
import { buildPrompt, parseModelOutput, MIN_MODEL_RATIO } from "./prompts";
import type { GeneratedItem, GeneratorKind, Source } from "./model";
import type { BrandProfile } from "./brandProfile";

export type AnyInput = IdeasInput | HooksInput | CaptionInput | RepurposeInput;

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

const FALLBACK_NOTE = "The local model could not run on this device. This batch came from the template engine instead.";
const CLOUD_FALLBACK_NOTE = "The free AI service was not available for this batch. So it came from the template engine instead.";
const CLOUD_TO_LOCAL_NOTE = "The free AI service was not available for this batch. So the local model wrote it instead.";
const CLOUD_AND_LOCAL_NOTE = "The free AI service and the local model were both unavailable. So this batch came from the template engine instead.";

/**
 * Attach the written mechanism explanation for the requested hook style. The mechanism is our
 * explanation of the style the user picked, so it is honest on every source (template, local
 * model and cloud alike): parseModelOutput leaves it unset, and this is where it is added.
 */
function withMechanism(kind: GeneratorKind, input: AnyInput, items: GeneratedItem[]): GeneratedItem[] {
  if (kind !== "hooks") return items;
  const mechanism = HOOK_MECHANISMS[(input as HooksInput).style];
  if (!mechanism) return items;
  return items.map((item) => ({ ...item, mechanism }));
}

export function templateBatch(kind: GeneratorKind, input: AnyInput, profile?: BrandProfile | null): GeneratedItem[] {
  const effective: AnyInput = profile ? { ...input, profile: (input as AnyInput).profile ?? profile } : input;
  if (kind === "ideas") return withMechanism(kind, effective, generateIdeas(effective as IdeasInput));
  if (kind === "hooks") return withMechanism(kind, effective, generateHooks(effective as HooksInput));
  if (kind === "repurpose") {
    // Repurposing an empty source returns [] on purpose (repurpose.ts invents
    // nothing): the batch surfaces empty and the PAGE must require source
    // text before calling. Do not substitute filler content here.
    return generateRepurposed(effective as RepurposeInput);
  }
  return generateCaptions(effective as CaptionInput);
}

/** Parts a repurpose batch may carry at most on the model path (template transforms cap at 10). */
const REPURPOSE_MAX_PARTS = 50;

const wantedCount = (kind: GeneratorKind, input: AnyInput): number =>
  kind === "captions" ? 3 : kind === "repurpose" ? REPURPOSE_MAX_PARTS : clampCount((input as IdeasInput | HooksInput).count);

/** Run one runner and parse; null on ANY failure or when too few usable items came back. */
async function tryRunner(
  runner: ModelRunner,
  kind: GeneratorKind,
  input: AnyInput,
  profile?: BrandProfile | null,
): Promise<GeneratedItem[] | null> {
  try {
    const raw = await runner(buildPrompt(kind, input, profile));
    const wanted = wantedCount(kind, input);
    const items = parseModelOutput(
      kind,
      raw,
      wanted,
      kind === "repurpose" ? (input as RepurposeInput).transform : undefined,
    );
    // Repurposing has no requested count — the part count comes from the
    // source text — so the half-batch rule does not apply: any parsed part
    // is a usable batch, and zero parts is the failure.
    const minimum = kind === "repurpose" ? 1 : Math.max(1, Math.ceil(wanted * MIN_MODEL_RATIO));
    if (items.length < minimum) return null;
    return withMechanism(kind, input, items);
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
  /** The active Brand Voice profile, when one is selected. Flows into prompts and the template engine. */
  profile?: BrandProfile | null;
}

export async function generateContent(
  kind: GeneratorKind,
  input: AnyInput,
  deps: GenerationDeps,
): Promise<GenerationOutcome> {
  const outcome = await generateRouted(kind, input, deps);
  // Sponsored enforcement (3.6) runs LAST, on the final items from whichever
  // source won — after any profile CTA the generator appended — so the
  // sponsor's talking points and disclosure are present verbatim and the
  // disclosure is truly the final line, on every source including templates.
  if (kind === "captions") {
    const sponsored = (input as CaptionInput).sponsored;
    if (sponsored) return { ...outcome, items: applySponsored(outcome.items, sponsored) };
  }
  return outcome;
}

async function generateRouted(
  kind: GeneratorKind,
  input: AnyInput,
  deps: GenerationDeps,
): Promise<GenerationOutcome> {
  const profile = deps.profile ?? null;
  let cloudFailed = false;
  if (deps.runCloud) {
    const items = await tryRunner(deps.runCloud, kind, input, profile);
    if (items) return { items, source: "cloud", fellBack: false };
    cloudFailed = true;
  }
  if (deps.modelEnabled && deps.runModel) {
    const items = await tryRunner(deps.runModel, kind, input, profile);
    if (items) {
      return cloudFailed
        ? { items, source: "model", fellBack: true, note: CLOUD_TO_LOCAL_NOTE }
        : { items, source: "model", fellBack: false };
    }
    return {
      items: templateBatch(kind, input, profile),
      source: "template",
      fellBack: true,
      note: cloudFailed ? CLOUD_AND_LOCAL_NOTE : FALLBACK_NOTE,
    };
  }
  if (cloudFailed) {
    return { items: templateBatch(kind, input, profile), source: "template", fellBack: true, note: CLOUD_FALLBACK_NOTE };
  }
  return { items: templateBatch(kind, input, profile), source: "template", fellBack: false };
}
