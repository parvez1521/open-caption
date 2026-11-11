import { describe, expect, it } from "vitest";
import {
  CaptionDocSchema,
  ProjectSettingsSchema,
  type CaptionDoc,
  type Page,
  type ProjectSettings,
  type Word,
} from "@capseasy/shared";
import { getLook } from "@capseasy/templates";
import { getMotionTemplate } from "@capseasy/motion";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, type EditorComposition } from "../compositionDoc";
import type { GenerationDeps } from "../../create/service";
import {
  applyPolishPlan,
  polishCommitSettings,
  revertAllPolish,
  revertPolishStep,
  type PolishProjectState,
} from "../polish";
import { appendTitleCardClip, makeTitleCardOverlay } from "../titleCard";
import { applyLook } from "@capseasy/templates";
import {
  AI_EDIT_ELEMENT_VOCAB,
  AI_EDIT_STYLES,
  aiEditStyle,
  buildAiEditContext,
  buildAiEditPlan,
  groundAiEditIntent,
  parseAiEditIntent,
  resolveAiEditIntent,
  type AiEditPlanIntent,
} from "../aiEdit";

/**
 * AI Edit (2026-11-11) — §10 test plan: stage-1 schema validation, stage-2
 * grounding drops (nothing silently invented, nothing silently dropped),
 * fallback labelling (the deterministic plan never wears an AI badge),
 * per-step revert + revert-all bit-identity for the four new step kinds,
 * and composition parity (the settings the exporter consumes carry exactly
 * the overlays the plan placed).
 */

const word = (id: string, text: string, startMs: number, endMs: number, extra: Partial<Word> = {}): Word => ({
  id, text, startMs, endMs, ...extra,
});
const docOf = (words: Word[]): CaptionDoc => CaptionDocSchema.parse({ version: 2, language: "en", words });

const HOP = 20;
function peaksWithQuiet(totalMs: number, quiet: Array<[number, number]>): Float32Array {
  const n = Math.ceil(totalMs / HOP);
  const out = new Float32Array(n).fill(0.8);
  for (const [a, b] of quiet) for (let i = Math.floor(a / HOP); i < Math.min(n, Math.ceil(b / HOP)); i++) out[i] = 0.02;
  return out;
}

/* fixture timeline (30 s):
 * hello [0,500] · um [600,900] (filler) · amazing [2000,2400] (hero → zoom)
 * … 2.6 s silent gap … world [5000,5500] · this is huge [6000,7100] · done [20000,20500] */
const words: Word[] = [
  word("w1", "hello", 0, 500),
  word("w2", "um", 600, 900),
  word("w3", "amazing", 2000, 2400, { emphasis: "hero" }),
  word("w4", "world", 5000, 5500),
  word("w5", "this", 6000, 6300),
  word("w6", "is", 6400, 6600),
  word("w7", "huge", 6700, 7100),
  word("w8", "done", 20000, 20500),
];
const peaks = peaksWithQuiet(30_000, [[2400, 5000]]);

const settingsWithMusic: ProjectSettings = ProjectSettingsSchema.parse({
  composition: {
    version: 1,
    videoSegments: [],
    markers: [],
    audio: {
      tracks: [
        { id: "music-1", name: "Music", role: "music", volume: 1, muted: false, locked: false, ducking: { enabled: false, amountDb: 12, thresholdDb: -42 } },
        { id: "voice-1", name: "Voice", role: "voice", volume: 1, muted: false, locked: false, ducking: { enabled: false, amountDb: 12, thresholdDb: -42 } },
      ],
      clips: [],
    },
  },
});
const settingsNoMusic: ProjectSettings = ProjectSettingsSchema.parse({});

const page = (id: string, ws: Word[]): Page => ({
  id, startMs: ws[0]?.startMs ?? 0, endMs: ws[ws.length - 1]?.endMs ?? 0,
  words: ws, lines: [ws], heroIndex: -1, emotion: "neutral", position: null, styleOverride: null,
});

