import { z } from "zod";
import type { CaptionDoc, OverlaySocialVariant, Word } from "@capseasy/shared";
import { getLook } from "@capseasy/templates";
import { getMotionTemplate } from "@capseasy/motion";
import type { Source } from "../create/model";
import type { GenerationDeps, ModelRunner } from "../create/service";
import { generateAutoZoomPlan, type AutoZoomIntensity } from "./autoZooms";
import type { EmphasisSuggestion } from "./emphasis";
import {
  POLISH_DUCKING_AMOUNT_DB,
  POLISH_STEP_ORDER,
  type BuildPolishPlanInput,
  type PolishBadge,
  type PolishPlan,
  type PolishStep,
} from "./polish";
import type { TitleCardResult } from "./titleCard";
import { proposeTrimCuts, type TrimRange } from "./trim";
import { findProfanityMatches } from "./audio/bleep";

/**
 * AI Edit (2026-11-11) — the captions.ai-shaped flow on this product's own
 * machinery: pick a style (+ an optional plain-language instruction) → ONE
 * routed free-AI call returns a typed PLAN INTENT → a deterministic client
 * builder grounds that intent into a polish.ts {@link PolishPlan} → the
 * user reviews the checklist (the preview IS the approval gate) → apply
 * rides `applyPolishPlan` + StudioPage's single `editAll`, with per-step
 * revert and a bit-identical revert-all, exactly like Polish.
 *
 * THE GROUNDING RULE IS ABSOLUTE (the A8 pattern, at plan scale): the model
 * never emits editor operations. It proposes parameters and choices from
 * fixed vocabularies (style ids, registry template ids, the intensity
 * enum); the client validates every value against the REAL project —
 * unknown ids, out-of-timeline cuts, words that are not in the transcript
 * are DROPPED, and every drop is reported in `droppedNotes`, rendered in
 * the panel under "Not included". Nothing is silently invented and nothing
 * is silently dropped.
 *
 * HONESTY (pinned by tests):
 * - A step is `ai-suggested` (with the route's badge) only where the
 *   model's intent actually influenced it; steps the style defaults
 *   produced alone are `automatic` — the A2 labelling rule, unchanged.
 * - When no route answers (not configured, rate-limited, malformed twice),
 *   the plan is the DETERMINISTIC style plan and the panel badges the whole
 *   surface "Template engine" — the fallback never wears an AI label.
 * - Emphasis words come only from the model, grounded to doc words (A1's
 *   rule: no template/heuristic emphasis). B-roll is default-OFF import
 *   suggestions beside the checklist (D5), never a plan step. No virality
 *   language anywhere.
 */

/* ------------------------------------------------------------------ */
/* styles — looks + pacing presets (single source; tests pin every     */
/* referenced look id and template id to the real registries)          */
/* ------------------------------------------------------------------ */

export interface AiEditStyle {
  id: string;
  name: string;
  /** one plain line, shown under the style pick */
  description: string;
  /** the caption look this style applies (the "any look" pick overrides) */
  lookId: string;
  pacing: {
    silenceThresholdMs: number;
    /** seeds the panel's intensity control; null = zooms start off */
    zoomIntensity: AutoZoomIntensity | null;
    trimFillers: boolean;
  };
  toggles: {
    /** recorded intent: emphasis steps still only ever come from grounded
     *  model words (A1's rule) — the toggle never invents them */
    emphasis: boolean;
    elements: "none" | "light" | "standard";
    ducking: boolean;
    /** ask the A5 title routing for a title step */
    title: boolean;
  };
}

export const AI_EDIT_STYLES: readonly AiEditStyle[] = [
  {
    id: "clean", name: "Clean",
    description: "Minimal look, gentle zooms, only dead air over 1.2 s is cut.",
    lookId: "minimal_pro",
    pacing: { silenceThresholdMs: 1200, zoomIntensity: "subtle", trimFillers: true },
    toggles: { emphasis: false, elements: "none", ducking: false, title: false },
  },
  {
    id: "punchy", name: "Punchy",
    description: "Bold look, strong zooms, tight 0.8 s pacing, a couple of graphic pops.",
    lookId: "beast_bounce",
    pacing: { silenceThresholdMs: 800, zoomIntensity: "strong", trimFillers: true },
    toggles: { emphasis: true, elements: "light", ducking: false, title: false },
  },
  {
    id: "explainer", name: "Explainer",
    description: "Clear look, medium zooms, a hook at the start and a lower third with the title.",
    lookId: "explainer",
    pacing: { silenceThresholdMs: 1000, zoomIntensity: "medium", trimFillers: true },
    toggles: { emphasis: true, elements: "standard", ducking: false, title: true },
  },
  {
    id: "calm", name: "Calm",
    description: "Soft look, no zooms, natural pauses kept, music ducked under the voice.",
    lookId: "soft_glow",
    pacing: { silenceThresholdMs: 1500, zoomIntensity: null, trimFillers: false },
    toggles: { emphasis: false, elements: "none", ducking: true, title: false },
  },
  {
    id: "podcast", name: "Podcast",
    description: "Plain subtitle look, fillers cut at a tight 0.7 s pace, music ducked.",
    lookId: "netflix_sub",
    pacing: { silenceThresholdMs: 700, zoomIntensity: null, trimFillers: true },
    toggles: { emphasis: false, elements: "none", ducking: true, title: false },
  },
];

