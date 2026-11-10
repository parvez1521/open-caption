import {
  ProjectSettingsSchema,
  type CaptionDoc,
  type CaptionStyleV2,
  type ProjectSettings,
  type SegmentTransition,
} from "@capseasy/shared";
import { applyLook, getLook, TRENDING_LOOKS } from "@capseasy/templates";
import type { Source } from "../create/model";
import type { GenerationDeps, ModelRunner } from "../create/service";
import { addAudioBleeps, setAudioDucking } from "./audioOps";
import {
  applyContentEffect,
  applyDocEffect,
  setSegmentPlaybackRate,
  setSegmentTransition,
} from "./compositionOps";
import {
  applyAutoZooms,
  generateAutoZoomPlan,
  type AppliedAutoZoom,
  type AutoZoomIntensity,
  type AutoZoomPlan,
} from "./autoZooms";
import { projectComposition, type EditorComposition } from "./compositionDoc";
import { appendTitleCardClip, makeTitleCardOverlay, type TitleCardResult } from "./titleCard";
import { applyTrimCuts, proposeTrimCuts, type TrimProposal, type TrimRange } from "./trim";

/**
 * One-click Polish (Phase 5, Addition A2) — the honest automated edit pass.
 *
 * Polish is a PLAN, not a black box: {@link buildPolishPlan} composes the
 * existing Phase-5 features — A3 trim proposals, A4 auto zooms, A5 title
 * card, the ordinary caption-look pick, and 4.8 audio ducking — into an
 * ordered list of steps the user reviews, checks/unchecks, and only then
 * applies. Every artefact a step produces is the ordinary object its own
 * feature would have made, because apply literally calls that feature's
 * apply function (asserted by equality tests against the standalone calls).
 *
 * HONESTY RULES (pinned by tests):
 * - A step is labelled `source: "ai-suggested"` ONLY when a real Phase-3
 *   route (cloud free AI or the on-device model) actually made that step's
 *   choice, and then it carries the route's badge data (`badge.source` is
 *   "cloud" | "model", fit for the existing `SourceBadge`). Deterministic
 *   steps are `"automatic"`. The template engine NEVER makes a step
 *   "ai-suggested": a template-written title is an automatic step whose
 *   badge still says "Template engine", exactly like A5.
 * - When no AI route answers, the choices fall back to the stated
 *   deterministic defaults (first candidate look, medium zooms) and the
 *   labels flip to "automatic" — there is no silent AI claim.
 * - A step that would do nothing is ABSENT from the plan (no fillers → no
 *   filler step; no music track → no ducking step), never a fake no-op.
 *
 * SILENCES: A3's engine only REMOVES ranges (keeping a breath margin), it
 * cannot shorten a pause to a set length — so the polish silence step
 * removes pauses above a HIGHER threshold than A3's default
 * ({@link POLISH_SILENCE_THRESHOLD_MS} vs 800 ms) and its label says exactly
 * that.
 *
 * APPLY = ONE UNDO STEP: {@link applyPolishPlan} threads the checked steps
 * through one working state and returns ONE next state; StudioPage commits
 * it with a single `editAll`, so one Ctrl+Z undoes the whole pass. Apply
 * order differs from display order for one reason: zooms are planned on the
 * original timeline, so they land BEFORE the trim cuts shift that timeline
 * (A3's range removal then carries/shifts their keyframes exactly as it
 * would for hand-made ones), and the title card is placed AFTER the cuts so
 * it sits at the final t=0.
 *
 * PER-STEP REVERT: applying captures each step's BEFORE state (immutable
 * references — free to keep). A step's revert restores the fields in its
 * declared scope from that before-slice as a new single edit. Scopes are
 * disjoint by construction except the two trim steps, which share the
 * doc/video scope: reverting either trim step restores the pre-trim scope
 * (both cuts), and reverting steps newest-first is always exact —
 * reverting ALL steps in reverse order returns the pre-Polish state
 * bit-for-bit (pinned by tests).
 */

