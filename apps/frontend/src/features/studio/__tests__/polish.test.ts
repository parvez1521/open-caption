import { describe, expect, it } from "vitest";
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
import { applyTrimCuts } from "../trim";
import { applyAutoZooms, generateAutoZoomPlan } from "../autoZooms";
import { setAudioDucking } from "../audioOps";
import { makeTitleCardOverlay } from "../titleCard";
import type { ModelRunner } from "../../create/service";
import {
  POLISH_SILENCE_THRESHOLD_MS,
  applyPolishPlan,
  buildPolishPlan,
  defaultPolishLookCandidates,
  parsePolishChoices,
  polishCommitSettings,
  resolvePolishAiChoices,
  revertAllPolish,
  revertPolishStep,
  type PolishProjectState,
} from "../polish";

/**
 * A2 — One-click Polish: a plan composed from the existing features (A3
 * trims, A4 zooms, A5 title, look pick, 4.8 ducking), honestly labelled
 * (AI only where a real route chose), applied as one threaded state, with
 * per-step revert whose revert-all is bit-identical to the original.
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

/* fixture timeline (20 s):
 * hello [0,500] · um [600,900] (filler) · amazing [2000,2400] (hero → zoom)
 * … 2.6 s silent gap … world [5000,5500] · done [6000,6400]            */
const words: Word[] = [
  word("w1", "hello", 0, 500),
  word("w2", "um", 600, 900),
  word("w3", "amazing", 2000, 2400, { emphasis: "hero" }),
  word("w4", "world", 5000, 5500),
  word("w5", "done", 6000, 6400),
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
    media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 20_000 },
    doc: null, pages: [page("p1", words)], settings, durationMs: 20_000,
  };
  return buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs: 20_000 });
}

function stateFor(settings: ProjectSettings = settingsWithMusic): PolishProjectState {
  const look = getLook("hormozi_box")!;
  return {
    doc: docOf(words),
    comp: compFor(settings),
    settings,
    style: applyLook(look).style,
    lookId: "hormozi_box",
  };
}

const planInput = (state: PolishProjectState) => ({
  doc: state.doc, comp: state.comp, settings: state.settings, lookId: state.lookId, peaks, hopMs: HOP,
});

const titleCloud = { title: "The thing nobody tells you", source: "cloud" as const, fellBack: false };
const titleTemplate = { title: "A plain template title", source: "template" as const, fellBack: false };

describe("buildPolishPlan — step presence under project conditions", () => {
  it("a full project yields all six steps, in display order", () => {
    const plan = buildPolishPlan(planInput(stateFor()), { titleResult: titleCloud });
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "trim-fillers", "tighten-silences", "auto-zooms", "caption-look", "title-card", "music-ducking",
    ]);
    const fillers = plan.steps.find((s) => s.kind === "trim-fillers")!;
    expect(fillers.detail).toBe("Remove 1 filler (0.3s)");
    const silences = plan.steps.find((s) => s.kind === "tighten-silences")!;
    // A3 only removes: the label must say pauses are REMOVED above the higher threshold
    expect(POLISH_SILENCE_THRESHOLD_MS).toBe(1200);
    expect(silences.label).toBe("Remove pauses longer than 1.2s");
    expect(silences.detail).toContain("removed, not shortened");
  });

  it("no music track → no ducking step (never a fake no-op step)", () => {
    const plan = buildPolishPlan(planInput(stateFor(settingsNoMusic)), { titleResult: titleCloud });
    expect(plan.steps.map((s) => s.kind)).not.toContain("music-ducking");
  });

  it("music already ducked at full strength → no ducking step; music without any voice/main → none either", () => {
    const ducked = ProjectSettingsSchema.parse({
      composition: { version: 1, videoSegments: [], markers: [], audio: { tracks: [
        { id: "m", name: "Music", role: "music", ducking: { enabled: true, amountDb: 12, thresholdDb: -42 } },
      ], clips: [] } },
    });
    expect(buildPolishPlan(planInput(stateFor(ducked)), {}).steps.map((s) => s.kind)).not.toContain("music-ducking");

    const state = stateFor();
    const noMain: PolishProjectState = { ...state, comp: { ...state.comp, videoClips: [], audioTracks: state.comp.audioTracks.filter((t) => t.role === "music") } };
    expect(buildPolishPlan({ ...planInput(state), comp: noMain.comp }, {}).steps.map((s) => s.kind)).not.toContain("music-ducking");
  });

  it("no fillers → filler step absent; a 900 ms pause earns no silence step at the polish threshold", () => {
    const clean = docOf([word("a", "hello", 0, 500), word("b", "world", 1400, 1900), word("c", "again", 3000, 3400, { emphasis: "hero" })]);
    const cleanPeaks = peaksWithQuiet(20_000, [[500, 1400]]);
    const plan = buildPolishPlan(
      { doc: clean, comp: compFor(settingsNoMusic), settings: settingsNoMusic, lookId: "hormozi_box", peaks: cleanPeaks, hopMs: HOP },
      {},
    );
    expect(plan.steps.map((s) => s.kind)).not.toContain("trim-fillers");
    expect(plan.steps.map((s) => s.kind)).not.toContain("tighten-silences");
    // …but the zoom signal and the look still earn their steps
    expect(plan.steps.map((s) => s.kind)).toContain("auto-zooms");
    expect(plan.steps.map((s) => s.kind)).toContain("caption-look");
  });

  it("no title result → no title step; the current look is never re-proposed", () => {
    const plan = buildPolishPlan(planInput(stateFor()), {});
    expect(plan.steps.map((s) => s.kind)).not.toContain("title-card");
    const lookStep = plan.steps.find((s) => s.kind === "caption-look")!;
    if (lookStep.payload.kind === "caption-look") expect(lookStep.payload.lookId).not.toBe("hormozi_box");
  });
});

