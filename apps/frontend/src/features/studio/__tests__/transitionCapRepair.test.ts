import { describe, expect, it } from "vitest";
import { videoTransitionLayout } from "@capseasy/compositions";
import { CaptionDocSchema, ProjectSettingsSchema, type CaptionDoc, type Page, type ProjectSettings, type Word } from "@capseasy/shared";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, isPartition, projectComposition, type EditorComposition } from "../compositionDoc";
import {
  applyDocEffect,
  rippleDeleteVideoSegment,
  setSegmentPlaybackRate,
  setSegmentTransition,
  splitVideoClipAt,
  trimVideoClipEdge,
} from "../compositionOps";

/**
 * CAP-T03 (P0) + CAP-T04 (P1) regressions — the report's vitest repros
 * (TRANSITIONS-INVESTIGATION.md §5) as pinned behaviour:
 *
 * - R2: trimming a transitioned clip's end edge to 100 ms used to keep its
 *   500 ms transitionIn (over-cap); the render then shrank the preceding
 *   sequence and dropped ~0.8 s of the previous clip (R5: sequences
 *   [274, 3, 300], transitions [2, 2] for A 10 000 ms / B 100 ms + 500 ms /
 *   C 10 000 ms + 500 ms @30 fps). The op layer now re-clamps (or clears)
 *   the transition, reports the repair, and shifts downstream content.
 * - R1/CAP-T04: splitting inside the transition overlap zone used to split
 *   the OUTGOING clip, leaving a 400 ms sliver in front of the transitioned
 *   join. The split now resolves to the incoming clip.
 */

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });
const page = (id: string, words: Word[]): Page => ({
  id,
  startMs: words[0]?.startMs ?? 0,
  endMs: words[words.length - 1]?.endMs ?? 0,
  words,
  lines: [words],
  heroIndex: -1,
  emotion: "neutral",
  position: null,
  styleOverride: null,
});
const pages = [page("p1", [word("w1", "hello", 0, 400), word("w2", "there", 450, 900)])];

function viewFor(settings: ProjectSettings, sourceDurationMs: number, viewDurationMs: number) {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 12345, width: 1080, height: 1920, fps: 30, durationMs: sourceDurationMs },
    doc: null,
    pages,
    settings,
    durationMs: viewDurationMs,
  };
  return toComposition(input);
}

/* segmented fixture: 3 × 15 s segments over source 10 s..55 s of a 120 s source;
 * seg-2 carries a fade 500 ms transition in (overlap zone 14 500–15 000). */
const transitionSettings = ProjectSettingsSchema.parse({
  clipRange: { startMs: 10_000, endMs: 55_000 },
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 25_000 },
      { id: "seg-2", sourceInMs: 25_000, sourceOutMs: 40_000, transitionIn: { type: "fade", durationMs: 500 } },
      { id: "seg-3", sourceInMs: 40_000, sourceOutMs: 55_000 },
    ],
    markers: [],
  },
});
const transitionComp = (): EditorComposition =>
  buildEditorComposition({ view: viewFor(transitionSettings, 120_000, 44_500), settings: transitionSettings, sourceDurationMs: 120_000 });

/* short-neighbour fixture: seg-2 is 1500 ms with a fade 500 ms transition in. */
const shortSettings = ProjectSettingsSchema.parse({
  clipRange: { startMs: 10_000, endMs: 41_500 },
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 25_000 },
      { id: "seg-2", sourceInMs: 25_000, sourceOutMs: 26_500, transitionIn: { type: "fade", durationMs: 500 } },
      { id: "seg-3", sourceInMs: 26_500, sourceOutMs: 41_500 },
    ],
    markers: [],
  },
});
const shortComp = (): EditorComposition =>
  buildEditorComposition({ view: viewFor(shortSettings, 120_000, 31_000), settings: shortSettings, sourceDurationMs: 120_000 });

/* delete fixture: seg-3 is 300 ms but carries a fade 500 ms transition in —
 * an over-cap state as stored (buildEditorComposition does not enforce the
 * cap, so a pre-fix project can hold one). Deleting seg-2 re-pairs seg-3
 * with seg-1, and the repair must clamp it to the cap. */