export const aiEditStyle = (id: string): AiEditStyle | undefined => AI_EDIT_STYLES.find((s) => s.id === id);

/** The element templates the model may choose from in its prompt — a
 *  curated subset of the motion registry (the full registry would eat the
 *  prompt budget). Grounding accepts ANY registry id; the prompt offers
 *  these. A test pins every id here to the registry. */
export const AI_EDIT_ELEMENT_VOCAB: readonly OverlaySocialVariant[] = [
  "cursor-subscribe", "follow-banner", "like-pop", "lower-third-bar",
  "subscribe-pill", "comment-popup", "profile-card", "search-bar",
  "kinetic-title", "countdown-pop", "bell-reminder", "share-pop",
  "chat-stack", "logo-reveal",
];

/* ------------------------------------------------------------------ */
/* stage 1 — the plan intent (zod-validated shape; the model proposes  */
/* parameters, never operations)                                       */
/* ------------------------------------------------------------------ */

export interface AiEditPlanIntent {
  styleId?: string;
  intensity?: AutoZoomIntensity;
  silenceThresholdMs?: number;
  trimFillers?: boolean;
  cuts?: { startSec: number; endSec: number; reason?: string }[];
  emphasisWords?: string[];
  title?: string;
  hookText?: string;
  elements?: { templateId: string; atSec: number; text?: string }[];
  brollQueries?: string[];
  notes?: string;
}

const AiEditPlanIntentSchema = z.object({
  styleId: z.string().min(1).max(60).optional(),
  intensity: z.enum(["subtle", "medium", "strong"]).optional(),
  silenceThresholdMs: z.number().int().min(500).max(2500).optional(),
  trimFillers: z.boolean().optional(),
  cuts: z
    .array(z.object({ startSec: z.number().finite(), endSec: z.number().finite(), reason: z.string().max(160).optional() }))
    .optional(),
  emphasisWords: z.array(z.string().min(1).max(80)).optional(),
  title: z.string().min(1).max(120).optional(),
  hookText: z.string().min(1).max(80).optional(),
  elements: z
    .array(z.object({ templateId: z.string().min(1).max(60), atSec: z.number().finite(), text: z.string().max(120).optional() }))
    .optional(),
  brollQueries: z.array(z.string().min(1).max(80)).optional(),
  notes: z.string().max(300).optional(),
});

/** Caps from the design (§4.1) — applied by slicing BEFORE the schema runs,
 *  so an over-long list is trimmed to the cap instead of failing the whole
 *  intent as malformed. */
export const AI_EDIT_CAPS = { cuts: 8, emphasisWords: 12, elements: 4, brollQueries: 3 } as const;

/**
 * Stage-1 validation: extract the JSON object and zod-parse it. Returns
 * null for anything malformed (no object, bad types, out-of-contract
 * values) — the routing layer then tries the next route, and finally the
 * deterministic fallback. Never throws, never clamps a value into range:
 * an out-of-contract value makes the intent malformed, full stop.
 */
export function parseAiEditIntent(raw: string): AiEditPlanIntent | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = { ...(parsed as Record<string, unknown>) };
  // pre-normalise: slice over-cap arrays, drop empty optional strings
  if (Array.isArray(o.cuts)) o.cuts = o.cuts.slice(0, AI_EDIT_CAPS.cuts);
  if (Array.isArray(o.emphasisWords)) o.emphasisWords = o.emphasisWords.slice(0, AI_EDIT_CAPS.emphasisWords);
  if (Array.isArray(o.elements)) o.elements = o.elements.slice(0, AI_EDIT_CAPS.elements);
  if (Array.isArray(o.brollQueries)) o.brollQueries = o.brollQueries.slice(0, AI_EDIT_CAPS.brollQueries);
  for (const k of ["styleId", "title", "hookText"] as const) {
    if (typeof o[k] === "string" && !(o[k] as string).trim()) delete o[k];
  }
  const out = AiEditPlanIntentSchema.safeParse(o);
  return out.success ? (out.data as AiEditPlanIntent) : null;
}