describe("buildPolishPlan — honest AI labelling", () => {
  it("a real route's choices make look + zooms ai-suggested with badge data; trims stay automatic", () => {
    const candidates = defaultPolishLookCandidates().filter((id) => id !== "hormozi_box");
    const plan = buildPolishPlan(planInput(stateFor()), {
      titleResult: titleCloud,
      aiChoices: { lookId: candidates[1], intensity: "strong", source: "cloud", fellBack: false },
    });
    const look = plan.steps.find((s) => s.kind === "caption-look")!;
    expect(look.source).toBe("ai-suggested");
    expect(look.badge).toEqual({ source: "cloud", fellBack: false });
    if (look.payload.kind === "caption-look") expect(look.payload.lookId).toBe(candidates[1]);
    const zooms = plan.steps.find((s) => s.kind === "auto-zooms")!;
    expect(zooms.source).toBe("ai-suggested");
    expect(zooms.detail).toContain("at strong");
    const title = plan.steps.find((s) => s.kind === "title-card")!;
    expect(title.source).toBe("ai-suggested");
    expect(title.badge?.source).toBe("cloud");
    for (const kind of ["trim-fillers", "tighten-silences", "music-ducking"] as const) {
      const step = plan.steps.find((s) => s.kind === kind)!;
      expect(step.source, kind).toBe("automatic");
      expect(step.badge, kind).toBeUndefined();
    }
  });

  it("no AI answer → deterministic defaults, labelled automatic (first candidate look, medium zooms)", () => {
    const plan = buildPolishPlan(planInput(stateFor()), { titleResult: titleTemplate });
    const look = plan.steps.find((s) => s.kind === "caption-look")!;
    expect(look.source).toBe("automatic");
    expect(look.badge).toBeUndefined();
    if (look.payload.kind === "caption-look") {
      expect(look.payload.lookId).toBe(defaultPolishLookCandidates().filter((id) => id !== "hormozi_box")[0]);
    }
    const zooms = plan.steps.find((s) => s.kind === "auto-zooms")!;
    expect(zooms.source).toBe("automatic");
    expect(zooms.detail).toContain("at medium");
    // a template-written title is automatic too — but its badge still says template, honestly
    const title = plan.steps.find((s) => s.kind === "title-card")!;
    expect(title.source).toBe("automatic");
    expect(title.badge).toEqual({ source: "template", fellBack: false });
  });

  it("an AI pick outside the candidate set is ignored, not honoured", () => {
    const plan = buildPolishPlan(planInput(stateFor()), {
      aiChoices: { lookId: "hormozi_box", intensity: "strong", source: "model", fellBack: false },
    });
    const look = plan.steps.find((s) => s.kind === "caption-look")!;
    expect(look.source).toBe("automatic"); // the look fell back to the default…
    const zooms = plan.steps.find((s) => s.kind === "auto-zooms")!;
    expect(zooms.source).toBe("ai-suggested"); // …while the valid intensity pick still counts
    expect(zooms.badge?.source).toBe("model");
  });
});