const deleteSettings = ProjectSettingsSchema.parse({
  clipRange: { startMs: 10_000, endMs: 55_300 },
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 25_000 },
      { id: "seg-2", sourceInMs: 25_000, sourceOutMs: 40_000, transitionIn: { type: "fade", durationMs: 500 } },
      { id: "seg-3", sourceInMs: 40_000, sourceOutMs: 40_300, transitionIn: { type: "fade", durationMs: 500 } },
    ],
    markers: [],
  },
});
const deleteComp = (): EditorComposition =>
  buildEditorComposition({ view: viewFor(deleteSettings, 120_000, 29_300), settings: deleteSettings, sourceDurationMs: 120_000 });

/** Every stored transitionIn satisfies the cap rule (the CAP-T03 invariant). */
function assertCapInvariant(comp: EditorComposition) {
  comp.videoClips.forEach((clip, i) => {
    if (i < 1 || !clip.transitionIn) return;
    const cap = Math.min(comp.videoClips[i - 1]!.durationMs, clip.durationMs) - 1;
    expect(clip.transitionIn.durationMs).toBeGreaterThanOrEqual(100);
    expect(clip.transitionIn.durationMs).toBeLessThanOrEqual(cap);
  });
}

describe("CAP-T03 — trim/split/rate can no longer leave an over-cap transition", () => {
  it("R2: trimming a transitioned clip to 100 ms clears its 500 ms transition (was: kept, 2-frame flash + dropped tail)", () => {
    const comp = transitionComp();
    const { comp: out, docEffect, transitionRepairs } = trimVideoClipEdge(comp, "seg-2", "end", 14_600);
    const seg2 = out.videoClips[1]!;
    expect(seg2.durationMs).toBe(100);
    expect(seg2.transitionIn).toBeNull();
    expect(transitionRepairs).toEqual([{ clipId: "seg-2", oldDurationMs: 500, newDurationMs: null }]);
    // the repair shifts content at/after the join (old start 14 500) later by the 500 ms overlap lost
    expect(docEffect).toEqual({ type: "rangeShift", fromMs: 14_500, deltaMs: 500 });
    expect(out.durationMs).toBe(45_000);
    expect(isPartition(out.videoClips)).toBe(true);
    assertCapInvariant(out);
    expect(() => projectComposition(out, transitionSettings)).not.toThrow();
    // R5, repaired: the layout is a plain cut now — no sequence shrinks, no dropped frames
    const layout = videoTransitionLayout(out.videoClips, 30);
    expect(layout.transitions).toEqual([{ durationInFrames: 0 }, { durationInFrames: 0 }]);
    expect(layout.sequences.map((s) => s.durationInFrames)).toEqual([450, 3, 897]);
  });

  it("trimming a neighbour to 300 ms clamps the transition 500 → 299 ms and reports a rangeShift", () => {
    const comp = transitionComp();
    const { comp: out, docEffect, transitionRepairs } = trimVideoClipEdge(comp, "seg-2", "end", 14_800);
    const seg2 = out.videoClips[1]!;
    expect(seg2.durationMs).toBe(300);
    expect(seg2.transitionIn).toEqual({ type: "fade", durationMs: 299 });
    expect(transitionRepairs).toEqual([{ clipId: "seg-2", oldDurationMs: 500, newDurationMs: 299 }]);
    expect(docEffect).toEqual({ type: "rangeShift", fromMs: 14_500, deltaMs: 201 });
    expect(out.durationMs).toBe(44_701);
    assertCapInvariant(out);
    // downstream words follow the shift: a word at the old join start moves 201 ms later
    const doc: CaptionDoc = CaptionDocSchema.parse({
      version: 2,
      words: [word("w1", "before", 1000, 1500), word("w2", "after", 15_000, 15_400)],
    });
    const shifted = applyDocEffect(doc, docEffect);
    expect(shifted.words.map((w) => [w.id, w.startMs])).toEqual([
      ["w1", 1000],
      ["w2", 15_201],
    ]);
  });

  it("a rate change that shrinks a transitioned clip re-clamps its transition (rangeScale + repair shift)", () => {
    const comp = shortComp();
    const { comp: out, docEffect, transitionRepairs } = setSegmentPlaybackRate(comp, "seg-2", 4);
    const seg2 = out.videoClips[1]!;
    expect(seg2.durationMs).toBe(375);
    expect(seg2.transitionIn).toEqual({ type: "fade", durationMs: 374 });
    expect(transitionRepairs).toEqual([{ clipId: "seg-2", oldDurationMs: 500, newDurationMs: 374 }]);
    expect(docEffect).toEqual([
      { type: "rangeScale", startMs: 14_500, oldDurationMs: 1500, newDurationMs: 375 },
      { type: "rangeShift", fromMs: 14_500, deltaMs: 126 },
    ]);
    assertCapInvariant(out);
    expect(isPartition(out.videoClips)).toBe(true);
  });

  it("ripple-deleting a clip re-clamps the next join against its new neighbour (self-heals a stored over-cap state)", () => {
    const comp = deleteComp();
    // as stored, seg-3's 500 ms transition violates the cap (neighbour is 300 ms)
    expect(comp.videoClips[2]!.transitionIn).toEqual({ type: "fade", durationMs: 500 });
    const { comp: out, docEffect, transitionRepairs } = rippleDeleteVideoSegment(comp, "seg-2");
    expect(out.videoClips).toHaveLength(2);
    expect(out.videoClips[1]!.transitionIn).toEqual({ type: "fade", durationMs: 299 });
    expect(transitionRepairs).toEqual([{ clipId: "seg-3", oldDurationMs: 500, newDurationMs: 299 }]);
    // rangeRemove for the deleted clip, then the repair shift in post-remove coordinates
    expect(docEffect).toEqual([
      { type: "rangeRemove", startMs: 14_500, durationMs: 15_000 },
      { type: "rangeShift", fromMs: 14_500, deltaMs: 201 },
    ]);
    assertCapInvariant(out);
    expect(isPartition(out.videoClips)).toBe(true);
  });

  it("setSegmentTransition still clamps at apply time (the invariant's original enforcement)", () => {
    const comp = shortComp();
    const { comp: out } = setSegmentTransition(comp, "seg-2", { type: "fade", durationMs: 2000 });
    expect(out.videoClips[1]!.transitionIn).toEqual({ type: "fade", durationMs: 1499 });
    assertCapInvariant(out);
  });
});