function compFor(settings: ProjectSettings): EditorComposition {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 30_000 },
    doc: null, pages: [page("p1", words)], settings, durationMs: 30_000,
  };
  return buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs: 30_000 });
}

function stateFor(settings: ProjectSettings = settingsWithMusic): PolishProjectState {
  const look = getLook("hormozi_box")!;
  return { doc: docOf(words), comp: compFor(settings), settings, style: applyLook(look).style, lookId: "hormozi_box" };
}

const planInput = (state: PolishProjectState) => ({
  doc: state.doc, comp: state.comp, settings: state.settings, lookId: state.lookId, peaks, hopMs: HOP,
});

const ground = (intent: AiEditPlanIntent, state = stateFor()) =>
  groundAiEditIntent(intent, { doc: state.doc, durationMs: state.comp.durationMs });

const CLOUD_BADGE = { source: "cloud" as const, fellBack: false };

describe("registries — every id the styles and vocabulary name is real", () => {
  it("style look ids resolve in the templates registry", () => {
    for (const s of AI_EDIT_STYLES) expect(getLook(s.lookId), s.id).toBeTruthy();
  });
  it("element vocabulary ids resolve in the motion registry", () => {
    for (const id of AI_EDIT_ELEMENT_VOCAB) expect(getMotionTemplate(id), id).toBeTruthy();
  });
});

describe("parseAiEditIntent — stage-1 schema validation", () => {
  it("a full valid intent parses", () => {
    const raw = JSON.stringify({
      styleId: "punchy", intensity: "strong", silenceThresholdMs: 900, trimFillers: true,
      cuts: [{ startSec: 6, endSec: 7, reason: "repeat" }], emphasisWords: ["huge"],
      hookText: "Watch this", elements: [{ templateId: "like-pop", atSec: 5 }],
      brollQueries: ["city traffic"], notes: "Tighten it up",
    });
    const intent = parseAiEditIntent(`Here is the plan: ${raw}`);
    expect(intent?.styleId).toBe("punchy");
    expect(intent?.cuts).toHaveLength(1);
    expect(intent?.notes).toBe("Tighten it up");
  });
  it("no JSON object / broken JSON → null (malformed, routing moves on)", () => {
    expect(parseAiEditIntent("I would tighten the pacing.")).toBeNull();
    expect(parseAiEditIntent("{not json")).toBeNull();
    expect(parseAiEditIntent("[1,2,3]")).toBeNull();
  });
  it("out-of-contract values make the whole intent malformed — never clamped", () => {
    expect(parseAiEditIntent(JSON.stringify({ silenceThresholdMs: 300 }))).toBeNull();
    expect(parseAiEditIntent(JSON.stringify({ silenceThresholdMs: 9000 }))).toBeNull();
    expect(parseAiEditIntent(JSON.stringify({ intensity: "extreme" }))).toBeNull();
    expect(parseAiEditIntent(JSON.stringify({ cuts: [{ startSec: "six", endSec: 7 }] }))).toBeNull();
  });
  it("over-cap arrays are sliced to the caps, not rejected", () => {
    const cuts = Array.from({ length: 10 }, (_, i) => ({ startSec: i, endSec: i + 0.5 }));
    const intent = parseAiEditIntent(JSON.stringify({ cuts }));
    expect(intent?.cuts).toHaveLength(8);
  });
  it("an empty-but-valid intent is legitimate (the style defaults, unchanged)", () => {
    expect(parseAiEditIntent("{}")).toEqual({});
  });
});

