/**
 * Delete/Backspace target resolution (owner bug 2026-11-10: "delete nahi ho raha").
 * Pins the priority order StudioPage's keyboard handler and toolbar Delete button share:
 * multi-word selection first, then the selected overlay, then the single selected word —
 * and nothing while blocked (dialog open / captions live).
 */
import { describe, expect, it } from "vitest";
import { resolveDeleteAction } from "../deleteSelection";

const base = { blocked: false, selectedWordIds: [] as string[], selectedOverlayId: null as string | null, selectedId: null as string | null };

describe("resolveDeleteAction", () => {
  it("prefers the multi-word selection over overlay and single word", () => {
    expect(resolveDeleteAction({ ...base, selectedWordIds: ["w1", "w2"], selectedOverlayId: "ov1", selectedId: "w9" }))
      .toEqual({ kind: "words", ids: ["w1", "w2"] });
  });

  it("falls back to the selected overlay", () => {
    expect(resolveDeleteAction({ ...base, selectedOverlayId: "ov1", selectedId: "w9" }))
      .toEqual({ kind: "overlay", id: "ov1" });
  });

  it("falls back to the single selected word", () => {
    expect(resolveDeleteAction({ ...base, selectedId: "w9" })).toEqual({ kind: "word", id: "w9" });
  });

  it("returns null when nothing is selected", () => {
    expect(resolveDeleteAction(base)).toBeNull();
  });

  it("returns null while blocked, whatever is selected", () => {
    expect(resolveDeleteAction({ ...base, blocked: true, selectedWordIds: ["w1"], selectedOverlayId: "ov1", selectedId: "w9" })).toBeNull();
  });

  it("accepts any iterable of word ids (the live selection is a Set)", () => {
    expect(resolveDeleteAction({ ...base, selectedWordIds: new Set(["a", "b"]) }))
      .toEqual({ kind: "words", ids: ["a", "b"] });
  });

  it("prefers words and overlay over a video segment and a marker", () => {
    const extra = { selectedVideoClipId: "seg1", canRippleDeleteVideoSegment: true, selectedMarkerId: "m1" };
    expect(resolveDeleteAction({ ...base, ...extra, selectedWordIds: ["w1"], selectedOverlayId: "ov1", selectedId: "w9" }))
      .toEqual({ kind: "words", ids: ["w1"] });
    expect(resolveDeleteAction({ ...base, ...extra, selectedOverlayId: "ov1", selectedId: "w9" }))
      .toEqual({ kind: "overlay", id: "ov1" });
  });

  it("ripple-deletes a selected video segment when it can ripple, ahead of marker and word", () => {
    expect(resolveDeleteAction({ ...base, selectedVideoClipId: "seg1", canRippleDeleteVideoSegment: true, selectedMarkerId: "m1", selectedId: "w9" }))
      .toEqual({ kind: "videoSegment", id: "seg1" });
  });

  it("does nothing for a selected video segment that cannot ripple (the only segment)", () => {
    expect(resolveDeleteAction({ ...base, selectedVideoClipId: "seg1", canRippleDeleteVideoSegment: false, selectedMarkerId: "m1", selectedId: "w9" }))
      .toBeNull();
    expect(resolveDeleteAction({ ...base, selectedVideoClipId: "seg1", selectedId: "w9" })).toBeNull();
  });

  it("deletes a selected audio clip ahead of a marker and a word (Run 3)", () => {
    expect(resolveDeleteAction({ ...base, selectedAudioClipId: "ac1", selectedMarkerId: "m1", selectedId: "w9" }))
      .toEqual({ kind: "audioClip", id: "ac1" });
    expect(resolveDeleteAction({ ...base, selectedAudioClipId: "ac1" })).toEqual({ kind: "audioClip", id: "ac1" });
  });

  it("video segment still outranks an audio clip, and words/overlay outrank both", () => {
    const extra = { selectedVideoClipId: "seg1", canRippleDeleteVideoSegment: true, selectedAudioClipId: "ac1", selectedMarkerId: "m1" };
    expect(resolveDeleteAction({ ...base, ...extra })).toEqual({ kind: "videoSegment", id: "seg1" });
    expect(resolveDeleteAction({ ...base, ...extra, selectedOverlayId: "ov1" })).toEqual({ kind: "overlay", id: "ov1" });
    expect(resolveDeleteAction({ ...base, ...extra, selectedWordIds: ["w1"] })).toEqual({ kind: "words", ids: ["w1"] });
  });

  it("deletes a selected marker ahead of the single selected word", () => {
    expect(resolveDeleteAction({ ...base, selectedMarkerId: "m1", selectedId: "w9" }))
      .toEqual({ kind: "marker", id: "m1" });
    expect(resolveDeleteAction({ ...base, selectedMarkerId: "m1" })).toEqual({ kind: "marker", id: "m1" });
  });
});
