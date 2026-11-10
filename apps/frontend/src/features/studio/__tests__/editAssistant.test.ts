import { describe, expect, it, vi } from "vitest";
import {
  CaptionDocSchema,
  ProjectSettingsSchema,
  type CaptionDoc,
  type Page,
  type ProjectSettings,
  type Word,
} from "@capseasy/shared";
import { applyLook, getLook } from "@capseasy/templates";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, type EditorComposition } from "../compositionDoc";
import { applyContentEffect, applyDocEffect, setSegmentPlaybackRate, setSegmentTransition } from "../compositionOps";
import { applyTrimCuts } from "../trim";
import { applyAutoZooms, generateAutoZoomPlan } from "../autoZooms";
import { addAudioBleeps, setAudioDucking } from "../audioOps";
import { applyPolishPlan, type PolishProjectState } from "../polish";
import type { ModelRunner } from "../../create/service";
import {
  ASSISTANT_INTENTS,
  ASSISTANT_INTENT_IDS,
  ASSISTANT_LOOK_CANDIDATES,
  ASSISTANT_NO_ROUTE_REASON,
  buildAssistantPlan,
  buildAssistantPrompt,
  parseAssistantOutput,
  runAssistantTurn,
  type AssistantCommand,
  type AssistantContext,
} from "../editAssistant";

/**
 * A8 — Edit Assistant: the fixed intent set is the single source for the
 * prompt, the strict parser and the panel list; every intent maps
 * deterministically onto a polish plan step whose apply equals the
 * standalone feature op; refusals (unknown / unsupported / malformed /
 * out-of-range) produce no plan and change nothing; routing has NO
 * template floor — no AI route means unavailable, never a fake answer.
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

/* fixture timeline (20 s): hello · um (filler) · amazing (hero → zoom) ·
 * shit (listed profanity) · … quiet gap … · world                        */
const words: Word[] = [
  word("w1", "hello", 0, 500),
  word("w2", "um", 600, 900),
  word("w3", "amazing", 2000, 2400, { emphasis: "hero" }),
  word("w4", "shit", 3000, 3400),
  word("w5", "world", 5000, 5500),
];
const peaks = peaksWithQuiet(20_000, [[2400, 5000]]);

const settingsWithMusic: ProjectSettings = ProjectSettingsSchema.parse({
  composition: {
    version: 1,
    videoSegments: [],
    markers: [],
    audio: {
      tracks: [
        { id: "music-1", name: "Music", role: "music", volume: 1, muted: false, locked: false, ducking: { enabled: false, amountDb: 12, thresholdDb: -42 } },
      ],
      clips: [],
    },
  },
});
const settingsNoMusic: ProjectSettings = ProjectSettingsSchema.parse({});
const settingsTwoSegments: ProjectSettings = ProjectSettingsSchema.parse({
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg1", sourceInMs: 0, sourceOutMs: 10_000 },
      { id: "seg2", sourceInMs: 10_000, sourceOutMs: 20_000 },
    ],
    markers: [],
  },
});

const page = (id: string, ws: Word[]): Page => ({
  id, startMs: ws[0]?.startMs ?? 0, endMs: ws[ws.length - 1]?.endMs ?? 0,
  words: ws, lines: [ws], heroIndex: -1, emotion: "neutral", position: null, styleOverride: null,
});

function compFor(settings: ProjectSettings): EditorComposition {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 20_000 },
    doc: null, pages: [page("p1", words)], settings, durationMs: 20_000,
  };
  return buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs: 20_000 });
}

function stateFor(settings: ProjectSettings = settingsWithMusic): PolishProjectState {
  const look = getLook("hormozi_box")!;
  return { doc: docOf(words), comp: compFor(settings), settings, style: applyLook(look).style, lookId: "hormozi_box" };
}

const planInput = (state: PolishProjectState) => ({
  doc: state.doc, comp: state.comp, settings: state.settings, lookId: state.lookId, peaks, hopMs: HOP,
});

const CTX: AssistantContext = { segmentCount: 2, hasMusicTrack: true, currentLookId: "hormozi_box" };
const badge = { source: "cloud" as const, fellBack: false };