describe("groundAiEditIntent — stage-2 grounding drops, each one reported", () => {
  it("an unknown style id is dropped with a note; a known one is kept", () => {
    const bad = ground({ styleId: "cinematic-epic" });
    expect(bad.styleId).toBeUndefined();
    expect(bad.droppedNotes.join(" ")).toContain("isn't one of the edit styles");
    expect(ground({ styleId: "punchy" }).styleId).toBe("punchy");
  });
  it("cuts: out-of-bounds, inverted and sub-300ms ranges drop with notes", () => {
    const g = ground({
      cuts: [
        { startSec: 25, endSec: 40 },   // past the end
        { startSec: 9, endSec: 8 },     // inverted
        { startSec: 10, endSec: 10.2 }, // too short
      ],
    });
    expect(g.cuts).toHaveLength(0);
    expect(g.droppedNotes).toHaveLength(3);
  });
  it("cuts: a valid range is snapped to word edges and survives", () => {
    const g = ground({ cuts: [{ startSec: 6.05, endSec: 7.05, reason: "repeat" }] });
    expect(g.cuts).toHaveLength(1);
    const edges = new Set(words.flatMap((w) => [w.startMs, w.endMs]));
    expect(edges.has(g.cuts[0]!.startMs)).toBe(true);
    expect(edges.has(g.cuts[0]!.endMs)).toBe(true);
    expect(g.cutReasons[0]).toBe("repeat");
  });
  it("cuts: overlapping ranges merge via normalizeTrimRanges, with a note", () => {
    const g = ground({ cuts: [{ startSec: 6, endSec: 7 }, { startSec: 6.5, endSec: 7.5 }] });
    expect(g.cuts).toHaveLength(1);
    expect(g.droppedNotes.join(" ")).toContain("merged");
  });
  it("emphasis: words bind to real doc words (phrases too); strangers drop", () => {
    const g = ground({ emphasisWords: ["world", "this is", "nonexistent"] });
    const texts = g.emphasis.map((s) => s.text);
    expect(texts).toEqual(["world", "this", "is"]);
    expect(g.emphasis.every((s) => s.action === "emphasise")).toBe(true);
    expect(g.droppedNotes.join(" ")).toContain("“nonexistent”");
  });
  it("elements: unknown template ids and out-of-timeline placements drop", () => {
    const g = ground({
      elements: [
        { templateId: "hologram-9000", atSec: 5 },
        { templateId: "like-pop", atSec: 45 },
        { templateId: "cursor-subscribe", atSec: 20, text: "Join us" },
      ],
    });
    expect(g.elements).toHaveLength(1);
    expect(g.elements[0]).toMatchObject({ variant: "cursor-subscribe", atSec: 20, text: "Join us" });
    expect(g.droppedNotes).toHaveLength(2);
  });
});

describe("buildAiEditPlan — fallback labelling (no model = Template engine)", () => {
  it("the deterministic plan: every step automatic, no AI badge anywhere", () => {
    const state = stateFor();
    const res = buildAiEditPlan(planInput(state), {
      style: aiEditStyle("punchy")!, lookId: "beast_bounce", intensity: "strong", grounded: null, badge: null,
    });
    expect(res.engine.kind).toBe("template");
    expect(res.plan.steps.length).toBeGreaterThan(0);
    for (const s of res.plan.steps) {
      expect(s.source).toBe("automatic");
      expect(s.badge?.source).not.toBe("cloud");
      expect(s.badge?.source).not.toBe("model");
    }
    // Punchy: strong zooms + fillers are in; ducking is not a Punchy toggle
    expect(res.plan.steps.map((s) => s.kind)).toContain("auto-zooms");
    expect(res.plan.steps.map((s) => s.kind)).toContain("trim-fillers");
    expect(res.plan.steps.map((s) => s.kind)).not.toContain("music-ducking");
    // deterministic light elements on a 30 s project: like pop + subscribe
    expect(res.plan.steps.map((s) => s.kind)).toContain("place-elements");
  });
  it("Calm: no zoom step at null intensity, no filler step, ducking present with music", () => {
    const state = stateFor();
    const res = buildAiEditPlan(planInput(state), {
      style: aiEditStyle("calm")!, lookId: "soft_glow", intensity: null, grounded: null, badge: null,
    });
    const kinds = res.plan.steps.map((s) => s.kind);
    expect(kinds).not.toContain("auto-zooms");
    expect(kinds).not.toContain("trim-fillers");
    expect(kinds).toContain("music-ducking");
    const noMusic = buildAiEditPlan(planInput(stateFor(settingsNoMusic)), {
      style: aiEditStyle("calm")!, lookId: "soft_glow", intensity: null, grounded: null, badge: null,
    });
    expect(noMusic.plan.steps.map((s) => s.kind)).not.toContain("music-ducking");
  });
});