/* ------------------------------------------------------------------ */
/* stage 2 — grounding: intent + real project data → applicable pieces */
/* ------------------------------------------------------------------ */

export interface GroundedAiEditIntent {
  intent: AiEditPlanIntent;
  /** validated style override (an AI_EDIT_STYLES id), when the model named one */
  styleId?: string;
  /** word-edge snapped, merged cut ranges + their reasons (parallel) */
  cuts: TrimRange[];
  cutReasons: string[];
  /** A1-shaped suggestions bound to real doc words */
  emphasis: EmphasisSuggestion[];
  /** registry-validated element placements */
  elements: { variant: OverlaySocialVariant; atSec: number; text?: string }[];
  /** one plain line per dropped item — rendered as "Not included: …" */
  droppedNotes: string[];
}

const normWord = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Snap a time to the nearest word edge (start or end of a visible word)
 *  within 2 s; otherwise keep the value. Deterministic. */
function snapToWordEdge(ms: number, boundaries: readonly number[]): number {
  let best: number | null = null;
  for (const b of boundaries) {
    if (best === null || Math.abs(b - ms) < Math.abs(best - ms)) best = b;
  }
  return best !== null && Math.abs(best - ms) <= 2000 ? best : ms;
}

export function groundAiEditIntent(
  intent: AiEditPlanIntent,
  ctx: { doc: CaptionDoc; durationMs: number },
): GroundedAiEditIntent {
  const { doc } = ctx;
  const durationMs = Math.max(0, Math.round(ctx.durationMs));
  const droppedNotes: string[] = [];
  const visible = doc.words.filter((w) => !w.hidden);

  /* style override — must be one of the edit styles */
  let styleId: string | undefined;
  if (intent.styleId) {
    if (aiEditStyle(intent.styleId)) styleId = intent.styleId;
    else droppedNotes.push(`the style “${intent.styleId}” — it isn't one of the edit styles, so your pick stands`);
  }

  /* cuts — in bounds, ordered, ≥ 300 ms, snapped to word edges, merged */
  const boundaries = [...new Set(visible.flatMap((w) => [w.startMs, w.endMs]))].sort((a, b) => a - b);
  const rawCuts: { range: TrimRange; reason: string }[] = [];
  for (const c of intent.cuts ?? []) {
    const startMs = Math.round(c.startSec * 1000);
    const endMs = Math.round(c.endSec * 1000);
    const label = `the cut at ${c.startSec.toFixed(1)}–${c.endSec.toFixed(1)}s`;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs > durationMs || endMs <= startMs) {
      droppedNotes.push(`${label} — outside the video or backwards`);
      continue;
    }
    if (endMs - startMs < 300) {
      droppedNotes.push(`${label} — shorter than 0.3s`);
      continue;
    }
    const snapped = {
      startMs: Math.max(0, snapToWordEdge(startMs, boundaries)),
      endMs: Math.min(durationMs, snapToWordEdge(endMs, boundaries)),
    };
    if (snapped.endMs - snapped.startMs < 300) {
      droppedNotes.push(`${label} — too short once snapped to word edges`);
      continue;
    }
    rawCuts.push({ range: snapped, reason: (c.reason ?? "").trim().slice(0, 120) });
  }
  /* Merge overlapping ranges here (normalizeTrimRanges only rounds, filters
   * and sorts — it does not merge), keeping the FIRST range's reason per
   * merged group; the survivors stay in timeline order like the trim steps'
   * own payloads (applyTrimCuts normalises internally for application). */
  const ascending = rawCuts
    .map((c) => ({ range: { ...c.range }, reason: c.reason }))
    .sort((a, b) => a.range.startMs - b.range.startMs);
  const mergedCuts: { range: TrimRange; reason: string }[] = [];
  for (const c of ascending) {
    const last = mergedCuts[mergedCuts.length - 1];
    if (last && c.range.startMs < last.range.endMs) {
      last.range = { startMs: last.range.startMs, endMs: Math.max(last.range.endMs, c.range.endMs) };
    } else {
      mergedCuts.push(c);
    }
  }
  if (mergedCuts.length < rawCuts.length) {
    droppedNotes.push(`${rawCuts.length - mergedCuts.length} overlapping cut${rawCuts.length - mergedCuts.length === 1 ? "" : "s"} — merged into the ranges around them`);
  }
  const cuts: TrimRange[] = mergedCuts.map((c) => c.range);
  const cutReasons: string[] = mergedCuts.map((c) => c.reason);
  /* emphasis words — exact token/phrase match against the doc (A1's rule) */
  const emphasis: EmphasisSuggestion[] = [];
  const usedWordIds = new Set<string>();
  for (const phrase of intent.emphasisWords ?? []) {
    const tokens = phrase.split(/[^\p{L}\p{N}]+/u).map(normWord).filter(Boolean);
    if (tokens.length === 0) continue;
    let matched = false;
    outer: for (let i = 0; i + tokens.length <= visible.length; i++) {
      for (let j = 0; j < tokens.length; j++) {
        if (normWord(visible[i + j]!.text) !== tokens[j]) continue outer;
      }
      const run = visible.slice(i, i + tokens.length);
      if (run.some((w) => usedWordIds.has(w.id))) continue;
      for (const w of run) {
        if (emphasis.length >= 12) break;
        usedWordIds.add(w.id);
        emphasis.push({
          id: `${w.id}:emphasise`,
          wordId: w.id,
          wordIndex: doc.words.indexOf(w),
          text: w.text,
          startMs: w.startMs,
          endMs: w.endMs,
          action: "emphasise",
        });
      }
      matched = true;
      break;
    }
    if (!matched) droppedNotes.push(`the emphasis word “${phrase}” — it isn't in the transcript`);
  }

  /* elements — registry ids only, placed inside the timeline */
  const elements: GroundedAiEditIntent["elements"] = [];
  for (const el of intent.elements ?? []) {
    const t = getMotionTemplate(el.templateId);
    if (!t) {
      droppedNotes.push(`the element “${el.templateId}” — it isn't in the template library`);
      continue;
    }
    const atMs = Math.round(el.atSec * 1000);
    if (atMs < 0 || atMs >= durationMs) {
      droppedNotes.push(`the element “${t.title}” at ${el.atSec.toFixed(1)}s — outside the video`);
      continue;
    }
    elements.push({
      variant: t.id,
      atSec: el.atSec,
      ...(el.text?.trim() ? { text: el.text.trim().slice(0, 80) } : {}),
    });
  }

  return { intent, ...(styleId ? { styleId } : {}), cuts, cutReasons, emphasis, elements, droppedNotes };
}

