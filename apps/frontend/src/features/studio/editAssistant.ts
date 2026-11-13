import { getLook, TRENDING_LOOKS } from "@capseasy/templates";
import type { SegmentTransition } from "@capseasy/shared";
import type { Source } from "../create/model";
import type { GenerationDeps, ModelRunner } from "../create/service";
import { findProfanityMatches, approvedBleepRanges } from "./audio/bleep";
import { generateAutoZoomPlan, type AutoZoomIntensity } from "./autoZooms";
import {
  type BuildPolishPlanInput,
  type PolishBadge,
  type PolishPlan,
  type PolishStep,
} from "./polish";
import { proposeTrimCuts } from "./trim";

/**
 * Edit Assistant (Phase 8, Addition A8) — the honest Chat-to-Edit.
 *
 * The user types an instruction; a Phase-3 route (Groq free AI first, then
 * the opt-in on-device model — the SAME runners, rate limits and server
 * route as AI Studio Chat) translates it into ONE structured command from
 * the FIXED intent set below; the client then builds a previewable plan
 * locally and deterministically from that command. The plan is a
 * polish.ts {@link PolishPlan}: applying goes through `applyPolishPlan`
 * and StudioPage's single `editAll` commit, so one Ctrl+Z undoes the
 * whole thing and the per-step revert machinery works unchanged. There is
 * no second plan system.
 *
 * THE INTENT SET IS THE SINGLE SOURCE: {@link ASSISTANT_INTENTS} is read
 * by the prompt builder (the model is offered exactly these intents), by
 * the strict parser (a command validates only against these ids + ranges),
 * and by the panel's "What I can do" list (rendered from the same array).
 * A test pins all three to the same module.
 *
 * HONESTY RULES (pinned by tests):
 * - NO template fallback and NO heuristic language understanding. When no
 *   AI route is configured the feature is UNAVAILABLE with a stated
 *   reason (the A1 emphasis precedent) — the panel disables up front.
 * - A request outside the set, an unparseable reply, or out-of-range
 *   parameters is a REFUSAL: no plan, no state change, and the answer
 *   names the manual path (the panel/control that does it by hand).
 * - The plan shown is exactly the plan applied: steps are built once,
 *   locally, from the parsed command, and apply consumes that same plan
 *   object through polish's apply (identity pinned by tests against the
 *   standalone feature ops).
 * - Every assistant step is labelled "ai-suggested" with the route's
 *   badge, because the route DID choose this step (by reading the user's
 *   instruction). The step's CONTENT (which fillers, which pauses, which
 *   words bleep) is deterministic and its detail line says the counts.
 *
 * DROPPED CANDIDATES (no real op / no honest mapping from text):
 * - "Place a music track": placing needs a media-bin asset id, which no
 *   sentence can supply — the assistant can only duck a track that is
 *   already placed (Audio panel places tracks by hand).
 * - Generative media, B-roll generation, voiceover, reframing etc. are
 *   MISSING-SKIP in the programme (paid hosted models) — the assistant
 *   refuses them like any other out-of-set request.
 */

/* ------------------------------------------------------------------ */
/* the fixed intent set — the single source                            */
/* ------------------------------------------------------------------ */

export type AssistantIntentId =
  | "apply-caption-look"
  | "trim-fillers"
  | "remove-silences"
  | "add-title-card"
  | "auto-zooms"
  | "bleep-profanity"
  | "duck-music"
  | "set-segment-speed"
  | "add-transition";

export interface AssistantIntentDef {
  id: AssistantIntentId;
  /** the "What I can do" list heading */
  label: string;
  /** one example phrasing, rendered in the panel and named in the prompt */
  example: string;
  /** what it does, in one plain line (panel list + prompt) */
  description: string;
  /** where the user does this by hand — named in every refusal for it */
  manualPath: string;
  /** the params contract, written for the model prompt */
  promptSpec: string;
}