/* ------------------------------------------------------------------ */
/* single source: prompt, parser and list share ASSISTANT_INTENTS      */
/* ------------------------------------------------------------------ */

describe("the intent set is the single source", () => {
  it("has the nine intents, unique ids, each with label/example/manual path", () => {
    expect(ASSISTANT_INTENT_IDS).toHaveLength(9);
    expect(new Set(ASSISTANT_INTENT_IDS).size).toBe(9);
    for (const def of ASSISTANT_INTENTS) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.example.length).toBeGreaterThan(0);
      expect(def.manualPath.length).toBeGreaterThan(0);
      expect(def.promptSpec.length).toBeGreaterThan(0);
    }
  });

  it("the prompt offers exactly the intent-set ids, examples and the look candidates", () => {
    const { system, user } = buildAssistantPrompt("do a thing", CTX);
    expect(system).toContain("ONLY a JSON object");
    for (const def of ASSISTANT_INTENTS) {
      expect(user).toContain(`"${def.id}"`);
      expect(user).toContain(def.example);
      expect(user).toContain(def.promptSpec);
    }
    for (const look of ASSISTANT_LOOK_CANDIDATES) expect(user).toContain(`${look.id} = ${look.name}`);
    expect(user).toContain('{"intent": "unsupported"}');
    expect(user).toContain("Instruction: do a thing");
  });
});

/* ------------------------------------------------------------------ */
/* (1) structured-output fixtures -> commands, for EVERY intent        */
/* ------------------------------------------------------------------ */

describe("parseAssistantOutput — one valid fixture per intent", () => {
  const otherLook = ASSISTANT_LOOK_CANDIDATES.find((l) => l.id !== "hormozi_box")!;
  const cases: Array<[string, AssistantCommand]> = [
    [`{"intent":"apply-caption-look","params":{"lookId":"${otherLook.id}"}}`, { intent: "apply-caption-look", lookId: otherLook.id }],
    ['{"intent":"trim-fillers","params":{}}', { intent: "trim-fillers" }],
    ['{"intent":"remove-silences","params":{"thresholdMs":1000}}', { intent: "remove-silences", thresholdMs: 1000 }],
    ['{"intent":"add-title-card","params":{"title":"My morning routine"}}', { intent: "add-title-card", title: "My morning routine" }],
    ['{"intent":"auto-zooms","params":{"intensity":"strong"}}', { intent: "auto-zooms", intensity: "strong" }],
    ['{"intent":"bleep-profanity","params":{}}', { intent: "bleep-profanity" }],
    ['{"intent":"duck-music","params":{"amountDb":12}}', { intent: "duck-music", amountDb: 12 }],
    ['{"intent":"set-segment-speed","params":{"segmentIndex":2,"rate":1.5}}', { intent: "set-segment-speed", segmentIndex: 2, rate: 1.5 }],
    ['{"intent":"add-transition","params":{"segmentIndex":2,"type":"fade","durationMs":300}}', { intent: "add-transition", segmentIndex: 2, transitionType: "fade", durationMs: 300 }],
  ];
  it.each(cases)("%s", (raw, expected) => {
    expect(parseAssistantOutput(raw, CTX)).toEqual({ kind: "command", command: expected });
  });

  it("a prose-wrapped JSON reply still parses (the strict-parser precedent)", () => {
    const raw = 'Sure! Here is the command:\n{"intent":"trim-fillers","params":{}}\nHope that helps.';
    expect(parseAssistantOutput(raw, CTX)).toEqual({ kind: "command", command: { intent: "trim-fillers" } });
  });
});

/* ------------------------------------------------------------------ */
/* (2) refusal paths: no plan, no state change                         */
/* ------------------------------------------------------------------ */