describe("buildAiEditPlan — with a grounded intent (the model ran)", () => {
  const intent: AiEditPlanIntent = {
    styleId: "punchy",
    cuts: [{ startSec: 12, endSec: 13, reason: "dead air" }],
    emphasisWords: ["world", "huge"],
    hookText: "Nobody tells you this",
    elements: [{ templateId: "like-pop", atSec: 5 }],
    brollQueries: ["city traffic"],
    notes: "Tighten the middle.",
  };
  it("intent-influenced steps are ai-suggested with the route badge; engine is ai", () => {
    const state = stateFor();
    const res = buildAiEditPlan(planInput(state), {
      style: aiEditStyle("clean")!, lookId: "minimal_pro", intensity: "subtle",
      grounded: ground(intent, state), badge: CLOUD_BADGE,
    });
    expect(res.engine).toEqual({ kind: "ai", badge: CLOUD_BADGE });
    for (const kind of ["cut-ranges", "emphasis-words", "hook-text", "place-elements", "caption-look"] as const) {
      const step = res.plan.steps.find((s) => s.kind === kind);
      expect(step, kind).toBeTruthy();
      expect(step!.source).toBe("ai-suggested");
      expect(step!.badge?.source).toBe("cloud");
    }
    // the style override names both styles in the look step's detail
    const look = res.plan.steps.find((s) => s.kind === "caption-look")!;
    expect(look.detail).toContain("Punchy");
    expect(look.detail).toContain("Clean");
    expect(res.brollQueries).toEqual(["city traffic"]);
    expect(res.notices).toContain("Tighten the middle.");
  });
  it("style-default steps stay automatic even when the model ran", () => {
    const state = stateFor();
    const res = buildAiEditPlan(planInput(state), {
      style: aiEditStyle("clean")!, lookId: "minimal_pro", intensity: "subtle",
      grounded: ground({ emphasisWords: ["world"] }, state), badge: CLOUD_BADGE,
    });
    const fillers = res.plan.steps.find((s) => s.kind === "trim-fillers");
    expect(fillers?.source).toBe("automatic");
    expect(fillers?.badge).toBeUndefined();
  });
  it("a truncation notice is carried into the plan notices", () => {
    const state = stateFor();
    const res = buildAiEditPlan(planInput(state), {
      style: aiEditStyle("clean")!, lookId: "minimal_pro", intensity: "subtle",
      grounded: ground({}, state), badge: CLOUD_BADGE, transcriptTruncated: true,
    });
    expect(res.notices.join(" ")).toContain("shortened to fit");
  });
});

/* ------------------------------------------------------------------ */
/* apply + revert for the four new kinds                               */
/* ------------------------------------------------------------------ */

function planWith(state: PolishProjectState, intent: AiEditPlanIntent) {
  return buildAiEditPlan(planInput(state), {
    style: aiEditStyle("clean")!, lookId: "minimal_pro", intensity: null,
    grounded: ground(intent, state), badge: CLOUD_BADGE,
  }).plan;
}

const ALL_NEW: AiEditPlanIntent = {
  cuts: [{ startSec: 12, endSec: 13, reason: "dead air" }],
  emphasisWords: ["world", "huge"],
  hookText: "Nobody tells you this",
  elements: [
    { templateId: "like-pop", atSec: 5 },
    { templateId: "cursor-subscribe", atSec: 20 },
  ],
};

