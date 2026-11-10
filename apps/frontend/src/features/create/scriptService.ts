/**
 * Script Studio routing (3.5): the same honest three-source routing as
 * service.ts, for whole scripts instead of item batches.
 *
 *   1. Cloud — when a `runCloud` runner is supplied.
 *   2. Local model — when the visitor opted in and it is ready.
 *   3. Template engine — always available (scripts.generateScript).
 * Any runner failure or unparseable output (parseScriptOutput returning null)
 * moves to the next source with `fellBack: true` and a plain note, in the same
 * voice as service.ts. The script a caller gets always names its source.
 *
 * Runners and deps are the service.ts types, imported type-only so there is
 * no import cycle: service.ts never imports this module.
 */
import type { GenerationDeps, ModelRunner } from "./service";
import type { Source } from "./model";
import { buildScriptPrompt, generateScript, parseScriptOutput, type ScriptDoc, type ScriptInput } from "./scripts";

export interface ScriptOutcome {
  script: ScriptDoc;
  source: Source;
  fellBack: boolean;
  note?: string;
}

const FALLBACK_NOTE = "The local model could not run on this device, so this script came from the template engine instead.";
const CLOUD_FALLBACK_NOTE = "The free AI service was not available for this script, so it came from the template engine instead.";
const CLOUD_TO_LOCAL_NOTE = "The free AI service was not available for this script, so the local model wrote it instead.";
const CLOUD_AND_LOCAL_NOTE = "The free AI service and the local model were both unavailable for this script, so it came from the template engine instead.";

/** Run one runner and parse; null on ANY failure or unusable output. */
async function tryRunner(runner: ModelRunner, input: ScriptInput): Promise<ScriptDoc | null> {
  try {
    const raw = await runner(buildScriptPrompt(input));
    return parseScriptOutput(raw, input);
  } catch {
    return null;
  }
}

export async function generateScriptContent(
  input: ScriptInput,
  deps: GenerationDeps,
): Promise<ScriptOutcome> {
  const effective: ScriptInput = {
    ...input,
    profile: input.profile ?? deps.profile ?? null,
  };
  let cloudFailed = false;
  if (deps.runCloud) {
    const script = await tryRunner(deps.runCloud, effective);
    if (script) return { script, source: "cloud", fellBack: false };
    cloudFailed = true;
  }
  if (deps.modelEnabled && deps.runModel) {
    const script = await tryRunner(deps.runModel, effective);
    if (script) {
      return cloudFailed
        ? { script, source: "model", fellBack: true, note: CLOUD_TO_LOCAL_NOTE }
        : { script, source: "model", fellBack: false };
    }
    return {
      script: generateScript(effective),
      source: "template",
      fellBack: true,
      note: cloudFailed ? CLOUD_AND_LOCAL_NOTE : FALLBACK_NOTE,
    };
  }
  if (cloudFailed) {
    return { script: generateScript(effective), source: "template", fellBack: true, note: CLOUD_FALLBACK_NOTE };
  }
  return { script: generateScript(effective), source: "template", fellBack: false };
}
