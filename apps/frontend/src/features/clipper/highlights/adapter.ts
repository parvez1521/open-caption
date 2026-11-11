/**
 * The highlight engine's provider adapter — the seam where the semantic
 * model plugs in, with the product's standing routing discipline:
 *
 *  1. The dedicated clipper cloud runner (Groq free tier via
 *     /api/v1/clipper/highlights, key server-side only) when the deployment
 *     has it switched on;
 *  2. The opt-in on-device model (SmolLM2) when the visitor enabled it;
 *  3. Otherwise NO runner — the engine takes the deterministic signals path
 *     and badges it. There is no paid fallback and none may be added here.
 *
 * Deliberately NOT used: the Creator Studio's `runCloud` (the
 * /api/v1/create/generate route), whose 4,000-char prompt cap cannot carry a
 * transcript window. A future local model (an Ollama-style endpoint, a bigger
 * on-device model) plugs in by supplying another runner of this same shape.
 */
import type { ModelRunner } from "../../create/service";

export interface HighlightAdapterDeps {
  /** The clipper cloud runner — supplied by the page only when the server reports it configured. */
  runClipCloud?: ModelRunner;
  /** The on-device model, when the visitor opted in and it is ready. */
  modelEnabled: boolean;
  runModel?: ModelRunner;
}

export interface ResolvedHighlightRunner {
  runner: ModelRunner;
  source: "cloud" | "model";
  /** hosted free tier tolerates parallel windows; an on-device model is already saturating the device */
  concurrency: number;
}

export function resolveHighlightRunner(deps: HighlightAdapterDeps): ResolvedHighlightRunner | null {
  if (deps.runClipCloud) return { runner: deps.runClipCloud, source: "cloud", concurrency: 3 };
  if (deps.modelEnabled && deps.runModel) return { runner: deps.runModel, source: "model", concurrency: 1 };
  return null;
}