export type PolishStepKind =
  | "trim-fillers"
  | "tighten-silences"
  | "auto-zooms"
  | "caption-look"
  | "title-card"
  | "music-ducking"
  /* Phase 8 (A8): the Edit Assistant's extra step kinds ride THIS plan
   * system (one plan type, one apply, one revert machinery) rather than a
   * second one. buildPolishPlan never produces them — only the assistant's
   * plan builder does. */
  | "bleep-profanity"
  | "segment-speed"
  | "segment-transition";

/** Display order of the plan (apply order is {@link POLISH_APPLY_ORDER}). */
export const POLISH_STEP_ORDER: readonly PolishStepKind[] = [
  "trim-fillers",
  "tighten-silences",
  "auto-zooms",
  "caption-look",
  "title-card",
  "music-ducking",
  "bleep-profanity",
  "segment-speed",
  "segment-transition",
];

const POLISH_APPLY_ORDER: readonly PolishStepKind[] = [
  "caption-look",
  "auto-zooms",
  "trim-fillers",
  "tighten-silences",
  "title-card",
  "music-ducking",
  "segment-speed",
  "segment-transition",
  "bleep-profanity",
];

/**
 * The polish silence threshold: pauses must exceed 1.2 s to be removed by
 * the one-click pass — stricter than A3's interactive default (800 ms),
 * because an unattended pass should only take dead air nobody would miss.
 */
export const POLISH_SILENCE_THRESHOLD_MS = 1200;
/** The deterministic zoom default when no AI route picks an intensity. */
export const DEFAULT_POLISH_INTENSITY: AutoZoomIntensity = "medium";
/** Ducking strength the polish pass enables on the music track. */
export const POLISH_DUCKING_AMOUNT_DB = 12;
/** How many trending looks form the caption-look candidate set by default. */
export const POLISH_LOOK_CANDIDATE_COUNT = 4;

/** The whole editable project, as the pure core sees it. `settings` is the
 *  base settings the composition projects onto at commit time. */
export interface PolishProjectState {
  doc: CaptionDoc;
  comp: EditorComposition;
  settings: ProjectSettings;
  style: CaptionStyleV2 | null;
  lookId: string | null;
}

/** The settings a commit of this state must carry (composition projected). */
export function polishCommitSettings(state: PolishProjectState): ProjectSettings {
  return projectComposition(state.comp, state.settings);
}

/** Badge data for a step whose choice came through the Phase-3 routing. */
export interface PolishBadge {
  source: Source;
  fellBack: boolean;
  note?: string;
}

/**
 * The choices a real AI route made for this plan (see
 * {@link resolvePolishAiChoices}). Only "cloud" / "model" sources can ever
 * appear here — a template outcome is not a choice, it is the absence of one.
 */
export interface PolishAiChoices {
  lookId?: string;
  intensity?: AutoZoomIntensity;
  source: Extract<Source, "cloud" | "model">;
  fellBack: boolean;
  note?: string;
}

export type PolishStepPayload =
  | { kind: "trim-fillers"; ranges: TrimRange[]; proposals: TrimProposal[] }
  | { kind: "tighten-silences"; ranges: TrimRange[]; proposals: TrimProposal[]; thresholdMs: number }
  | { kind: "auto-zooms"; intensity: AutoZoomIntensity; plan: AutoZoomPlan }
  | { kind: "caption-look"; lookId: string; lookName: string }
  | { kind: "title-card"; title: string }
  | { kind: "music-ducking"; trackId: string; trackName: string; patch: { enabled: true; amountDb: number } }
  /* A8 payloads: the same step envelope, for ops A2's own pass never plans */
  | { kind: "bleep-profanity"; ranges: { startMs: number; endMs: number; wordText: string }[]; matchCount: number }
  | { kind: "segment-speed"; clipId: string; segmentIndex: number; rate: number }
  | { kind: "segment-transition"; clipId: string; segmentIndex: number; transition: SegmentTransition };

