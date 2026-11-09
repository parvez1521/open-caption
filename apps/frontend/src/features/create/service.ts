/**
 * The generation service: one entry point the page calls, which routes between the two honest sources.
 *
 * Routing rules:
 *   - Model disabled (the default) or no model runner supplied: template engine.
 *   - Model enabled: build the prompt, run the model, parse. Success with enough usable lines: model batch.
 *   - ANY model failure (load error, generation error, unusable output): template engine batch, with
 *     `fellBack: true` and a plain note the page shows. A failed model never produces an empty screen.
 *
 * The model is reached only through the injected `runModel` function, so tests drive this with fakes
 * and never download anything.
 */
import type { CaptionInput, HooksInput, IdeasInput } from "./templates";
import { generateCaptions, generateHooks, generateIdeas, clampCount } from "./templates";
import { buildPrompt, parseModelOutput, MIN_MODEL_RATIO } from "./prompts";
import type { GeneratedItem, GeneratorKind, Source } from "./model";

export type AnyInput = IdeasInput | HooksInput | CaptionInput;

/** Runs one prompt on the local model and resolves with its raw text. Supplied by localModel.ts. */
export type ModelRunner = (prompt: { system: string; user: string }) => Promise<string>;

export interface GenerationOutcome {
  items: GeneratedItem[];
  source: Source;
  /** True when the model was asked for but the batch actually came from the template engine. */
  fellBack: boolean;
  /** Plain-language note for the UI when a fallback happened. */
  note?: string;
}

const FALLBACK_NOTE = "The local model could not run on this device, so this batch came from the template engine instead.";

export function templateBatch(kind: GeneratorKind, input: AnyInput): GeneratedItem[] {
  if (kind === "ideas") return generateIdeas(input as IdeasInput);
  if (kind === "hooks") return generateHooks(input as HooksInput);
  return generateCaptions(input as CaptionInput);
}

const wantedCount = (kind: GeneratorKind, input: AnyInput): number =>
  kind === "captions" ? 3 : clampCount((input as IdeasInput | HooksInput).count);

export async function generateContent(
  kind: GeneratorKind,
  input: AnyInput,
  deps: { modelEnabled: boolean; runModel?: ModelRunner },
): Promise<GenerationOutcome> {
  if (!deps.modelEnabled || !deps.runModel) {
    return { items: templateBatch(kind, input), source: "template", fellBack: false };
  }
  try {
    const raw = await deps.runModel(buildPrompt(kind, input));
    const wanted = wantedCount(kind, input);
    const items = parseModelOutput(kind, raw, wanted);
    if (items.length < Math.max(1, Math.ceil(wanted * MIN_MODEL_RATIO))) {
      return { items: templateBatch(kind, input), source: "template", fellBack: true, note: FALLBACK_NOTE };
    }
    return { items, source: "model", fellBack: false };
  } catch {
    return { items: templateBatch(kind, input), source: "template", fellBack: true, note: FALLBACK_NOTE };
  }
}