export const ASSISTANT_INTENTS: readonly AssistantIntentDef[] = [
  {
    id: "apply-caption-look",
    label: "Apply a caption look",
    example: "Apply the Beast Bounce caption look",
    description: "Switch the captions to one of the looks listed below.",
    manualPath: "the Templates panel — pick the look by hand",
    promptSpec: 'params: {"lookId": "<one look id from the look list below>"}',
  },
  {
    id: "trim-fillers",
    label: "Remove filler words",
    example: "Remove the ums and uhs",
    description: "Cut the filler words the transcript shows (deterministic list, from your transcript).",
    manualPath: "the Trim panel — Trim fillers & pauses",
    promptSpec: "params: {}",
  },
  {
    id: "remove-silences",
    label: "Remove long silences",
    example: "Cut silences longer than a second",
    description: "Remove pauses longer than a threshold (pauses are removed, not shortened).",
    manualPath: "the Trim panel — set the pause threshold and apply",
    promptSpec: 'params: {"thresholdMs": <integer 300–5000; use 1000 when the user says "a second" or gives no length>}',
  },
  {
    id: "add-title-card",
    label: "Add a title card",
    example: "Add a title card saying “My morning routine”",
    description: "Place a title card at the start, using your exact text.",
    manualPath: "the Text panel — Title card",
    promptSpec: 'params: {"title": "<the exact title text the user gave, 1–120 characters>"} — only when the user actually gave the title text',
  },
  {
    id: "auto-zooms",
    label: "Add punch-in zooms",
    example: "Add medium punch-in zooms",
    description: "Add editable punch-in zoom keyframes at emphasis points, pauses and loud moments.",
    manualPath: "the segment inspector — Auto zooms",
    promptSpec: 'params: {"intensity": "subtle" | "medium" | "strong"} — "medium" when the user gives no strength',
  },
  {
    id: "bleep-profanity",
    label: "Bleep profanity",
    example: "Bleep the swearing",
    description: "Bleep every word from the in-editor profanity list that the transcript shows.",
    manualPath: "the Audio panel — the profanity bleep review",
    promptSpec: "params: {}",
  },
  {
    id: "duck-music",
    label: "Duck the music under the voice",
    example: "Duck the music by 12 dB",
    description: "Turn on ducking on the music track that is already placed. So it dips under speech.",
    manualPath: "the Audio panel — the music track's ducking controls",
    promptSpec: 'params: {"amountDb": <number 1–24; 12 when the user gives no amount>}',
  },
  {
    id: "set-segment-speed",
    label: "Set a segment's playback speed",
    example: "Play segment 2 at 1.5× speed",
    description: "Change one segment's playback rate (0.25×–4×); its timing and captions rescale.",
    manualPath: "the segment inspector — Playback rate",
    promptSpec: 'params: {"segmentIndex": <1-based segment number>, "rate": <number 0.25–4>}',
  },
  {
    id: "add-transition",
    label: "Add a transition between segments",
    example: "Add a fade into segment 2",
    description: "Add a transition into a segment from the one before it.",
    manualPath: "the segment inspector — Transition in",
    promptSpec: 'params: {"segmentIndex": <the segment the transition goes INTO, at least 2>, "type": "fade" | "wipe" | "slide" | "zoom" | "blur", "durationMs": <integer 100–2000; 300 when the user gives no length>}',
  },
];

export const ASSISTANT_INTENT_IDS: readonly AssistantIntentId[] = ASSISTANT_INTENTS.map((d) => d.id);

export const intentDef = (id: AssistantIntentId): AssistantIntentDef =>
  ASSISTANT_INTENTS.find((d) => d.id === id)!;

/** The caption looks the assistant may apply — the trending set, id + name. */
export const ASSISTANT_LOOK_CANDIDATES: readonly { id: string; name: string }[] =
  TRENDING_LOOKS.map((l) => ({ id: l.id, name: l.name }));

/** Where out-of-set requests are done by hand, in one sentence. */
export const ASSISTANT_GENERIC_MANUAL_PATH =
  "the left-rail panels do every edit by hand: Templates (looks), Trim (fillers & pauses), Text (title cards), Audio (music ducking & bleeps), and the segment inspector (zooms, speed, transitions)";

export const ASSISTANT_NO_ROUTE_REASON =
  "No AI route is available for the Edit Assistant: the site's free AI is not configured and the on-device model is not enabled. The assistant has no template or keyword fallback — it never pretends to understand an instruction it didn't route through a model — so it stays off until a route is available. Every edit it knows is still available by hand in the panels.";

/* ------------------------------------------------------------------ */
/* commands (the parsed, validated structured output)                  */
/* ------------------------------------------------------------------ */