export interface PolishStep {
  /** == kind (one step per kind in a plan) — stable checkbox/revert key */
  id: PolishStepKind;
  kind: PolishStepKind;
  label: string;
  source: "ai-suggested" | "automatic";
  /** present when a routed generation informed this step (title: always,
   *  carrying its A5 result's source — "template" included, honestly) */
  badge?: PolishBadge;
  /** one plain line: counts and amounts, e.g. `Remove 6 fillers (4.2s)` */
  detail: string;
  payload: PolishStepPayload;
}

export interface PolishPlan {
  steps: PolishStep[];
}

export interface BuildPolishPlanInput {
  doc: CaptionDoc;
  comp: EditorComposition;
  settings: ProjectSettings;
  lookId: string | null;
  /** waveform peaks for the project (useWaveform), or null when not decoded */
  peaks: Float32Array | null;
  hopMs: number;
}

export interface BuildPolishPlanOptions {
  /** the A5 title result, when the caller generated one (panel does, async) */
  titleResult?: TitleCardResult | null;
  /** choices a real AI route made; null/absent = deterministic defaults */
  aiChoices?: PolishAiChoices | null;
  /** candidate look ids for the caption-look step (default: trending looks) */
  lookCandidateIds?: readonly string[];
  silenceThresholdMs?: number;
  duckingAmountDb?: number;
}

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** The default candidate set: the first trending looks, in gallery order. */
export function defaultPolishLookCandidates(): string[] {
  return TRENDING_LOOKS.slice(0, POLISH_LOOK_CANDIDATE_COUNT).map((l) => l.id);
}

/**
 * Build the polish plan for a project. Pure: same state + options, same plan
 * (the title overlay's id is minted at APPLY time, not here). Steps with
 * nothing to do are absent; the rest are in {@link POLISH_STEP_ORDER}.
 */