describe("the four new step kinds — apply, per-step revert, revert-all", () => {
  it("cut-ranges cuts the timeline; its step revert restores it", () => {
    const state = stateFor();
    const plan = planWith(state, { cuts: [{ startSec: 12, endSec: 13 }] });
    expect(plan.steps.map((s) => s.kind)).toContain("cut-ranges");
    const { state: next, record } = applyPolishPlan(state, plan, ["cut-ranges"]);
    expect(next.comp.durationMs).toBe(state.comp.durationMs - 1000);
    const back = revertPolishStep(record, "cut-ranges");
    expect(back.state).toEqual(state);
  });

  it("emphasis-words sets strong via the A1 path; the surgical revert restores the exact word slices", () => {
    const state = stateFor();
    const plan = planWith(state, { emphasisWords: ["world", "huge"], elements: [{ templateId: "like-pop", atSec: 5 }] });
    const { state: next, record } = applyPolishPlan(state, plan, ["emphasis-words", "place-elements"]);
    expect(next.doc.words.find((w) => w.id === "w4")?.emphasis).toBe("strong");
    expect(next.doc.words.find((w) => w.id === "w7")?.emphasis).toBe("strong");
    // revert ONLY the emphasis step: the placed element must survive untouched
    const back = revertPolishStep(record, "emphasis-words");
    expect(back.state.doc.words.find((w) => w.id === "w4")).toEqual(state.doc.words.find((w) => w.id === "w4"));
    expect(back.state.doc.words.find((w) => w.id === "w7")).toEqual(state.doc.words.find((w) => w.id === "w7"));
    expect(back.state.comp.overlayClips.length).toBe(next.comp.overlayClips.length);
  });

  it("hook-text places a text overlay at t=0; the surgical revert removes only it", () => {
    const base = stateFor();
    const mine = makeTitleCardOverlay("My own title", base.comp.durationMs);
    const state: PolishProjectState = { ...base, comp: appendTitleCardClip(base.comp, mine) };
    const plan = planWith(state, { hookText: "Watch this first" });
    const { state: next, record } = applyPolishPlan(state, plan, ["hook-text"]);
    const hook = next.comp.overlayClips.find((c) => c.overlay.text === "Watch this first");
    expect(hook).toBeTruthy();
    expect(hook!.startMs).toBe(0);
    const back = revertPolishStep(record, "hook-text");
    expect(back.state.comp.overlayClips.map((c) => c.id)).toEqual([mine.id]);
  });

  it("place-elements places registry overlays; revert removes exactly those ids", () => {
    const state = stateFor();
    const plan = planWith(state, { elements: [{ templateId: "like-pop", atSec: 5 }, { templateId: "cursor-subscribe", atSec: 20 }] });
    const step = plan.steps.find((s) => s.kind === "place-elements")!;
    const { state: next, record } = applyPolishPlan(state, plan, ["place-elements"]);
    expect(next.comp.overlayClips).toHaveLength(state.comp.overlayClips.length + 2);
    const variants = next.comp.overlayClips.map((c) => c.overlay.variant);
    expect(variants).toContain("like-pop");
    expect(variants).toContain("cursor-subscribe");
    void step;
    const back = revertPolishStep(record, "place-elements");
    expect(back.state.comp.overlayClips).toEqual(state.comp.overlayClips);
  });

  it("revert-all over a full AI plan (new + existing kinds) is bit-identical", () => {
    const state = stateFor();
    const plan = planWith(state, ALL_NEW);
    const kinds = plan.steps.map((s) => s.kind);
    for (const k of ["cut-ranges", "emphasis-words", "hook-text", "place-elements", "caption-look", "trim-fillers", "tighten-silences"]) {
      expect(kinds, k).toContain(k);
    }
    const { record } = applyPolishPlan(state, plan, kinds);
    const back = revertAllPolish(record);
    expect(back.state).toEqual(state);
    expect(polishCommitSettings(back.state)).toEqual(polishCommitSettings(state));
  });

  it("composition parity: the committed settings carry exactly the placed overlays", () => {
    const state = stateFor();
    const plan = planWith(state, ALL_NEW);
    const { state: next, record } = applyPolishPlan(state, plan, ["hook-text", "place-elements"]);
    const placedIds = new Set(record.steps.flatMap((s) => s.artefacts?.overlayIds ?? []));
    expect(placedIds.size).toBe(3);
    const overlays = polishCommitSettings(next).overlays ?? [];
    for (const id of placedIds) expect(overlays.some((o) => o.id === id), id).toBe(true);
    expect(overlays.find((o) => o.id === [...placedIds][0])?.kind).toBeDefined();
    expect(overlays.some((o) => o.text === "Nobody tells you this")).toBe(true);
    expect(overlays.some((o) => o.variant === "like-pop")).toBe(true);
    expect(overlays.some((o) => o.variant === "cursor-subscribe")).toBe(true);
  });
});

