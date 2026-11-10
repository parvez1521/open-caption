import { describe, expect, it, vi } from "vitest";
import { OverlayItemSchema, ProjectSettingsSchema, type CaptionDoc, type ProjectSettings } from "@capseasy/shared";
import type { ModelRunner } from "../../create/service";
import { sourceBadge } from "../../create/model";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, projectComposition } from "../compositionDoc";
import { deleteOverlayClip } from "../compositionOps";
import { appendTitleCardClip, generateTitleCardTitle, makeTitleCardOverlay, transcriptTextOf } from "../titleCard";

/**
 * A5 (editor half) — auto title card: the title is generated from the project's
 * transcript through the Phase-3 routing (reusing clipTitle's core, fake runners
 * at the service boundary), its source propagates for badging, and placement is
 * a NORMAL text overlay at the project start — appended via the composition,
 * projected into settings.overlays, and removed by the ordinary overlay delete
 * (the op-level stand-in for the one-step undo the StudioPage commit gives it).
 */

const transcript = "nobody tells you this about morning routines and it changes everything about your day";
const input = { sourceTitle: "My long podcast", transcriptText: transcript, durationMs: 60_000 };
const goodHook: ModelRunner = async () => "The morning routine nobody films";

describe("transcriptTextOf", () => {
  it("joins visible words in order and skips hidden ones", () => {
    const doc = {
      words: [
        { id: "1", text: "hello", startMs: 0, endMs: 100 },
        { id: "2", text: "um", startMs: 100, endMs: 200, hidden: true },
        { id: "3", text: "world", startMs: 200, endMs: 300 },
      ],
    } as Pick<CaptionDoc, "words">;
    expect(transcriptTextOf(doc)).toBe("hello world");
  });
});

describe("generateTitleCardTitle — routing, mocked at the service boundary", () => {
  it("a cloud title propagates source 'cloud' (badged as free AI)", async () => {
    const out = await generateTitleCardTitle(input, { runCloud: goodHook, modelEnabled: false });
    expect(out.title).toBe("The morning routine nobody films");
    expect(out.source).toBe("cloud");
    expect(sourceBadge(out.source)).toContain("Free AI");
  });

  it("uses the local model when there is no cloud and it is enabled", async () => {
    const out = await generateTitleCardTitle(input, { modelEnabled: true, runModel: goodHook });
    expect(out.source).toBe("model");
    expect(out.title).toBe("The morning routine nobody films");
  });

  it("prefers cloud over local, like every Phase-3 generator", async () => {
    const runModel = vi.fn(goodHook);
    const out = await generateTitleCardTitle(input, { runCloud: goodHook, modelEnabled: true, runModel });
    expect(out.source).toBe("cloud");
    expect(runModel).not.toHaveBeenCalled();
  });

  it("with no runners the title is the template engine's — and is labelled template", async () => {
    const out = await generateTitleCardTitle(input, { modelEnabled: false });
    expect(out.source).toBe("template");
    expect(sourceBadge(out.source)).toBe("Template engine");
    expect(out.title.toLowerCase()).toContain("morning routines");
  });

  it("a failed cloud falls back LABELLED as template with a note", async () => {
    const down: ModelRunner = async () => { throw new Error("429"); };
    const out = await generateTitleCardTitle(input, { runCloud: down, modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("free AI service was not available");
  });
});

describe("makeTitleCardOverlay + placement", () => {
  it("builds a normal schema-valid text overlay at the project start", () => {
    const item = makeTitleCardOverlay("The morning routine nobody films", 60_000);
    expect(() => OverlayItemSchema.parse(item)).not.toThrow();
    expect(item.kind).toBe("text");
    expect(item.text).toBe("The morning routine nobody films");
    expect(item.startMs).toBe(0);
    expect(item.endMs).toBe(3000); // the overlay factory's standard window
    expect(item.fontSize).toBe(84); // the only title treatment over the factory defaults
  });

  it("clamps the window to a short project's duration, via the factory", () => {
    const item = makeTitleCardOverlay("Short one", 2000);
    expect(item.endMs).toBe(2000);
  });

  const baseSettings: ProjectSettings = ProjectSettingsSchema.parse({});
  function compFor() {
    const ci: CompositionInput = {
      media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 60_000 },
      doc: null, pages: [], settings: baseSettings, durationMs: 60_000,
    };
    return buildEditorComposition({ view: toComposition(ci), settings: baseSettings, sourceDurationMs: 60_000 });
  }

  it("appends as a normal overlay clip, projects into settings.overlays, and the ordinary delete removes it (undo's op-level shape)", () => {
    const comp = compFor();
    const item = makeTitleCardOverlay("A real title", 60_000);
    const withCard = appendTitleCardClip(comp, item);
    expect(withCard).not.toBe(comp);
    expect(comp.overlayClips).toHaveLength(0); // input untouched

    const projected = projectComposition(withCard, baseSettings);
    expect(projected.overlays).toEqual([item]);

    const removed = deleteOverlayClip(withCard, item.id);
    expect(projectComposition(removed, baseSettings).overlays).toEqual([]);
    expect(projectComposition(removed, baseSettings)).toEqual(projectComposition(comp, baseSettings));
  });
});