describe("parseAssistantOutput — refusals", () => {
  it("unsupported and unknown intents refuse honestly, naming the generic manual path", () => {
    for (const raw of ['{"intent":"unsupported"}', '{"intent":"generate-broll","params":{}}', '{"intent":"delete-segment","params":{"segmentIndex":1}}']) {
      const out = parseAssistantOutput(raw, CTX);
      expect(out.kind).toBe("refusal");
      if (out.kind === "refusal") {
        expect(out.refusal.message).toContain("I can't do that one yet");
        expect(out.refusal.manualPath).toContain("Templates (looks)");
      }
    }
    const unsup = parseAssistantOutput('{"intent":"unsupported"}', CTX);
    if (unsup.kind === "refusal") expect(unsup.refusal.reason).toBe("unsupported");
    const unknown = parseAssistantOutput('{"intent":"generate-broll","params":{}}', CTX);
    if (unknown.kind === "refusal") expect(unknown.refusal.reason).toBe("unknown-intent");
  });

  it("malformed replies are malformed, never a command", () => {
    for (const raw of ["", "no json here", '{"intent":}', '{"params":{}}', "[1,2]", "42"]) {
      expect(parseAssistantOutput(raw, CTX).kind, raw).toBe("malformed");
    }
  });

  it("out-of-range / missing params refuse with the intent's own manual path", () => {
    const bad: Array<[string, string]> = [
      ['{"intent":"apply-caption-look","params":{"lookId":"not_a_look"}}', "look"],
      ['{"intent":"apply-caption-look","params":{}}', "look"],
      ['{"intent":"remove-silences","params":{"thresholdMs":100}}', "pause"],
      ['{"intent":"remove-silences","params":{"thresholdMs":99999}}', "pause"],
      ['{"intent":"add-title-card","params":{"title":""}}', "title"],
      [`{"intent":"add-title-card","params":{"title":"${"x".repeat(121)}"}}`, "title"],
      ['{"intent":"auto-zooms","params":{"intensity":"huge"}}', "strength"],
      ['{"intent":"duck-music","params":{"amountDb":30}}', "ducking"],
      ['{"intent":"duck-music","params":{"amountDb":0}}', "ducking"],
      ['{"intent":"set-segment-speed","params":{"segmentIndex":3,"rate":1.5}}', "segment"],
      ['{"intent":"set-segment-speed","params":{"segmentIndex":0,"rate":1.5}}', "segment"],
      ['{"intent":"set-segment-speed","params":{"segmentIndex":2,"rate":5}}', "speed"],
      ['{"intent":"set-segment-speed","params":{"segmentIndex":2,"rate":0.1}}', "speed"],
      ['{"intent":"add-transition","params":{"segmentIndex":1,"type":"fade","durationMs":300}}', "transition"],
      ['{"intent":"add-transition","params":{"segmentIndex":2,"type":"spin","durationMs":300}}', "type"],
      ['{"intent":"add-transition","params":{"segmentIndex":2,"type":"fade","durationMs":50}}', "length"],
    ];
    for (const [raw, fragment] of bad) {
      const out = parseAssistantOutput(raw, CTX);
      expect(out.kind, raw).toBe("refusal");
      if (out.kind === "refusal") {
        expect(out.refusal.reason).toBe("invalid-params");
        expect(out.refusal.message).toContain(fragment);
        expect(out.refusal.message).toContain("nothing was changed");
        expect(out.refusal.manualPath.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("runAssistantTurn — routing with NO template floor", () => {
  const good: ModelRunner = async () => '{"intent":"trim-fillers","params":{}}';
  const junk: ModelRunner = async () => "let me think about that…";
  const boom: ModelRunner = async () => { throw new Error("upstream down"); };

  it("no route configured → unavailable with the stated reason (never a fake plan)", async () => {
    const out = await runAssistantTurn("remove fillers", CTX, { modelEnabled: false });
    expect(out).toEqual({ status: "unavailable", reason: ASSISTANT_NO_ROUTE_REASON });
  });

  it("a cloud command propagates source cloud", async () => {
    const out = await runAssistantTurn("remove fillers", CTX, { runCloud: good, modelEnabled: false });
    expect(out).toEqual({ status: "command", command: { intent: "trim-fillers" }, source: "cloud", fellBack: false });
  });

  it("junk from cloud falls through to the local model, labelled fellBack", async () => {
    const out = await runAssistantTurn("remove fillers", CTX, { runCloud: junk, modelEnabled: true, runModel: good });
    expect(out.status).toBe("command");
    if (out.status === "command") {
      expect(out.source).toBe("model");
      expect(out.fellBack).toBe(true);
      expect(out.note).toContain("local model");
    }
  });

  it("a cloud refusal is definitive — the local model is not consulted to overrule it", async () => {
    const local = vi.fn(good);
    const out = await runAssistantTurn("make a b-roll of ducks", CTX, {
      runCloud: async () => '{"intent":"unsupported"}', modelEnabled: true, runModel: local,
    });
    expect(out.status).toBe("refusal");
    expect(local).not.toHaveBeenCalled();
  });

  it("every route failing unparseably → a malformed refusal, not a plan", async () => {
    const out = await runAssistantTurn("remove fillers", CTX, { runCloud: boom, modelEnabled: true, runModel: junk });
    expect(out.status).toBe("refusal");
    if (out.status === "refusal") expect(out.refusal.reason).toBe("malformed");
  });
});

/* ------------------------------------------------------------------ */
/* (1)+(4) plan mapping per intent; preview ≡ applied identity         */
/* ------------------------------------------------------------------ */

describe("buildAssistantPlan + applyPolishPlan — op mapping for every intent", () => {
  it("trim-fillers: one step with A3's ranges; apply == applyTrimCuts standalone", () => {
    const state = stateFor();
    const { plan, emptyReason } = buildAssistantPlan(planInput(state), { intent: "trim-fillers" }, { badge });
    expect(emptyReason).toBeUndefined();
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0]!;
    expect(step.kind).toBe("trim-fillers");
    expect(step.source).toBe("ai-suggested");
    expect(step.badge).toEqual(badge);
    expect(step.detail).toContain("Remove 1 filler");
    const ranges = step.payload.kind === "trim-fillers" ? step.payload.ranges : [];
    expect(ranges).toEqual([{ startMs: 600, endMs: 900 }]);

    const { state: next, record } = applyPolishPlan(state, plan, plan.steps.map((s) => s.id));
    // (4) identity: the applied record is the previewed plan, step for step
    expect(record.steps.map((s) => ({ kind: s.kind, label: s.label, detail: s.detail })))
      .toEqual(plan.steps.map((s) => ({ kind: s.kind, label: s.label, detail: s.detail })));
    expect(record.before).toBe(state);
    const expected = applyTrimCuts(state.comp, state.doc, ranges);
    const strip = (comp: EditorComposition) => ({ ...comp, videoClips: comp.videoClips.map((c, i) => ({ ...c, id: `clip-${i}` })) });
    expect(strip(next.comp)).toEqual(strip(expected.comp));
    expect(next.doc).toEqual(expected.doc);
    expect(next.doc.words.map((w) => w.text)).not.toContain("um");
  });

  it("remove-silences: pauses at the requested threshold; apply == applyTrimCuts on its ranges", () => {
    const state = stateFor();
    const { plan } = buildAssistantPlan(planInput(state), { intent: "remove-silences", thresholdMs: 1000 }, { badge });
    const step = plan.steps[0]!;
    expect(step.kind).toBe("tighten-silences");
    expect(step.label).toBe("Remove pauses longer than 1.0s");
    if (step.payload.kind === "tighten-silences") expect(step.payload.thresholdMs).toBe(1000);
    const ranges = step.payload.kind === "tighten-silences" ? step.payload.ranges : [];
    expect(ranges.length).toBeGreaterThan(0);
    const { state: next } = applyPolishPlan(state, plan, ["tighten-silences"]);
    const expected = applyTrimCuts(state.comp, state.doc, ranges);
    const strip = (comp: EditorComposition) => ({ ...comp, videoClips: comp.videoClips.map((c, i) => ({ ...c, id: `clip-${i}` })) });
    expect(strip(next.comp)).toEqual(strip(expected.comp));
    expect(next.comp.durationMs).toBeLessThan(state.comp.durationMs);
  });

  it("apply-caption-look: apply == applyLook's merge; already-current look → empty plan", () => {
    const state = stateFor();
    const target = ASSISTANT_LOOK_CANDIDATES.find((l) => l.id !== "hormozi_box")!;
    const { plan } = buildAssistantPlan(planInput(state), { intent: "apply-caption-look", lookId: target.id }, { badge });
    const step = plan.steps[0]!;
    expect(step.kind).toBe("caption-look");
    if (step.payload.kind === "caption-look") expect(step.payload.lookName).toBe(getLook(target.id)!.name);
    const { state: next } = applyPolishPlan(state, plan, ["caption-look"]);
    const applied = applyLook(getLook(target.id)!, state.settings.maxWordsPerCard);
    expect(next.style).toEqual(applied.style);
    expect(next.lookId).toBe(target.id);

    const same = buildAssistantPlan(planInput(state), { intent: "apply-caption-look", lookId: "hormozi_box" }, { badge });
    expect(same.plan.steps).toEqual([]);
    expect(same.emptyReason).toContain("already applied");
  });

  it("add-title-card: the exact user text lands as a title overlay at t=0", () => {
    const state = stateFor();
    const { plan } = buildAssistantPlan(planInput(state), { intent: "add-title-card", title: "My morning routine" }, { badge });
    const step = plan.steps[0]!;
    expect(step.kind).toBe("title-card");
    if (step.payload.kind === "title-card") expect(step.payload.title).toBe("My morning routine");
    const { state: next, record } = applyPolishPlan(state, plan, ["title-card"]);
    const placed = next.comp.overlayClips.find((c) => c.id === record.steps[0]!.artefacts?.titleOverlayId)!;
    expect(placed.overlay.text).toBe("My morning routine");
    expect(placed.startMs).toBe(0);
  });

  it("auto-zooms: apply == generateAutoZoomPlan + applyAutoZooms at the requested intensity", () => {
    const state = stateFor();
    const { plan } = buildAssistantPlan(planInput(state), { intent: "auto-zooms", intensity: "strong" }, { badge });
    const step = plan.steps[0]!;
    expect(step.kind).toBe("auto-zooms");
    const expectedPlan = generateAutoZoomPlan({ words: state.doc.words, clips: state.comp.videoClips, peaks: { peaks, hopMs: HOP }, intensity: "strong" });
    if (step.payload.kind === "auto-zooms") {
      expect(step.payload.intensity).toBe("strong");
      expect(step.payload.plan).toEqual(expectedPlan);
    }
    const { state: next } = applyPolishPlan(state, plan, ["auto-zooms"]);
    const expected = applyAutoZooms(state.comp, expectedPlan);
    const strip = (comp: EditorComposition) => ({
      ...comp,
      videoClips: comp.videoClips.map((c) => ({ ...c, keyframes: (c.keyframes ?? []).map((k) => ({ ...k, id: "kf" })) })),
    });
    expect(strip(next.comp)).toEqual(strip(expected.comp));
  });

  it("bleep-profanity: exactly the listed words become bleeps; apply == addAudioBleeps standalone", () => {
    const state = stateFor();
    const { plan } = buildAssistantPlan(planInput(state), { intent: "bleep-profanity" }, { badge });
    const step = plan.steps[0]!;
    expect(step.kind).toBe("bleep-profanity");
    if (step.payload.kind === "bleep-profanity") {
      expect(step.payload.ranges).toEqual([{ startMs: 3000, endMs: 3400, wordText: "shit" }]);
      expect(step.payload.matchCount).toBe(1);
    }
    const { state: next } = applyPolishPlan(state, plan, ["bleep-profanity"]);
    const expected = addAudioBleeps(state.comp, [{ startMs: 3000, endMs: 3400, wordText: "shit" }]);
    const strip = (comp: EditorComposition) => ({ ...comp, audioBleeps: (comp.audioBleeps ?? []).map((b) => ({ ...b, id: "b" })) });
    expect(strip(next.comp)).toEqual(strip(expected));
    expect(next.comp.audioBleeps).toHaveLength(1);
  });

  it("duck-music: apply == setAudioDucking on the music track; no music track → empty plan", () => {
    const state = stateFor();
    const { plan } = buildAssistantPlan(planInput(state), { intent: "duck-music", amountDb: 12 }, { badge });
    const step = plan.steps[0]!;
    expect(step.kind).toBe("music-ducking");
    if (step.payload.kind === "music-ducking") {
      expect(step.payload.trackId).toBe("music-1");
      expect(step.payload.patch).toEqual({ enabled: true, amountDb: 12 });
    }
    const { state: next } = applyPolishPlan(state, plan, ["music-ducking"]);
    expect(next.comp).toEqual(setAudioDucking(state.comp, "music-1", { enabled: true, amountDb: 12 }));

    const noMusic = buildAssistantPlan(planInput(stateFor(settingsNoMusic)), { intent: "duck-music", amountDb: 12 }, { badge });
    expect(noMusic.plan.steps).toEqual([]);
    expect(noMusic.emptyReason).toContain("no music track");
  });

  it("set-segment-speed: apply == setSegmentPlaybackRate + its doc/content effects, exactly", () => {
    const state = stateFor(settingsTwoSegments);
    expect(state.comp.videoClips.map((c) => c.id)).toEqual(["seg1", "seg2"]);
    const { plan } = buildAssistantPlan(planInput(state), { intent: "set-segment-speed", segmentIndex: 2, rate: 2 }, { badge });
    const step = plan.steps[0]!;
    expect(step.kind).toBe("segment-speed");
    if (step.payload.kind === "segment-speed") {
      expect(step.payload.clipId).toBe("seg2");
      expect(step.payload.rate).toBe(2);
    }
    const { state: next } = applyPolishPlan(state, plan, ["segment-speed"]);
    const r = setSegmentPlaybackRate(state.comp, "seg2", 2);
    const expectedComp = applyContentEffect(r.comp, r.docEffect);
    const expectedDoc = applyDocEffect(state.doc, r.docEffect);
    expect(next.comp).toEqual(expectedComp);
    expect(next.doc).toEqual(expectedDoc);
    // (4) identity: what the step said is what changed — segment 2's rate is the payload's rate
    expect(next.comp.videoClips[1]!.playbackRate).toBe(2);
    expect(next.comp.durationMs).toBe(15_000);
  });

  it("add-transition: apply == setSegmentTransition + its doc/content effects, exactly", () => {
    const state = stateFor(settingsTwoSegments);
    const command: AssistantCommand = { intent: "add-transition", segmentIndex: 2, transitionType: "fade", durationMs: 300 };
    const { plan } = buildAssistantPlan(planInput(state), command, { badge });
    const step = plan.steps[0]!;
    expect(step.kind).toBe("segment-transition");
    if (step.payload.kind === "segment-transition") {
      expect(step.payload.clipId).toBe("seg2");
      expect(step.payload.transition).toEqual({ type: "fade", durationMs: 300 });
    }
    const { state: next } = applyPolishPlan(state, plan, ["segment-transition"]);
    const r = setSegmentTransition(state.comp, "seg2", { type: "fade", durationMs: 300 });
    expect(next.comp).toEqual(applyContentEffect(r.comp, r.docEffect));
    expect(next.doc).toEqual(applyDocEffect(state.doc, r.docEffect));
    expect(next.comp.videoClips[1]!.transitionIn).toEqual({ type: "fade", durationMs: 300 });
  });

  it("nothing-to-do commands yield empty plans with honest reasons — never fake steps", () => {
    const clean = stateFor();
    const cleanDoc = docOf([word("a", "hello", 0, 500), word("b", "world", 1000, 1500)]);
    const noFillers = buildAssistantPlan({ ...planInput(clean), doc: cleanDoc }, { intent: "trim-fillers" }, { badge });
    expect(noFillers.plan.steps).toEqual([]);
    expect(noFillers.emptyReason).toContain("No filler words");
    const noBleep = buildAssistantPlan({ ...planInput(clean), doc: cleanDoc }, { intent: "bleep-profanity" }, { badge });
    expect(noBleep.plan.steps).toEqual([]);
    expect(noBleep.emptyReason).toContain("profanity list");
  });

  it("without a route badge the same steps are labelled automatic (the A2 labelling rule)", () => {
    const state = stateFor();
    const { plan } = buildAssistantPlan(planInput(state), { intent: "trim-fillers" });
    expect(plan.steps[0]!.source).toBe("automatic");
    expect(plan.steps[0]!.badge).toBeUndefined();
  });
});