describe("buildAiEditContext — the 4,000-char route budget", () => {
  it("a short transcript fits whole: anchors, signals, no truncation", () => {
    const state = stateFor();
    const ctx = buildAiEditContext({
      doc: state.doc, comp: state.comp, lookId: state.lookId,
      style: aiEditStyle("clean")!, instruction: "", peaks, hopMs: HOP,
    });
    expect(ctx.truncated).toBe(false);
    expect(ctx.user.length).toBeLessThanOrEqual(4000);
    expect(ctx.system.length).toBeLessThanOrEqual(4000);
    expect(ctx.user).toContain("[0.0s] hello");
    expect(ctx.user).toContain("Measured signals:");
    expect(ctx.user).toContain("fillers:");
  });
  it("a long transcript truncates at a sentence boundary and says so", () => {
    const many: Word[] = [];
    for (let s = 0; s < 120; s++) {
      for (let w = 0; w < 8; w++) {
        const start = s * 4000 + w * 450;
        many.push(word(`s${s}w${w}`, w === 7 ? "end." : `tok${w}`, start, start + 400));
      }
    }
    const longDoc = docOf(many);
    const state = stateFor();
    const ctx = buildAiEditContext({
      doc: longDoc, comp: { ...state.comp, durationMs: 480_000 }, lookId: state.lookId,
      style: aiEditStyle("clean")!, instruction: "make it tight", peaks: null, hopMs: HOP,
    });
    expect(ctx.truncated).toBe(true);
    expect(ctx.user.length).toBeLessThanOrEqual(4000);
  });
});

describe("resolveAiEditIntent — routing honesty", () => {
  const ctxInput = () => {
    const state = stateFor();
    return {
      doc: state.doc, comp: state.comp, lookId: state.lookId,
      style: aiEditStyle("clean")!, instruction: "", peaks, hopMs: HOP,
    };
  };
  it("cloud answers → cloud outcome, not fell back", async () => {
    const deps: GenerationDeps = { runCloud: async () => JSON.stringify({ intensity: "strong" }), modelEnabled: false };
    const out = await resolveAiEditIntent(ctxInput(), deps);
    expect(out?.source).toBe("cloud");
    expect(out?.fellBack).toBe(false);
    expect(out?.intent.intensity).toBe("strong");
  });
  it("cloud malformed → the local model answers, labelled fell back", async () => {
    const deps: GenerationDeps = {
      runCloud: async () => "no json here",
      modelEnabled: true,
      runModel: async () => JSON.stringify({ hookText: "Start here" }),
    };
    const out = await resolveAiEditIntent(ctxInput(), deps);
    expect(out?.source).toBe("model");
    expect(out?.fellBack).toBe(true);
    expect(out?.note).toContain("local model");
  });
  it("no usable reply anywhere → null (the caller builds the template plan)", async () => {
    const deps: GenerationDeps = { runCloud: async () => "nope", modelEnabled: false };
    expect(await resolveAiEditIntent(ctxInput(), deps)).toBeNull();
    expect(await resolveAiEditIntent(ctxInput(), { modelEnabled: false })).toBeNull();
  });
});