describe("resolvePolishAiChoices — routing, no template floor", () => {
  const candidates = defaultPolishLookCandidates();
  const good: ModelRunner = async () => JSON.stringify({ lookId: candidates[1], intensity: "subtle" });

  it("a cloud answer propagates source cloud and its picks", async () => {
    const out = await resolvePolishAiChoices({ transcriptText: "hello world", lookCandidateIds: candidates }, { runCloud: good, modelEnabled: false });
    expect(out).toEqual({ lookId: candidates[1], intensity: "subtle", source: "cloud", fellBack: false });
  });

  it("garbage from cloud falls through to the local model, labelled fellBack", async () => {
    const junk: ModelRunner = async () => "no json here";
    const out = await resolvePolishAiChoices(
      { transcriptText: "hello", lookCandidateIds: candidates },
      { runCloud: junk, modelEnabled: true, runModel: good },
    );
    expect(out?.source).toBe("model");
    expect(out?.fellBack).toBe(true);
  });

  it("no route at all → null (the plan will use defaults, labelled automatic)", async () => {
    expect(await resolvePolishAiChoices({ transcriptText: "x", lookCandidateIds: candidates }, { modelEnabled: false })).toBeNull();
  });

  it("parsePolishChoices validates strictly against the candidates", () => {
    expect(parsePolishChoices('{"lookId":"nope","intensity":"huge"}', candidates)).toBeNull();
    expect(parsePolishChoices('{"intensity":"strong"}', candidates)).toEqual({ intensity: "strong" });
    expect(parsePolishChoices("not json", candidates)).toBeNull();
  });
});

describe("applyPolishPlan — artefacts equal the standalone features'", () => {
  it("fillers only == applyTrimCuts on the same fixture", () => {
    const state = stateFor();
    const plan = buildPolishPlan(planInput(state), { titleResult: titleCloud });
    const fillerStep = plan.steps.find((s) => s.kind === "trim-fillers")!;
    const ranges = fillerStep.payload.kind === "trim-fillers" ? fillerStep.payload.ranges : [];
    const expected = applyTrimCuts(state.comp, state.doc, ranges);
    const { state: next, record } = applyPolishPlan(state, plan, ["trim-fillers"]);
    // identical except the split clip's freshly minted id (newId per call, by design)
    const stripClipIds = (comp: EditorComposition) => ({
      ...comp,
      videoClips: comp.videoClips.map((c, i) => ({ ...c, id: `clip-${i}` })),
    });
    expect(stripClipIds(next.comp)).toEqual(stripClipIds(expected.comp));
    expect(next.doc).toEqual(expected.doc);
    expect(record.steps).toHaveLength(1);
  });

  it("zooms only == generateAutoZoomPlan + applyAutoZooms on the same fixture", () => {
    const state = stateFor();
    const plan = buildPolishPlan(planInput(state), {});
    const zoomStep = plan.steps.find((s) => s.kind === "auto-zooms")!;
    const expectedPlan = generateAutoZoomPlan({ words: state.doc.words, clips: state.comp.videoClips, peaks: { peaks, hopMs: HOP }, intensity: "medium" });
    if (zoomStep.payload.kind === "auto-zooms") expect(zoomStep.payload.plan).toEqual(expectedPlan);
    const expected = applyAutoZooms(state.comp, expectedPlan);
    const { state: next } = applyPolishPlan(state, plan, ["auto-zooms"]);
    // identical except the keyframes' freshly minted ids (the op layer mints per call)
    const stripKfIds = (comp: EditorComposition) => ({
      ...comp,
      videoClips: comp.videoClips.map((c) => ({ ...c, keyframes: (c.keyframes ?? []).map((k) => ({ ...k, id: "kf" })) })),
    });
    expect(stripKfIds(next.comp)).toEqual(stripKfIds(expected.comp));
    expect(next.comp.videoClips.flatMap((c) => c.keyframes ?? []).length).toBeGreaterThan(0);
  });

  it("look only == applyLook through the chooseLook merge; ducking only == setAudioDucking", () => {
    const state = stateFor();
    const plan = buildPolishPlan(planInput(state), {});
    const lookStep = plan.steps.find((s) => s.kind === "caption-look")!;
    const lookId = lookStep.payload.kind === "caption-look" ? lookStep.payload.lookId : "";
    const applied = applyLook(getLook(lookId)!, state.settings.maxWordsPerCard);
    const { state: looked } = applyPolishPlan(state, plan, ["caption-look"]);
    expect(looked.style).toEqual(applied.style);
    expect(looked.lookId).toBe(lookId);
    expect(looked.settings).toEqual(ProjectSettingsSchema.parse({ ...state.settings, ...applied.settings }));

    const duckStep = plan.steps.find((s) => s.kind === "music-ducking")!;
    const expectedDuck = setAudioDucking(state.comp, "music-1", { enabled: true, amountDb: 12 });
    const { state: ducked } = applyPolishPlan(state, plan, ["music-ducking"]);
    expect(duckStep.payload.kind).toBe("music-ducking");
    expect(ducked.comp).toEqual(expectedDuck);
  });

  it("title only == makeTitleCardOverlay placed at the start (same fields, fresh id)", () => {
    const state = stateFor();
    const plan = buildPolishPlan(planInput(state), { titleResult: titleCloud });
    const { state: next, record } = applyPolishPlan(state, plan, ["title-card"]);
    expect(next.comp.overlayClips).toHaveLength(state.comp.overlayClips.length + 1);
    const placed = next.comp.overlayClips.find((c) => c.id === record.steps[0]!.artefacts?.titleOverlayId)!;
    const factory = makeTitleCardOverlay(titleCloud.title, state.comp.durationMs);
    expect(placed.overlay).toMatchObject({
      kind: factory.kind, text: factory.text, fontSize: factory.fontSize,
      startMs: factory.startMs, endMs: factory.endMs,
    });
    expect(polishCommitSettings(next).overlays).toHaveLength(1);
  });

  it("unchecked steps change nothing; checking nothing returns the input by reference", () => {
    const state = stateFor();
    const plan = buildPolishPlan(planInput(state), { titleResult: titleCloud });
    const { state: next, record } = applyPolishPlan(state, plan, []);
    expect(next).toBe(state);
    expect(record.steps).toEqual([]);
    const only = applyPolishPlan(state, plan, ["music-ducking"]);
    expect(only.state.doc).toBe(state.doc);
    expect(only.state.comp.videoClips).toEqual(state.comp.videoClips);
  });

  it("the full pass threads: cuts shorten the project, zooms survive the cuts, title sits at t=0", () => {
    const state = stateFor();
    const plan = buildPolishPlan(planInput(state), { titleResult: titleCloud });
    const { state: next, record } = applyPolishPlan(state, plan, plan.steps.map((s) => s.id));
    expect(record.steps.map((s) => s.kind)).toEqual([
      "caption-look", "auto-zooms", "trim-fillers", "tighten-silences", "title-card", "music-ducking",
    ]);
    expect(next.comp.durationMs).toBeLessThan(state.comp.durationMs);
    expect(next.comp.videoClips.some((c) => (c.keyframes ?? []).length > 0)).toBe(true);
    expect(next.comp.overlayClips[0]!.startMs).toBe(0);
    expect(next.doc.words.map((w) => w.text)).not.toContain("um");
    expect(polishCommitSettings(next)).toBeTruthy();
  });
});