/* ------------------------------------------------------------------ */
/* the context — one route call; the route caps user at 4,000 chars,   */
/* so the builder budgets: fixed sections first, the transcript gets   */
/* what remains, truncated at a sentence boundary with the fact kept   */
/* ------------------------------------------------------------------ */

export interface AiEditContextInput {
  doc: CaptionDoc;
  comp: BuildPolishPlanInput["comp"];
  lookId: string | null;
  style: AiEditStyle;
  instruction: string;
  peaks: Float32Array | null;
  hopMs: number;
}

export const AI_EDIT_USER_BUDGET = 3900;

const sec1 = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

interface Sentence { startMs: number; text: string; words: Word[] }

function sentencesOf(words: readonly Word[]): Sentence[] {
  const visible = words.filter((w) => !w.hidden);
  const out: Sentence[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    out.push({ startMs: cur[0]!.startMs, text: cur.map((w) => w.text).join(" "), words: cur });
    cur = [];
  };
  visible.forEach((w, i) => {
    cur.push(w);
    const next = visible[i + 1];
    if (/[.!?…]$/.test(w.text) || (next && next.startMs - w.endMs >= 800)) flush();
  });
  flush();
  return out;
}

export function buildAiEditContext(input: AiEditContextInput): { system: string; user: string; truncated: boolean } {
  const { doc, comp, style } = input;
  const durationMs = comp.durationMs;
  const proposals = proposeTrimCuts({
    words: doc.words, peaks: input.peaks, hopMs: input.hopMs, durationMs, thresholdMs: 800,
  });
  const fillers = proposals.filter((p) => p.kind === "filler");
  const pauses = proposals.filter((p) => p.kind === "pause").sort((a, b) => b.durationMs - a.durationMs);
  const zoomPlan = generateAutoZoomPlan({
    words: doc.words, clips: comp.videoClips,
    peaks: input.peaks ? { peaks: input.peaks, hopMs: input.hopMs } : null,
    intensity: "medium",
  });
  const zoomByKind = new Map<string, number>();
  for (const z of zoomPlan.zooms) zoomByKind.set(z.kind, (zoomByKind.get(z.kind) ?? 0) + 1);
  const visibleCount = doc.words.filter((w) => !w.hidden).length;
  const wpm = durationMs > 0 ? Math.round(visibleCount / (durationMs / 60000)) : 0;

  const system = [
    "You are the edit planner for a short-video editor. You receive a video's transcript with timings and measured signals, and reply with ONE JSON plan intent — parameters and choices from the listed vocabularies only, never editor commands.",
    "Reply with ONLY the JSON object — no prose, no code fences.",
  ].join("\n");

  const fixed: string[] = [
    `Plan an edit for this video. Chosen style: ${style.id} = ${style.name} — ${style.description}`,
    input.instruction.trim()
      ? `The user's instruction, in their words: “${input.instruction.trim().slice(0, 500)}”`
      : "The user gave no specific instruction — follow the style.",
    "",
    "Output format (every field optional; omit what the style already settles):",
    '{"styleId": "<an edit style id, only to change the feel>", "intensity": "subtle|medium|strong", "silenceThresholdMs": <500–2500>, "trimFillers": true|false, "cuts": [{"startSec": 0, "endSec": 0, "reason": "false start"}], "emphasisWords": ["word or short phrase"], "title": "<a title, only if the instruction asks for one>", "hookText": "<opening on-screen text, ≤ 80 chars>", "elements": [{"templateId": "<an element id>", "atSec": 0, "text": "<optional>"}], "brollQueries": ["<stock search>"], "notes": "<one line: your approach>"}',
    "Rules: cuts are for false starts, repeats and asides — at most 8, in seconds from the transcript anchors. emphasisWords must be words that actually appear in the transcript. Never invent times, words or ids.",
    "",
    `Edit styles (id = name): ${AI_EDIT_STYLES.map((s) => `${s.id} = ${s.name}`).join("; ")}`,
    `Elements (id = name): ${AI_EDIT_ELEMENT_VOCAB.map((id) => `${id} = ${getMotionTemplate(id)?.title ?? id}`).join("; ")}`,
    "",
    "Measured signals:",
    `- duration ${sec1(durationMs)}; ${comp.videoClips.length} segment${comp.videoClips.length === 1 ? "" : "s"} starting at ${comp.videoClips.map((c) => sec1(c.startMs)).join(", ") || "0.0s"}`,
    `- pacing ${wpm} words/min; ${fillers.length} filler${fillers.length === 1 ? "" : "s"} detected${fillers.length ? ` (${[...new Set(fillers.map((f) => f.word))].join(", ")})` : ""}`,
    `- longest pauses: ${pauses.slice(0, 5).map((p) => `${sec1(p.startMs)} (${sec1(p.durationMs)})`).join(", ") || "none over 0.8s"}`,
    `- zoom signals: ${zoomPlan.zooms.length} (${[...zoomByKind.entries()].map(([k, n]) => `${k} ${n}`).join(", ") || "none"})`,
    `- profanity-list matches: ${findProfanityMatches(doc.words).length}`,
    `Project now: look ${input.lookId ? (getLook(input.lookId)?.name ?? input.lookId) : "none"}; ${comp.audioTracks.some((t) => t.role === "music") ? "a music track is placed" : "no music track"}; ${comp.overlayClips.length} overlay${comp.overlayClips.length === 1 ? "" : "s"} placed${comp.overlayClips.some((c) => c.startMs === 0 && c.overlay.kind === "text") ? "; a text overlay already sits at the start" : ""}.`,
    "",
    "Transcript (anchors are seconds; [pause] lines are measured gaps):",
  ];

  /* transcript lines with the filler/pause annotations inline, in order */
  const events: { atMs: number; line: string }[] = [];
  for (const s of sentencesOf(doc.words)) {
    const inSentence = fillers.filter((f) => f.startMs >= s.startMs && f.startMs < (s.words[s.words.length - 1]?.endMs ?? s.startMs));
    const note = inSentence.length ? ` (fillers: ${inSentence.map((f) => f.word).join(", ")})` : "";
    events.push({ atMs: s.startMs, line: `[${sec1(s.startMs)}] ${s.text}${note}` });
  }
  for (const p of proposals.filter((x) => x.kind === "pause")) {
    events.push({ atMs: p.startMs, line: `[${sec1(p.startMs)}] (pause ${sec1(p.durationMs)})` });
  }
  events.sort((a, b) => a.atMs - b.atMs);

  const head = fixed.join("\n");
  let used = head.length + 1;
  const lines: string[] = [];
  let truncated = false;
  for (const e of events) {
    if (used + e.line.length + 1 > AI_EDIT_USER_BUDGET) { truncated = true; break; }
    lines.push(e.line);
    used += e.line.length + 1;
  }
  if (lines.length === 0 && events.length > 0) {
    // even the first line overflows the budget on its own: hard-truncate it
    lines.push(events[0]!.line.slice(0, Math.max(0, AI_EDIT_USER_BUDGET - head.length - 1)));
    truncated = true;
  }
  return { system, user: [...fixed, ...lines].join("\n"), truncated };
}