export function buildPolishPlan(input: BuildPolishPlanInput, options: BuildPolishPlanOptions = {}): PolishPlan {
  const { doc, comp } = input;
  const steps: PolishStep[] = [];
  const ai = options.aiChoices ?? null;

  /* ---- (a)+(b) trims: one A3 proposal pass at the polish threshold ---- */
  const thresholdMs = Math.max(1, Math.round(options.silenceThresholdMs ?? POLISH_SILENCE_THRESHOLD_MS));
  const proposals = proposeTrimCuts({
    words: doc.words,
    peaks: input.peaks,
    hopMs: input.hopMs,
    durationMs: comp.durationMs,
    thresholdMs,
  });
  const fillers = proposals.filter((p) => p.kind === "filler");
  if (fillers.length > 0) {
    const totalMs = fillers.reduce((s, p) => s + p.durationMs, 0);
    steps.push({
      id: "trim-fillers",
      kind: "trim-fillers",
      label: "Remove filler words",
      source: "automatic",
      detail: `Remove ${fillers.length} filler${fillers.length === 1 ? "" : "s"} (${secs(totalMs)})`,
      payload: { kind: "trim-fillers", ranges: fillers.map((p) => ({ startMs: p.startMs, endMs: p.endMs })), proposals: fillers },
    });
  }
  const pauses = proposals.filter((p) => p.kind === "pause");
  if (pauses.length > 0) {
    const totalMs = pauses.reduce((s, p) => s + p.durationMs, 0);
    steps.push({
      id: "tighten-silences",
      kind: "tighten-silences",
      label: `Remove pauses longer than ${secs(thresholdMs)}`,
      source: "automatic",
      detail:
        `Remove ${pauses.length} long pause${pauses.length === 1 ? "" : "s"} (${secs(totalMs)}) over the ${secs(thresholdMs)} polish threshold — ` +
        `pauses are removed, not shortened to a set length (a short breath is kept at each edge)`,
      payload: { kind: "tighten-silences", ranges: pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs })), proposals: pauses, thresholdMs },
    });
  }

  /* ---- (c) auto zooms (A4 plan at the chosen intensity) ---------------- */
  const zoomAi = ai?.intensity ? ai : null;
  const intensity = zoomAi?.intensity ?? DEFAULT_POLISH_INTENSITY;
  const zoomPlan = generateAutoZoomPlan({
    words: doc.words,
    clips: comp.videoClips,
    peaks: input.peaks ? { peaks: input.peaks, hopMs: input.hopMs } : null,
    intensity,
  });
  if (zoomPlan.zooms.length > 0) {
    steps.push({
      id: "auto-zooms",
      kind: "auto-zooms",
      label: "Auto punch-in zooms",
      source: zoomAi ? "ai-suggested" : "automatic",
      ...(zoomAi ? { badge: { source: zoomAi.source, fellBack: zoomAi.fellBack, ...(zoomAi.note ? { note: zoomAi.note } : {}) } } : {}),
      detail: `${zoomPlan.zooms.length} zoom${zoomPlan.zooms.length === 1 ? "" : "s"} at ${intensity}${zoomPlan.skipped.length > 0 ? ` (${zoomPlan.skipped.length} signal${zoomPlan.skipped.length === 1 ? "" : "s"} skipped by the placement rules)` : ""}`,
      payload: { kind: "auto-zooms", intensity, plan: zoomPlan },
    });
  }

  /* ---- (d) caption look ------------------------------------------------- */
  const candidates = (options.lookCandidateIds ?? defaultPolishLookCandidates()).filter(
    (id) => id !== input.lookId && !!getLook(id),
  );
  if (candidates.length > 0) {
    const aiPick = ai?.lookId && candidates.includes(ai.lookId) ? ai : null;
    const lookId = aiPick?.lookId ?? candidates[0]!;
    const look = getLook(lookId)!;
    steps.push({
      id: "caption-look",
      kind: "caption-look",
      label: "Caption look",
      source: aiPick ? "ai-suggested" : "automatic",
      ...(aiPick ? { badge: { source: aiPick.source, fellBack: aiPick.fellBack, ...(aiPick.note ? { note: aiPick.note } : {}) } } : {}),
      detail: `Apply the “${look.name}” caption look`,
      payload: { kind: "caption-look", lookId, lookName: look.name },
    });
  }

  /* ---- (e) title card (A5 generation result, badged as generated) ------- */
  const title = options.titleResult?.title.trim() ?? "";
  if (options.titleResult && title) {
    const tr = options.titleResult;
    const aiMade = tr.source === "cloud" || tr.source === "model";
    steps.push({
      id: "title-card",
      kind: "title-card",
      label: "Title card",
      source: aiMade ? "ai-suggested" : "automatic",
      badge: { source: tr.source, fellBack: tr.fellBack, ...(tr.note ? { note: tr.note } : {}) },
      detail: `Add title card “${title}” at the start`,
      payload: { kind: "title-card", title },
    });
  }

  /* ---- (f) music ducking (4.8 params) — only with music + voice/main ---- */
  const duckDb = options.duckingAmountDb ?? POLISH_DUCKING_AMOUNT_DB;
  const musicTrack = comp.audioTracks.find((t) => t.role === "music");
  const hasVoiceOrMain = comp.videoClips.length > 0 || comp.audioTracks.some((t) => t.role === "voice");
  if (musicTrack && hasVoiceOrMain) {
    const cur = musicTrack.ducking;
    const already = cur.enabled && cur.amountDb >= duckDb;
    if (!already) {
      const amountDb = cur.enabled ? Math.max(cur.amountDb, duckDb) : duckDb;
      steps.push({
        id: "music-ducking",
        kind: "music-ducking",
        label: "Music ducking",
        source: "automatic",
        detail: `Duck “${musicTrack.name}” by ${amountDb} dB under the voice`,
        payload: { kind: "music-ducking", trackId: musicTrack.id, trackName: musicTrack.name, patch: { enabled: true, amountDb } },
      });
    }
  }

  steps.sort((a, b) => POLISH_STEP_ORDER.indexOf(a.kind) - POLISH_STEP_ORDER.indexOf(b.kind));
  return { steps };
}