describe("CAP-T04 — split inside the transition overlap splits the incoming clip", () => {
  it("R1: splitting at 14 600 (inside the 14 500–15 000 overlap) cuts seg-2, not seg-1 — no 400 ms sliver", () => {
    const comp = transitionComp();
    const { comp: out, transitionRepairs } = splitVideoClipAt(comp, 14_600);
    expect(out.videoClips).toHaveLength(4);
    // seg-1 is intact: no sliver was carved out of it
    expect(out.videoClips[0]).toMatchObject({ id: "seg-1", durationMs: 15_000, sourceInMs: 10_000, sourceOutMs: 25_000 });
    // the incoming clip split: first half is 100 ms, its 500 ms transition cannot
    // fit a 100 ms neighbour, so the repair clears it (reported, not silent)
    expect(out.videoClips[1]).toMatchObject({ id: "seg-2", durationMs: 100, transitionIn: null });
    expect(out.videoClips[2]).toMatchObject({ durationMs: 14_900, transitionIn: null });
    expect(out.videoClips[2]!.id).not.toBe("seg-2");
    expect(transitionRepairs).toEqual([{ clipId: "seg-2", oldDurationMs: 500, newDurationMs: null }]);
    expect(isPartition(out.videoClips)).toBe(true);
    assertCapInvariant(out);
    expect(() => projectComposition(out, transitionSettings)).not.toThrow();
  });

  it("splitting 20 ms into the incoming clip refuses instead of falling back to the wrong clip", () => {
    const comp = transitionComp();
    const { comp: out } = splitVideoClipAt(comp, 14_520);
    expect(out).toBe(comp);
  });

  it("splitting outside the overlap still splits the containing clip with its transition kept", () => {
    const comp = transitionComp();
    const { comp: out } = splitVideoClipAt(comp, 20_000);
    expect(out.videoClips).toHaveLength(4);
    expect(out.videoClips[1]).toMatchObject({ id: "seg-2", transitionIn: { type: "fade", durationMs: 500 } });
    expect(out.videoClips[2]).toMatchObject({ transitionIn: null });
    assertCapInvariant(out);
  });
});