/* ------------------------------------------------------------------ */
/* routing — cloud free AI → on-device model, first usable intent wins */
/* (the resolvePolishAiChoices shape). No route / no usable reply →    */
/* null, and the caller builds the deterministic style plan, badged    */
/* "Template engine".                                                  */
/* ------------------------------------------------------------------ */

export interface AiEditRouteOutcome {
  intent: AiEditPlanIntent;
  source: Extract<Source, "cloud" | "model">;
  fellBack: boolean;
  note?: string;
  /** the transcript had to be shortened to fit the route's size limit */
  truncated: boolean;
}

const CLOUD_TO_LOCAL_NOTE =
  "The free AI service was not available for this plan, so the local model wrote the intent instead.";

async function tryIntentRunner(
  runner: ModelRunner,
  prompt: { system: string; user: string },
): Promise<AiEditPlanIntent | null> {
  try {
    return parseAiEditIntent(await runner(prompt));
  } catch {
    return null;
  }
}

export async function resolveAiEditIntent(
  input: AiEditContextInput,
  deps: GenerationDeps,
): Promise<AiEditRouteOutcome | null> {
  const prompt = buildAiEditContext(input);
  let cloudFailed = false;
  if (deps.runCloud) {
    const intent = await tryIntentRunner(deps.runCloud, prompt);
    if (intent) return { intent, source: "cloud", fellBack: false, truncated: prompt.truncated };
    cloudFailed = true;
  }
  if (deps.modelEnabled && deps.runModel) {
    const intent = await tryIntentRunner(deps.runModel, prompt);
    if (intent) {
      return cloudFailed
        ? { intent, source: "model", fellBack: true, note: CLOUD_TO_LOCAL_NOTE, truncated: prompt.truncated }
        : { intent, source: "model", fellBack: false, truncated: prompt.truncated };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* plan building — deterministic: style defaults + grounded intent     */
/* ------------------------------------------------------------------ */

export interface AiEditPlanResult {
  plan: PolishPlan;
  droppedNotes: string[];
  /** honest notices above the checklist (truncation, the model's own note) */
  notices: string[];
  /** B-roll search suggestions (D5) — suggestions only, never plan steps */
  brollQueries: string[];
  engine: { kind: "ai"; badge: PolishBadge } | { kind: "template" };
}

export interface BuildAiEditPlanOptions {
  style: AiEditStyle;
  /** the resolved look: the style's look, or the user's "any look" pick */
  lookId: string;
  /** the panel's intensity control; null = zooms off unless the intent sets one */
  intensity: AutoZoomIntensity | null;
  /** grounded intent when the model ran; null = the deterministic style plan */
  grounded?: GroundedAiEditIntent | null;
  /** the routing badge, present exactly when the model ran */
  badge?: PolishBadge | null;
  /** the transcript was truncated in the context the model read */
  transcriptTruncated?: boolean;
  /** the A5 title result, when the panel generated one (title styles) */
  titleResult?: TitleCardResult | null;
}

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export function buildAiEditPlan(input: BuildPolishPlanInput, options: BuildAiEditPlanOptions): AiEditPlanResult {
  const { doc, comp } = input;
  const grounded = options.grounded ?? null;
  const badge = grounded && options.badge ? options.badge : null;
  const intent = grounded?.intent ?? null;
  const steps: PolishStep[] = [];
  const notices: string[] = [];
  const droppedNotes: string[] = [...(grounded?.droppedNotes ?? [])];

  const aiStep = (s: Omit<PolishStep, "source" | "badge">): PolishStep =>
    badge ? { ...s, source: "ai-suggested", badge } : { ...s, source: "automatic" };
  const autoStep = (s: Omit<PolishStep, "source" | "badge">): PolishStep => ({ ...s, source: "automatic" });

  /* effective style (a validated model override re-points the look) */
  const effStyle = grounded?.styleId ? aiEditStyle(grounded.styleId)! : options.style;
  const styleOverridden = effStyle.id !== options.style.id;

  /* ---- caption look ---------------------------------------------------- */
  const lookId = grounded?.styleId ? effStyle.lookId : options.lookId;
  if (lookId !== input.lookId) {
    const look = getLook(lookId);
    if (look) {
      const detail = styleOverridden
        ? `Apply the “${look.name}” look — the ${effStyle.name} style (you picked ${options.style.name})`
        : `Apply the “${look.name}” caption look`;
      const stepDef = {
        id: "caption-look" as const, kind: "caption-look" as const, label: "Caption look",
        detail, payload: { kind: "caption-look" as const, lookId, lookName: look.name },
      };
      steps.push(styleOverridden ? aiStep(stepDef) : autoStep(stepDef));
    }
  }

  /* ---- trims: one A3 proposal pass at the effective threshold ---------- */
  const effIntensity = intent?.intensity ?? options.intensity;
  const nudge = effIntensity === "strong" ? -200 : effIntensity === "subtle" ? 200 : 0;
  const thresholdMs = Math.min(2500, Math.max(500, (intent?.silenceThresholdMs ?? effStyle.pacing.silenceThresholdMs) + nudge));
  const proposals = proposeTrimCuts({
    words: doc.words, peaks: input.peaks, hopMs: input.hopMs, durationMs: comp.durationMs, thresholdMs,
  });
  const wantFillers = effStyle.pacing.trimFillers && intent?.trimFillers !== false;
  const fillers = wantFillers ? proposals.filter((p) => p.kind === "filler") : [];
  if (fillers.length > 0) {
    const totalMs = fillers.reduce((s, p) => s + p.durationMs, 0);
    steps.push(autoStep({
      id: "trim-fillers", kind: "trim-fillers", label: "Remove filler words",
      detail: `Remove ${fillers.length} filler${fillers.length === 1 ? "" : "s"} (${secs(totalMs)})`,
      payload: { kind: "trim-fillers", ranges: fillers.map((p) => ({ startMs: p.startMs, endMs: p.endMs })), proposals: fillers },
    }));
  }
  const pauses = proposals.filter((p) => p.kind === "pause");
  if (pauses.length > 0) {
    const totalMs = pauses.reduce((s, p) => s + p.durationMs, 0);
    const stepDef = {
      id: "tighten-silences" as const, kind: "tighten-silences" as const,
      label: `Remove pauses longer than ${secs(thresholdMs)}`,
      detail:
        `Remove ${pauses.length} long pause${pauses.length === 1 ? "" : "s"} (${secs(totalMs)}) over the ${secs(thresholdMs)} threshold — ` +
        `pauses are removed, not shortened to a set length (a short breath is kept at each edge)`,
      payload: { kind: "tighten-silences" as const, ranges: pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs })), proposals: pauses, thresholdMs },
    };
    steps.push(intent?.silenceThresholdMs ? aiStep(stepDef) : autoStep(stepDef));
  }

  /* ---- model-proposed cuts (grounded) ----------------------------------- */
  if (grounded && grounded.cuts.length > 0) {
    const totalMs = grounded.cuts.reduce((s, r) => s + (r.endMs - r.startMs), 0);
    const reasons = grounded.cutReasons.filter(Boolean);
    steps.push(aiStep({
      id: "cut-ranges", kind: "cut-ranges", label: "Cut the flagged ranges",
      detail:
        `Cut ${grounded.cuts.length} range${grounded.cuts.length === 1 ? "" : "s"} (${secs(totalMs)})` +
        (reasons.length ? ` — ${reasons.slice(0, 2).join("; ")}${reasons.length > 2 ? ` (+${reasons.length - 2} more)` : ""}` : ""),
      payload: { kind: "cut-ranges", ranges: grounded.cuts, reasons: grounded.cutReasons },
    }));
  }

  /* ---- auto zooms -------------------------------------------------------- */
  if (effIntensity) {
    const zoomPlan = generateAutoZoomPlan({
      words: doc.words, clips: comp.videoClips,
      peaks: input.peaks ? { peaks: input.peaks, hopMs: input.hopMs } : null,
      intensity: effIntensity,
    });
    if (zoomPlan.zooms.length > 0) {
      const stepDef = {
        id: "auto-zooms" as const, kind: "auto-zooms" as const, label: "Auto punch-in zooms",
        detail: `${zoomPlan.zooms.length} zoom${zoomPlan.zooms.length === 1 ? "" : "s"} at ${effIntensity}${zoomPlan.skipped.length > 0 ? ` (${zoomPlan.skipped.length} signal${zoomPlan.skipped.length === 1 ? "" : "s"} skipped by the placement rules)` : ""}`,
        payload: { kind: "auto-zooms" as const, intensity: effIntensity, plan: zoomPlan },
      };
      steps.push(intent?.intensity ? aiStep(stepDef) : autoStep(stepDef));
    }
  }

  /* ---- emphasis words (grounded model words only — A1's rule) ----------- */
  if (grounded && grounded.emphasis.length > 0) {
    const texts = grounded.emphasis.map((s) => `“${s.text}”`);
    steps.push(aiStep({
      id: "emphasis-words", kind: "emphasis-words", label: "Emphasise key words",
      detail: `Emphasise ${texts.length} word${texts.length === 1 ? "" : "s"}: ${texts.slice(0, 5).join(", ")}${texts.length > 5 ? ` (+${texts.length - 5} more)` : ""}`,
      payload: { kind: "emphasis-words", suggestions: grounded.emphasis },
    }));
  }

  /* ---- title (the intent's, else the A5 routing's) ----------------------- */
  const intentTitle = intent?.title?.trim() ?? "";
  const a5Title = options.titleResult?.title.trim() ?? "";
  const titleText = intentTitle || a5Title;

  /* ---- hook text ---------------------------------------------------------- */
  const deterministicHook =
    effStyle.toggles.elements === "standard"
      ? doc.words.filter((w) => !w.hidden).slice(0, 4).map((w) => w.text).join(" ")
      : "";
  const hookText = intent?.hookText?.trim() || deterministicHook;
  if (hookText) {
    const stepDef = {
      id: "hook-text" as const, kind: "hook-text" as const, label: "Hook text",
      detail: `Show “${hookText}” at the start`,
      payload: { kind: "hook-text" as const, text: hookText },
    };
    steps.push(intent?.hookText?.trim() ? aiStep(stepDef) : autoStep(stepDef));
  }

  /* ---- place elements ------------------------------------------------------ */
  let elements: GroundedAiEditIntent["elements"] = grounded?.elements ?? [];
  let elementsFromIntent = elements.length > 0;
  if (!elementsFromIntent && effStyle.toggles.elements !== "none") {
    const dur = comp.durationMs;
    const det: GroundedAiEditIntent["elements"] = [];
    if (dur >= 4000) det.push({ variant: "like-pop", atSec: Math.floor(dur / 2000) });
    if (dur >= 20000) det.push({ variant: "cursor-subscribe", atSec: Math.floor(dur / 1000) - 6 });
    if (effStyle.toggles.elements === "standard" && titleText && dur >= 3000) {
      det.push({ variant: "lower-third-bar", atSec: 1.2, text: titleText.slice(0, 80) });
    }
    elements = det.slice(0, AI_EDIT_CAPS.elements);
    elementsFromIntent = false;
  }
  if (elements.length > 0) {
    const names = elements.map((el) => `${getMotionTemplate(el.variant)?.title ?? el.variant} at ${el.atSec.toFixed(1)}s`);
    const stepDef = {
      id: "place-elements" as const, kind: "place-elements" as const, label: "Place graphic elements",
      detail: `${elements.length} element${elements.length === 1 ? "" : "s"}: ${names.join(", ")}`,
      payload: { kind: "place-elements" as const, elements },
    };
    steps.push(elementsFromIntent ? aiStep(stepDef) : autoStep(stepDef));
  }

  /* ---- title card ------------------------------------------------------------ */
  if (titleText) {
    if (intentTitle) {
      steps.push(aiStep({
        id: "title-card", kind: "title-card", label: "Title card",
        detail: `Add title card “${intentTitle}” at the start`,
        payload: { kind: "title-card", title: intentTitle },
      }));
    } else if (options.titleResult) {
      const tr = options.titleResult;
      const aiMade = tr.source === "cloud" || tr.source === "model";
      steps.push({
        id: "title-card", kind: "title-card", label: "Title card",
        source: aiMade ? "ai-suggested" : "automatic",
        badge: { source: tr.source, fellBack: tr.fellBack, ...(tr.note ? { note: tr.note } : {}) },
        detail: `Add title card “${a5Title}” at the start`,
        payload: { kind: "title-card", title: a5Title },
      });
    }
  }

  /* ---- music ducking (style-gated; the Polish rule) -------------------------- */
  if (effStyle.toggles.ducking) {
    const musicTrack = comp.audioTracks.find((t) => t.role === "music");
    const hasVoiceOrMain = comp.videoClips.length > 0 || comp.audioTracks.some((t) => t.role === "voice");
    if (musicTrack && hasVoiceOrMain) {
      const cur = musicTrack.ducking;
      const already = cur.enabled && cur.amountDb >= POLISH_DUCKING_AMOUNT_DB;
      if (!already) {
        const amountDb = cur.enabled ? Math.max(cur.amountDb, POLISH_DUCKING_AMOUNT_DB) : POLISH_DUCKING_AMOUNT_DB;
        steps.push(autoStep({
          id: "music-ducking", kind: "music-ducking", label: "Music ducking",
          detail: `Duck “${musicTrack.name}” by ${amountDb} dB under the voice`,
          payload: { kind: "music-ducking", trackId: musicTrack.id, trackName: musicTrack.name, patch: { enabled: true, amountDb } },
        }));
      }
    }
  }

  steps.sort((a, b) => POLISH_STEP_ORDER.indexOf(a.kind) - POLISH_STEP_ORDER.indexOf(b.kind));

  if (intent?.notes?.trim()) notices.push(intent.notes.trim());
  if (options.transcriptTruncated) {
    notices.push("The transcript was shortened to fit the AI request limit — the later part wasn't read.");
  }

  return {
    plan: { steps },
    droppedNotes,
    notices,
    brollQueries: (intent?.brollQueries ?? []).filter((q) => q.trim()),
    engine: badge ? { kind: "ai", badge } : { kind: "template" },
  };
}