/* ------------------------------------------------------------------ */
/* AI choice routing — a dedicated strict-JSON pass, emphasis.ts style. */
/* There is NO template fallback: no route answering means no choices,  */
/* and the plan falls back to its deterministic defaults, labelled so.  */
/* ------------------------------------------------------------------ */

const CHOICE_SYSTEM =
  "You pick editing settings for a short vertical video. Reply with ONLY a JSON object — no prose, no code fences.";

export function buildPolishChoicePrompt(input: {
  transcriptText: string;
  lookCandidates: readonly { id: string; name: string }[];
}): { system: string; user: string } {
  const user = [
    "Choose the caption look and the punch-in zoom intensity that best fit this video's transcript.",
    `Looks (reply with the id): ${input.lookCandidates.map((l) => `${l.id} = ${l.name}`).join("; ")}`,
    'Zoom intensity: one of "subtle", "medium", "strong".',
    'Output format: {"lookId": "<one look id>", "intensity": "<subtle|medium|strong>"}',
    "",
    "Transcript:",
    input.transcriptText.slice(0, 1200) || "(no transcript)",
  ].join("\n");
  return { system: CHOICE_SYSTEM, user };
}

const INTENSITIES: ReadonlySet<string> = new Set(["subtle", "medium", "strong"]);

/** Parse a choice reply strictly against the candidate set; null = unusable. */
export function parsePolishChoices(
  raw: string,
  lookCandidateIds: readonly string[],
): { lookId?: string; intensity?: AutoZoomIntensity } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { lookId, intensity } = parsed as { lookId?: unknown; intensity?: unknown };
  const out: { lookId?: string; intensity?: AutoZoomIntensity } = {};
  if (typeof lookId === "string" && lookCandidateIds.includes(lookId)) out.lookId = lookId;
  if (typeof intensity === "string" && INTENSITIES.has(intensity)) out.intensity = intensity as AutoZoomIntensity;
  return out.lookId || out.intensity ? out : null;
}

async function tryChoiceRunner(
  runner: ModelRunner,
  prompt: { system: string; user: string },
  candidateIds: readonly string[],
): Promise<{ lookId?: string; intensity?: AutoZoomIntensity } | null> {
  try {
    return parsePolishChoices(await runner(prompt), candidateIds);
  } catch {
    return null;
  }
}

/**
 * Ask the Phase-3 routes (cloud free AI, then the on-device model — the
 * same order and fallback notes as every Phase-3 generator) to choose the
 * polish look + zoom intensity. Returns null when no route is configured
 * or none answers with a usable choice: the caller then builds the plan
 * with deterministic defaults and "automatic" labels.
 */
