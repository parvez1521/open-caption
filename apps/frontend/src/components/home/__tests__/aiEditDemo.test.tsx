import { describe, expect, it } from "vitest";
import { CaptionDocSchema, type ProjectSettings } from "@capseasy/shared";
import { getLook } from "@capseasy/templates";
import { aiEditStyle } from "@/features/studio/aiEdit";
import { lookFor } from "../../spatial/ShowcaseKit";
import { buildDemoAfter, demoPlanAt, demoSteps, DEMO_HOOK_TEXT, DEMO_KEY_WORD } from "../AiEditDemo";

/**
 * The homepage AI Edit demonstration's model: the narrated plan must match the
 * state the real renderer is fed — the Punchy style's real look, the key word
 * really emphasised in the doc, the hook really an overlay, the zoom really
 * segment keyframes. If the copy and the render ever drift apart, these fail.
 */

const doc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w1", text: "So", startMs: 150, endMs: 260 },
    { id: "w2", text: "we", startMs: 260, endMs: 370 },
    { id: "w3", text: "welcome", startMs: 370, endMs: 750 },
    { id: "w4", text: "people", startMs: 750, endMs: 1080 },
    { id: "w5", text: "from", startMs: 1080, endMs: 1300 },
    { id: "w6", text: "all", startMs: 1300, endMs: 1460 },
    { id: "w7", text: "over", startMs: 1460, endMs: 1680 },
    { id: "w8", text: "the", startMs: 1680, endMs: 1840 },
    { id: "w9", text: "world", startMs: 1840, endMs: 2150 },
    { id: "w10", text: "to", startMs: 2150, endMs: 2480 },
  ],
});

describe("demoSteps — the narrated plan", () => {
  it("lists exactly the four effects, in the panel's own phrasing", () => {
    const steps = demoSteps();
    expect(steps.map((s) => s.label)).toEqual(["Caption look", "Emphasise key words", "Auto punch-in zooms", "Hook text"]);
    const punchy = aiEditStyle("punchy")!;
    expect(steps[0]!.detail).toBe(`Apply the “${getLook(punchy.lookId)!.name}” caption look`);
    expect(steps[1]!.detail).toBe(`Emphasise 1 word: “${DEMO_KEY_WORD}”`);
    expect(steps[2]!.detail).toBe("1 zoom at strong");
    expect(steps[3]!.detail).toBe(`Show “${DEMO_HOOK_TEXT}” at the start`);
  });
});

describe("demoPlanAt — the staged build-up", () => {
  it("nothing is picked or planned at the start", () => {
    expect(demoPlanAt(0)).toEqual({ stylePicked: false, stepsShown: 0 });
  });
  it("the style picks before the first step lands", () => {
    expect(demoPlanAt(900).stylePicked).toBe(true);
    expect(demoPlanAt(1499).stepsShown).toBe(0);
    expect(demoPlanAt(1500).stepsShown).toBe(1);
  });
  it("the whole plan is on screen by the last step's beat", () => {
    expect(demoPlanAt(3150).stepsShown).toBe(4);
    expect(demoPlanAt(6500).stepsShown).toBe(4);
  });
});

describe("buildDemoAfter — the edited state the renderer is fed", () => {
  it("hero-emphasises exactly the key word and leaves the rest of the doc alone", () => {
    const { doc: after } = buildDemoAfter(doc, 6500);
    const changed = after.words.filter((w, i) => w !== doc.words[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]!.text).toBe(DEMO_KEY_WORD);
    expect(changed[0]!.emphasis).toBe("hero");
  });
  it("carries the hook as a text overlay at the start", () => {
    const { settings } = buildDemoAfter(doc, 6500);
    expect(settings.overlays).toHaveLength(1);
    const hook = settings.overlays[0]!;
    expect(hook.kind).toBe("text");
    expect(hook.text).toBe(DEMO_HOOK_TEXT);
    expect(hook.startMs).toBe(0);
  });
  it("carries the punch-in as scale keyframes on one full-length segment", () => {
    const { settings } = buildDemoAfter(doc, 6500);
    const segs = settings.composition.videoSegments;
    expect(segs).toHaveLength(1);
    expect(segs[0]!.sourceInMs).toBe(0);
    expect(segs[0]!.sourceOutMs).toBe(6500);
    const scales = (segs[0]!.keyframes ?? []).filter((k) => k.property === "scale").map((k) => k.value);
    expect(scales).toEqual([1, 1.22, 1.22, 1]);
  });
  it("builds on the Punchy look's own settings (only overlays + composition change)", () => {
    const { settings } = buildDemoAfter(doc, 6500);
    const base = lookFor(aiEditStyle("punchy")!.lookId).settings;
    const strip = (s: ProjectSettings) => {
      const c = { ...s } as Record<string, unknown>;
      delete c.overlays;
      delete c.composition;
      return c;
    };
    expect(strip(settings)).toEqual(strip(base));
  });
});