describe("per-step revert — the invariant", () => {
  function applied() {
    const original = stateFor();
    const plan = buildPolishPlan(planInput(original), { titleResult: titleCloud });
    const out = applyPolishPlan(original, plan, plan.steps.map((s) => s.id));
    return { state: original, plan, record: out.record, appliedState: out.state };
  }

  it("reverting the ducking step restores its scope exactly and leaves the other steps' artefacts intact", () => {
    const { state, record } = applied();
    const { state: reverted, record: rec2 } = revertPolishStep(record, "music-ducking");
    expect(reverted.comp.audioTracks).toEqual(state.comp.audioTracks);
    expect(reverted.comp.overlayClips).toEqual(record.current.comp.overlayClips); // title still there
    expect(reverted.comp.videoClips.some((c) => (c.keyframes ?? []).length > 0)).toBe(true); // zooms still there
    expect(rec2.steps.find((s) => s.stepId === "music-ducking")!.reverted).toBe(true);
    // a second revert of the same step is a no-op
    expect(revertPolishStep(rec2, "music-ducking").state).toBe(reverted);
  });

  it("reverting the title step removes exactly the title card", () => {
    const { record } = applied();
    const { state: reverted } = revertPolishStep(record, "title-card");
    expect(reverted.comp.overlayClips).toEqual(record.steps.find((s) => s.kind === "title-card")!.before.comp.overlayClips);
  });

  it("reverting the look step restores style, settings and lookId exactly", () => {
    const { state, record } = applied();
    const { state: reverted } = revertPolishStep(record, "caption-look");
    expect(reverted.style).toBe(state.style);
    expect(reverted.settings).toBe(state.settings);
    expect(reverted.lookId).toBe(state.lookId);
  });

  it("reverting a trim step restores the shared trim scope (documented: both cuts)", () => {
    const { state, record } = applied();
    const { state: reverted } = revertPolishStep(record, "trim-fillers");
    expect(reverted.doc).toBe(state.doc);
    expect(reverted.comp.durationMs).toBe(state.comp.durationMs);
  });

  it("revert-all returns the pre-Polish state bit-for-bit (deep-equal state + identical commit settings)", () => {
    const { state, record } = applied();
    const { state: reverted, record: rec2 } = revertAllPolish(record);
    expect(reverted).toEqual(state);
    expect(reverted.doc).toBe(state.doc);
    expect(polishCommitSettings(reverted)).toEqual(polishCommitSettings(state));
    expect(rec2.steps.every((s) => s.reverted)).toBe(true);
  });

  it("a zooms-only apply reverts to the untouched composition exactly", () => {
    const state = stateFor();
    const plan = buildPolishPlan(planInput(state), {});
    const { record } = applyPolishPlan(state, plan, ["auto-zooms"]);
    const { state: reverted } = revertAllPolish(record);
    expect(reverted.comp).toEqual(state.comp);
    expect(reverted.comp.videoClips.every((c) => (c.keyframes ?? []).length === 0)).toBe(true);
  });
});