export async function resolvePolishAiChoices(
  input: { transcriptText: string; lookCandidateIds: readonly string[] },
  deps: GenerationDeps,
): Promise<PolishAiChoices | null> {
  const candidates = input.lookCandidateIds
    .map((id) => getLook(id))
    .filter((l): l is NonNullable<typeof l> => !!l)
    .map((l) => ({ id: l.id, name: l.name }));
  if (candidates.length === 0) return null;
  const prompt = buildPolishChoicePrompt({ transcriptText: input.transcriptText, lookCandidates: candidates });
  const ids = candidates.map((c) => c.id);
  let cloudFailed = false;
  if (deps.runCloud) {
    const picked = await tryChoiceRunner(deps.runCloud, prompt, ids);
    if (picked) return { ...picked, source: "cloud", fellBack: false };
    cloudFailed = true;
  }
  if (deps.modelEnabled && deps.runModel) {
    const picked = await tryChoiceRunner(deps.runModel, prompt, ids);
    if (picked) {
      return cloudFailed
        ? { ...picked, source: "model", fellBack: true, note: "The free AI service was not available for these choices, so the local model made them instead." }
        : { ...picked, source: "model", fellBack: false };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* apply + per-step revert                                              */
/* ------------------------------------------------------------------ */

export interface PolishStepRecord {
  stepId: PolishStepKind;
  kind: PolishStepKind;
  label: string;
  detail: string;
  /** the threaded state JUST BEFORE this step ran (immutable references) */
  before: PolishProjectState;
  reverted: boolean;
  /** what the step actually created, for inspection (zoom keyframe ids, title overlay id) */
  artefacts?: { zoomKeyframeIds?: string[]; titleOverlayId?: string };
}

export interface PolishAppliedRecord {
  /** the pre-Polish state — revert-all returns exactly this */
  before: PolishProjectState;
  /** the current state (starts as the applied result; reverts move it back) */
  current: PolishProjectState;
  /** in APPLY order (see the header for why it differs from display order) */
  steps: PolishStepRecord[];
}

/** Apply ONE step to a threaded state via its own feature's apply function. */
function applyPolishStep(
  state: PolishProjectState,
  step: PolishStep,
): { state: PolishProjectState; artefacts?: PolishStepRecord["artefacts"] } {
  const p = step.payload;
  switch (p.kind) {
    case "trim-fillers":
    case "tighten-silences": {
      const { comp, doc } = applyTrimCuts(state.comp, state.doc, p.ranges);
      return { state: { ...state, comp, doc } };
    }
    case "auto-zooms": {
      const { comp, applied } = applyAutoZooms(state.comp, p.plan);
      return {
        state: { ...state, comp },
        artefacts: { zoomKeyframeIds: applied.flatMap((z: AppliedAutoZoom) => z.keyframeIds) },
      };
    }
    case "caption-look": {
      const look = getLook(p.lookId);
      if (!look) return { state };
      const appliedLook = applyLook(look, state.settings.maxWordsPerCard);
      const settings = ProjectSettingsSchema.parse({ ...state.settings, ...appliedLook.settings });
      return { state: { ...state, style: appliedLook.style, settings, lookId: look.id } };
    }
    case "title-card": {
      const item = makeTitleCardOverlay(p.title, state.comp.durationMs);
      const comp = appendTitleCardClip(state.comp, item);
      return { state: { ...state, comp }, artefacts: { titleOverlayId: item.id } };
    }
    case "music-ducking": {
      const comp = setAudioDucking(state.comp, p.trackId, p.patch);
      return { state: { ...state, comp } };
    }
    case "bleep-profanity": {
      // A6's store op: only the ranges in the (user-confirmed) payload land
      const comp = addAudioBleeps(state.comp, p.ranges);
      return { state: { ...state, comp } };
    }
    case "segment-speed": {
      const r = setSegmentPlaybackRate(state.comp, p.clipId, p.rate);
      if (r.comp === state.comp) return { state };
      const comp = applyContentEffect(r.comp, r.docEffect);
      const doc = applyDocEffect(state.doc, r.docEffect);
      return { state: { ...state, comp, doc } };
    }
    case "segment-transition": {
      const r = setSegmentTransition(state.comp, p.clipId, p.transition);
      if (r.comp === state.comp) return { state };
      const comp = applyContentEffect(r.comp, r.docEffect);
      const doc = applyDocEffect(state.doc, r.docEffect);
      return { state: { ...state, comp, doc } };
    }
  }
}

/**
 * Apply the checked steps of a plan as ONE threaded computation — the
 * caller commits the returned state once (one undo step). Unchecked steps
 * change nothing. Returns the applied record used for per-step revert;
 * applying zero steps returns the input state by reference with an empty
 * record (no undo step earned).
 */
export function applyPolishPlan(
  state: PolishProjectState,
  plan: PolishPlan,
  checkedIds: ReadonlySet<PolishStepKind> | readonly PolishStepKind[],
): { state: PolishProjectState; record: PolishAppliedRecord } {
  const checked = new Set(checkedIds);
  const ordered = [...plan.steps]
    .filter((s) => checked.has(s.id))
    .sort((a, b) => POLISH_APPLY_ORDER.indexOf(a.kind) - POLISH_APPLY_ORDER.indexOf(b.kind));
  let current = state;
  const records: PolishStepRecord[] = [];
  for (const step of ordered) {
    const before = current;
    const { state: next, artefacts } = applyPolishStep(current, step);
    records.push({ stepId: step.id, kind: step.kind, label: step.label, detail: step.detail, before, reverted: false, ...(artefacts ? { artefacts } : {}) });
    current = next;
  }
  return { state: current, record: { before: state, current, steps: records } };
}

/** Restore one step's scope from its before-slice onto `current`. */
function restoreStepScope(current: PolishProjectState, entry: PolishStepRecord): PolishProjectState {
  const before = entry.before;
  switch (entry.kind) {
    case "trim-fillers":
    case "tighten-silences":
    case "segment-speed":
    case "segment-transition":
      // the trim scope: caption doc + the composition fields range removal
      // touches — a rate change (rangeScale) and a transition change
      // (rangeShift) move exactly the same fields, so they share it
      return {
        ...current,
        doc: before.doc,
        comp: {
          ...current.comp,
          videoClips: before.comp.videoClips,
          markers: before.comp.markers,
          overlayClips: before.comp.overlayClips,
          // Phase 9 (W5): the content effects also retime placed audio
          // clips + bleeps, so the trim scope restores them too
          audioClips: before.comp.audioClips,
          audioBleeps: before.comp.audioBleeps,
          durationMs: before.comp.durationMs,
          rangeStartMs: before.comp.rangeStartMs,
        },
      };
    case "auto-zooms": {
      // restore the keyframes of every clip the step's before-slice knows,
      // matched by clip id; clips the trims later split keep what they carry
      const beforeKfs = new Map(before.comp.videoClips.map((c) => [c.id, c.keyframes]));
      return {
        ...current,
        comp: {
          ...current.comp,
          videoClips: current.comp.videoClips.map((c) =>
            beforeKfs.has(c.id) ? { ...c, keyframes: beforeKfs.get(c.id)! } : c,
          ),
        },
      };
    }
    case "caption-look":
      return { ...current, style: before.style, settings: before.settings, lookId: before.lookId };
    case "title-card":
      return { ...current, comp: { ...current.comp, overlayClips: before.comp.overlayClips } };
    case "music-ducking":
      return { ...current, comp: { ...current.comp, audioTracks: before.comp.audioTracks } };
    case "bleep-profanity":
      return { ...current, comp: { ...current.comp, audioBleeps: before.comp.audioBleeps } };
  }
}

/**
 * Revert ONE applied step: returns the record's new current state with that
 * step's scope restored from its before-slice. The caller commits the
 * returned state as a new single undoable edit. Reverting an unknown or
 * already-reverted step returns the record unchanged.
 */
export function revertPolishStep(
  record: PolishAppliedRecord,
  stepId: PolishStepKind,
): { state: PolishProjectState; record: PolishAppliedRecord } {
  const entry = record.steps.find((s) => s.stepId === stepId);
  if (!entry || entry.reverted) return { state: record.current, record };
  const state = restoreStepScope(record.current, entry);
  const next: PolishAppliedRecord = {
    ...record,
    current: state,
    steps: record.steps.map((s) => (s.stepId === stepId ? { ...s, reverted: true } : s)),
  };
  return { state, record: next };
}

/**
 * Revert every remaining step, newest first — by the scope argument in the
 * header this lands exactly on the pre-Polish state (the same references,
 * hence bit-for-bit, and its projected settings equal the original's).
 */
export function revertAllPolish(record: PolishAppliedRecord): { state: PolishProjectState; record: PolishAppliedRecord } {
  let working = record;
  let state = record.current;
  for (const entry of [...record.steps].reverse()) {
    if (entry.reverted) continue;
    const out = revertPolishStep(working, entry.stepId);
    working = out.record;
    state = out.state;
  }
  return { state, record: working };
}