export type AssistantTransitionType = SegmentTransition["type"];

export type AssistantCommand =
  | { intent: "apply-caption-look"; lookId: string }
  | { intent: "trim-fillers" }
  | { intent: "remove-silences"; thresholdMs: number }
  | { intent: "add-title-card"; title: string }
  | { intent: "auto-zooms"; intensity: AutoZoomIntensity }
  | { intent: "bleep-profanity" }
  | { intent: "duck-music"; amountDb: number }
  | { intent: "set-segment-speed"; segmentIndex: number; rate: number }
  | { intent: "add-transition"; segmentIndex: number; transitionType: AssistantTransitionType; durationMs: number };

export type AssistantRefusalReason = "unsupported" | "unknown-intent" | "invalid-params" | "malformed";

export interface AssistantRefusal {
  reason: AssistantRefusalReason;
  /** the honest answer shown to the user */
  message: string;
  /** the manual path the answer names */
  manualPath: string;
}

export type AssistantParseResult =
  | { kind: "command"; command: AssistantCommand }
  | { kind: "refusal"; refusal: AssistantRefusal }
  | { kind: "malformed" };

/** What the parser/prompt may know about the project: bounds come from here, never from the model. */
export interface AssistantContext {
  segmentCount: number;
  hasMusicTrack: boolean;
  currentLookId?: string | null;
  lookIds?: readonly string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const refusal = (reason: AssistantRefusalReason, message: string, manualPath: string): AssistantParseResult => ({
  kind: "refusal",
  refusal: { reason, message, manualPath },
});

const CANT_DO_THAT = "I can't do that one yet. It's outside the list of edits I know how to make. So nothing was changed.";

const invalidParams = (def: AssistantIntentDef, detail: string): AssistantParseResult =>
  refusal(
    "invalid-params",
    `That ${def.label.toLowerCase()} request doesn't carry a usable value (${detail}), so nothing was changed. You can do it by hand in ${def.manualPath}.`,
    def.manualPath,
  );

const numIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;

const intIn = (v: unknown, min: number, max: number): number | null => {
  const n = numIn(v, min, max);
  return n === null ? null : Math.round(n);
};

const INTENSITIES: ReadonlySet<string> = new Set(["subtle", "medium", "strong"]);
const TRANSITION_TYPES: ReadonlySet<string> = new Set(["fade", "wipe", "slide", "zoom", "blur"]);

/**
 * Parse a route's raw reply STRICTLY against the intent set (the A1 /
 * Script Studio precedent: extract the JSON object, validate every field,
 * never clamp or guess). A parsed object with intent "unsupported" or an
 * unknown intent string is a definitive refusal; a reply with no JSON
 * object / no intent field is "malformed" (the routing layer may try the
 * next route before refusing).
 */
export function parseAssistantOutput(raw: string, ctx: AssistantContext): AssistantParseResult {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { kind: "malformed" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { kind: "malformed" };
  }
  if (!isRecord(parsed) || typeof parsed.intent !== "string") return { kind: "malformed" };
  const intent = parsed.intent;
  if (intent === "unsupported") return refusal("unsupported", CANT_DO_THAT, ASSISTANT_GENERIC_MANUAL_PATH);
  if (!ASSISTANT_INTENT_IDS.includes(intent as AssistantIntentId)) {
    return refusal("unknown-intent", CANT_DO_THAT, ASSISTANT_GENERIC_MANUAL_PATH);
  }
  const def = intentDef(intent as AssistantIntentId);
  const params: Record<string, unknown> = isRecord(parsed.params) ? parsed.params : {};
  switch (def.id) {
    case "apply-caption-look": {
      const lookIds = ctx.lookIds ?? ASSISTANT_LOOK_CANDIDATES.map((l) => l.id);
      if (typeof params.lookId !== "string" || !lookIds.includes(params.lookId) || !getLook(params.lookId)) {
        return invalidParams(def, "the look must be one of the listed look ids");
      }
      return { kind: "command", command: { intent: def.id, lookId: params.lookId } };
    }
    case "trim-fillers":
      return { kind: "command", command: { intent: def.id } };
    case "remove-silences": {
      const thresholdMs = intIn(params.thresholdMs, 300, 5000);
      if (thresholdMs === null) return invalidParams(def, "the pause length must be between 0.3s and 5s");
      return { kind: "command", command: { intent: def.id, thresholdMs } };
    }
    case "add-title-card": {
      const title = typeof params.title === "string" ? params.title.trim().replace(/\s+/g, " ") : "";
      if (title.length < 1 || title.length > 120) {
        return invalidParams(def, "a title card needs the exact text, 1–120 characters — say the words you want on it");
      }
      return { kind: "command", command: { intent: def.id, title } };
    }
    case "auto-zooms": {
      if (typeof params.intensity !== "string" || !INTENSITIES.has(params.intensity)) {
        return invalidParams(def, 'the strength must be "subtle", "medium" or "strong"');
      }
      return { kind: "command", command: { intent: def.id, intensity: params.intensity as AutoZoomIntensity } };
    }
    case "bleep-profanity":
      return { kind: "command", command: { intent: def.id } };
    case "duck-music": {
      const amountDb = numIn(params.amountDb, 1, 24);
      if (amountDb === null) return invalidParams(def, "the ducking amount must be between 1 and 24 dB");
      return { kind: "command", command: { intent: def.id, amountDb: Math.round(amountDb) } };
    }
    case "set-segment-speed": {
      const segmentIndex = intIn(params.segmentIndex, 1, Math.max(1, ctx.segmentCount));
      if (segmentIndex === null) {
        return invalidParams(def, `the segment number must be between 1 and ${Math.max(1, ctx.segmentCount)} for this project`);
      }
      const rate = numIn(params.rate, 0.25, 4);
      if (rate === null) return invalidParams(def, "the speed must be between 0.25× and 4×");
      return { kind: "command", command: { intent: def.id, segmentIndex, rate: Math.round(rate * 100) / 100 } };
    }
    case "add-transition": {
      const segmentIndex = intIn(params.segmentIndex, 2, Math.max(2, ctx.segmentCount));
      if (segmentIndex === null) {
        return invalidParams(def, `a transition goes into segment 2 to ${Math.max(2, ctx.segmentCount)} for this project`);
      }
      if (typeof params.type !== "string" || !TRANSITION_TYPES.has(params.type)) {
        return invalidParams(def, 'the type must be "fade", "wipe", "slide", "zoom" or "blur"');
      }
      const durationMs = intIn(params.durationMs, 100, 2000);
      if (durationMs === null) return invalidParams(def, "the length must be between 100 and 2000 ms");
      return {
        kind: "command",
        command: { intent: def.id, segmentIndex, transitionType: params.type as AssistantTransitionType, durationMs },
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* prompt + routing (Phase-3 routes; NO template floor)                */
/* ------------------------------------------------------------------ */

const ASSISTANT_SYSTEM =
  "You translate a video-editing instruction into ONE structured edit command for the editor. Reply with ONLY a JSON object — no prose, no explanations, no code fences.";

export function buildAssistantPrompt(userText: string, ctx: AssistantContext): { system: string; user: string } {
  const looks = ASSISTANT_LOOK_CANDIDATES.map((l) => `${l.id} = ${l.name}`).join("; ");
  const user = [
    "Choose the ONE intent that matches the instruction, from this fixed list — there are no others:",
    ...ASSISTANT_INTENTS.map((d) => `- "${d.id}" — ${d.description} Example: "${d.example}". ${d.promptSpec}`),
    'Output format: {"intent": "<one intent id>", "params": {...}}',
    'If the instruction asks for anything not in the list (generating media or B-roll, voiceover, reframing, deleting segments, changing colours, uploading, exporting, or anything else), output exactly {"intent": "unsupported"}.',
    "Use only values the user actually gave, plus the stated defaults. Never invent segment numbers, speeds or title text.",
    "",
    `This project: ${ctx.segmentCount} segment${ctx.segmentCount === 1 ? "" : "s"}; ${ctx.hasMusicTrack ? "a music track is placed" : "no music track is placed"}.`,
    `Caption looks (id = name): ${looks}`,
    "",
    `Instruction: ${userText}`,
  ].join("\n");
  return { system: ASSISTANT_SYSTEM, user };
}

/** True when at least one real AI route is configured — the panel disables the assistant otherwise. */
export function assistantRouteAvailable(deps: GenerationDeps): boolean {
  return Boolean(deps.runCloud) || Boolean(deps.modelEnabled && deps.runModel);
}

export type AssistantTurnResult =
  | {
      status: "command";
      command: AssistantCommand;
      /** always a real AI route — "template" can never appear here */
      source: Extract<Source, "cloud" | "model">;
      fellBack: boolean;
      note?: string;
    }
  | { status: "refusal"; refusal: AssistantRefusal }
  | { status: "unavailable"; reason: string };

const MALFORMED_REFUSAL: AssistantRefusal = {
  reason: "malformed",
  message: "The assistant's reply couldn't be understood as an edit command, so nothing was changed. Try rephrasing the instruction — or do it by hand.",
  manualPath: ASSISTANT_GENERIC_MANUAL_PATH,
};

const CLOUD_TO_LOCAL_NOTE = "The free AI service was not available for this request. So the local model read it instead.";

async function tryRunner(
  runner: ModelRunner,
  userText: string,
  ctx: AssistantContext,
): Promise<AssistantParseResult | null> {
  try {
    return parseAssistantOutput(await runner(buildAssistantPrompt(userText, ctx)), ctx);
  } catch {
    return null;
  }
}

/**
 * Run one assistant turn: cloud free AI → on-device model, first DEFINITIVE
 * answer wins (a parsed command OR a parsed refusal). A malformed reply or
 * a thrown runner falls through; when every route fails that way the turn
 * is a "malformed" refusal. No route configured → "unavailable". There is
 * deliberately no template path: nothing here can fake understanding.
 */
export async function runAssistantTurn(
  userText: string,
  ctx: AssistantContext,
  deps: GenerationDeps,
): Promise<AssistantTurnResult> {
  if (!assistantRouteAvailable(deps)) return { status: "unavailable", reason: ASSISTANT_NO_ROUTE_REASON };
  let cloudFailed = false;
  if (deps.runCloud) {
    const parsed = await tryRunner(deps.runCloud, userText, ctx);
    if (parsed && parsed.kind !== "malformed") {
      return parsed.kind === "command"
        ? { status: "command", command: parsed.command, source: "cloud", fellBack: false }
        : { status: "refusal", refusal: parsed.refusal };
    }
    cloudFailed = true;
  }
  if (deps.modelEnabled && deps.runModel) {
    const parsed = await tryRunner(deps.runModel, userText, ctx);
    if (parsed && parsed.kind !== "malformed") {
      return parsed.kind === "command"
        ? {
            status: "command",
            command: parsed.command,
            source: "model",
            ...(cloudFailed ? { fellBack: true, note: CLOUD_TO_LOCAL_NOTE } : { fellBack: false }),
          }
        : { status: "refusal", refusal: parsed.refusal };
    }
  }
  return { status: "refusal", refusal: MALFORMED_REFUSAL };
}

/* ------------------------------------------------------------------ */
/* plan building — deterministic, onto polish.ts's plan machinery      */
/* ------------------------------------------------------------------ */

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export interface AssistantPlanOutcome {
  plan: PolishPlan;
  /** when the plan is empty: the honest "understood, but nothing to change" line */
  emptyReason?: string;
}

/**
 * Build the previewable plan for one parsed command, from the project's
 * real data (transcript proposals, zoom signals, profanity matches, the
 * placed tracks/segments) — the same feature functions the standalone
 * panels use, assembled into polish {@link PolishStep}s so
 * `applyPolishPlan` applies them and StudioPage commits them as one undo
 * step. A command whose work is already done (or absent) yields an EMPTY
 * plan with an `emptyReason` — never a fake no-op step.
 */
export function buildAssistantPlan(
  input: BuildPolishPlanInput,
  command: AssistantCommand,
  opts: { badge?: PolishBadge } = {},
): AssistantPlanOutcome {
  const { doc, comp } = input;
  const labelling = opts.badge
    ? { source: "ai-suggested" as const, badge: opts.badge }
    : { source: "automatic" as const };
  const step = (s: Omit<PolishStep, "source" | "badge"> & { badge?: PolishBadge }): PolishStep => ({
    ...s,
    ...labelling,
    ...(opts.badge ? { badge: opts.badge } : s.badge ? { badge: s.badge } : {}),
  });

  switch (command.intent) {
    case "trim-fillers": {
      const proposals = proposeTrimCuts({
        words: doc.words, peaks: input.peaks, hopMs: input.hopMs, durationMs: comp.durationMs,
      }).filter((p) => p.kind === "filler");
      if (proposals.length === 0) {
        return { plan: { steps: [] }, emptyReason: "No filler words were found in the transcript. So there is nothing to trim." };
      }
      const totalMs = proposals.reduce((s, p) => s + p.durationMs, 0);
      return {
        plan: {
          steps: [step({
            id: "trim-fillers", kind: "trim-fillers", label: "Remove filler words",
            detail: `Remove ${proposals.length} filler${proposals.length === 1 ? "" : "s"} (${secs(totalMs)}) — found in your transcript`,
            payload: { kind: "trim-fillers", ranges: proposals.map((p) => ({ startMs: p.startMs, endMs: p.endMs })), proposals },
          })],
        },
      };
    }
    case "remove-silences": {
      const proposals = proposeTrimCuts({
        words: doc.words, peaks: input.peaks, hopMs: input.hopMs, durationMs: comp.durationMs, thresholdMs: command.thresholdMs,
      }).filter((p) => p.kind === "pause");
      if (proposals.length === 0) {
        return { plan: { steps: [] }, emptyReason: `No pauses longer than ${secs(command.thresholdMs)} were found (a pause counts only where the transcript gap and the audio levels agree), so nothing would be cut.` };
      }
      const totalMs = proposals.reduce((s, p) => s + p.durationMs, 0);
      return {
        plan: {
          steps: [step({
            id: "tighten-silences", kind: "tighten-silences", label: `Remove pauses longer than ${secs(command.thresholdMs)}`,
            detail: `Remove ${proposals.length} long pause${proposals.length === 1 ? "" : "s"} (${secs(totalMs)}) over the ${secs(command.thresholdMs)} threshold — pauses are removed, not shortened to a set length (a short breath is kept at each edge)`,
            payload: { kind: "tighten-silences", ranges: proposals.map((p) => ({ startMs: p.startMs, endMs: p.endMs })), proposals, thresholdMs: command.thresholdMs },
          })],
        },
      };
    }
    case "apply-caption-look": {
      const look = getLook(command.lookId);
      if (!look) return { plan: { steps: [] }, emptyReason: "That look no longer exists, so nothing was changed." };
      if (command.lookId === input.lookId) {
        return { plan: { steps: [] }, emptyReason: `The “${look.name}” look is already applied, so nothing would change.` };
      }
      return {
        plan: {
          steps: [step({
            id: "caption-look", kind: "caption-look", label: "Caption look",
            detail: `Apply the “${look.name}” caption look`,
            payload: { kind: "caption-look", lookId: look.id, lookName: look.name },
          })],
        },
      };
    }
    case "add-title-card": {
      return {
        plan: {
          steps: [step({
            id: "title-card", kind: "title-card", label: "Title card",
            detail: `Add title card “${command.title}” at the start`,
            payload: { kind: "title-card", title: command.title },
          })],
        },
      };
    }
    case "auto-zooms": {
      const zoomPlan = generateAutoZoomPlan({
        words: doc.words,
        clips: comp.videoClips,
        peaks: input.peaks ? { peaks: input.peaks, hopMs: input.hopMs } : null,
        intensity: command.intensity,
      });
      if (zoomPlan.zooms.length === 0) {
        return { plan: { steps: [] }, emptyReason: "No zoom signals were found (no emphasised words, sentence starts after pauses, or loud peaks the placement rules can use), so no zooms would be added." };
      }
      return {
        plan: {
          steps: [step({
            id: "auto-zooms", kind: "auto-zooms", label: "Auto punch-in zooms",
            detail: `${zoomPlan.zooms.length} zoom${zoomPlan.zooms.length === 1 ? "" : "s"} at ${command.intensity}${zoomPlan.skipped.length > 0 ? ` (${zoomPlan.skipped.length} signal${zoomPlan.skipped.length === 1 ? "" : "s"} skipped by the placement rules)` : ""}`,
            payload: { kind: "auto-zooms", intensity: command.intensity, plan: zoomPlan },
          })],
        },
      };
    }
    case "bleep-profanity": {
      const matches = findProfanityMatches(doc.words);
      if (matches.length === 0) {
        return { plan: { steps: [] }, emptyReason: "No words from the profanity list were found in the transcript, so there is nothing to bleep. (Matching is wordlist-based — slang or mis-transcribed words can be missed.)" };
      }
      const all = approvedBleepRanges(matches, new Set(matches.map((m) => m.wordId)));
      const existing = comp.audioBleeps ?? [];
      const ranges = all.filter((r) => !existing.some((b) => b.startMs === r.startMs && b.endMs === r.endMs));
      if (ranges.length === 0) {
        return { plan: { steps: [] }, emptyReason: "Every listed word found in the transcript is already bleeped. So nothing would change." };
      }
      const wordsList = [...new Set(ranges.map((r) => r.wordText))].join(", ");
      return {
        plan: {
          steps: [step({
            id: "bleep-profanity", kind: "bleep-profanity", label: "Bleep profanity",
            detail: `Bleep ${ranges.length} listed word${ranges.length === 1 ? "" : "s"} (${wordsList}) — the original sound is muted at those ranges and a tone plays instead`,
            payload: { kind: "bleep-profanity", ranges, matchCount: matches.length },
          })],
        },
      };
    }
    case "duck-music": {
      const track = comp.audioTracks.find((t) => t.role === "music");
      if (!track) {
        return { plan: { steps: [] }, emptyReason: "There is no music track in this project yet — place one in the Audio panel first, then ask again." };
      }
      const cur = track.ducking;
      const amountDb = cur.enabled ? Math.max(cur.amountDb, command.amountDb) : command.amountDb;
      if (cur.enabled && cur.amountDb >= command.amountDb) {
        return { plan: { steps: [] }, emptyReason: `“${track.name}” is already ducked by ${cur.amountDb} dB, so nothing would change.` };
      }
      return {
        plan: {
          steps: [step({
            id: "music-ducking", kind: "music-ducking", label: "Music ducking",
            detail: `Duck “${track.name}” by ${amountDb} dB under the voice`,
            payload: { kind: "music-ducking", trackId: track.id, trackName: track.name, patch: { enabled: true, amountDb } },
          })],
        },
      };
    }
    case "set-segment-speed": {
      const clip = comp.videoClips[command.segmentIndex - 1];
      if (!clip) return { plan: { steps: [] }, emptyReason: `This project has ${comp.videoClips.length} segment${comp.videoClips.length === 1 ? "" : "s"}, so there is no segment ${command.segmentIndex}.` };
      if (clip.still) return { plan: { steps: [] }, emptyReason: `Segment ${command.segmentIndex} is a freeze-frame still — playback speed doesn't apply to it.` };
      const current = clip.playbackRate ?? 1;
      if (current === command.rate) {
        return { plan: { steps: [] }, emptyReason: `Segment ${command.segmentIndex} already plays at ${command.rate}×, so nothing would change.` };
      }
      return {
        plan: {
          steps: [step({
            id: "segment-speed", kind: "segment-speed", label: "Segment playback speed",
            detail: `Play segment ${command.segmentIndex} at ${command.rate}× (from ${current}×) — its length and the captions inside it rescale`,
            payload: { kind: "segment-speed", clipId: clip.id, segmentIndex: command.segmentIndex, rate: command.rate },
          })],
        },
      };
    }
    case "add-transition": {
      const clip = comp.videoClips[command.segmentIndex - 1];
      if (!clip) return { plan: { steps: [] }, emptyReason: `This project has ${comp.videoClips.length} segment${comp.videoClips.length === 1 ? "" : "s"}, so there is no segment ${command.segmentIndex}.` };
      const transition: SegmentTransition = { type: command.transitionType, durationMs: command.durationMs };
      if (clip.transitionIn?.type === transition.type && clip.transitionIn?.durationMs === transition.durationMs) {
        return { plan: { steps: [] }, emptyReason: `Segment ${command.segmentIndex} already has that exact transition, so nothing would change.` };
      }
      return {
        plan: {
          steps: [step({
            id: "segment-transition", kind: "segment-transition", label: "Segment transition",
            detail: `Add a ${transition.type} transition (${transition.durationMs} ms) into segment ${command.segmentIndex}`,
            payload: { kind: "segment-transition", clipId: clip.id, segmentIndex: command.segmentIndex, transition },
          })],
        },
      };
    }
  }
}
