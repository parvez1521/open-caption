import { describe, expect, it, vi } from "vitest";
import type { ModelRunner } from "../create/service";
import { sourceBadge } from "../create/model";
import { clipTitleFromGenerated, generateClipTitle } from "./clipTitle";

/**
 * Slice 5.4 title routing: titles are generated through the Phase-3 service with
 * fake runners at its boundary (the service.test.ts pattern — no network, no
 * model), and the SOURCE of the batch must propagate to the clip title so the
 * creation UI can badge it honestly.
 */
const input = {
  sourceTitle: "My long podcast",
  segmentText: "nobody tells you this about morning routines and it changes everything",
  startMs: 32_000,
  endMs: 65_000,
};

const goodHook: ModelRunner = async () => "The morning routine nobody films";

describe("generateClipTitle — routing through generateContent", () => {
  it("a cloud title propagates source 'cloud' (badged as free AI, never as template)", async () => {
    const out = await generateClipTitle(input, { runCloud: goodHook, modelEnabled: false });
    expect(out.title).toBe("The morning routine nobody films");
    expect(out.source).toBe("cloud");
    expect(out.fellBack).toBe(false);
    expect(sourceBadge(out.source)).toContain("Free AI");
  });

  it("prefers the cloud over the local model, like every Phase-3 generator", async () => {
    const runModel = vi.fn(goodHook);
    const out = await generateClipTitle(input, { runCloud: goodHook, modelEnabled: true, runModel });
    expect(out.source).toBe("cloud");
    expect(runModel).not.toHaveBeenCalled();
  });

  it("uses the local model when there is no cloud and it is enabled", async () => {
    const out = await generateClipTitle(input, { modelEnabled: true, runModel: goodHook });
    expect(out.source).toBe("model");
    expect(out.title).toBe("The morning routine nobody films");
  });

  it("with no runners at all the title is the template engine's — and is labelled template", async () => {
    const out = await generateClipTitle(input, { modelEnabled: false });
    expect(out.source).toBe("template");
    expect(sourceBadge(out.source)).toBe("Template engine");
    expect(out.title.length).toBeGreaterThan(8);
    // the template hook is built from the segment's own words (the topic), not invented
    expect(out.title.toLowerCase()).toContain("morning routines");
  });

  it("a failed cloud falls back LABELLED: source template, fellBack true, note names the failure", async () => {
    const down: ModelRunner = async () => { throw new Error("429 from provider"); };
    const out = await generateClipTitle(input, { runCloud: down, modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("free AI service was not available");
    expect(out.title.length).toBeGreaterThan(8);
  });

  it("a cloud failure steps down to a working local model, still labelled as a fallback", async () => {
    const down: ModelRunner = async () => { throw new Error("upstream down"); };
    const out = await generateClipTitle(input, { runCloud: down, modelEnabled: true, runModel: goodHook });
    expect(out.source).toBe("model");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("local model wrote it");
  });

  it("unusable model output falls back to the labelled template title, never an empty or fake title", async () => {
    const junk: ModelRunner = async () => "ok";
    const out = await generateClipTitle(input, { runCloud: junk, modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.title.length).toBeGreaterThan(8);
  });

  it("falls back to the source title as topic when the segment has no text", async () => {
    const out = await generateClipTitle({ ...input, segmentText: "   " }, { modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.title.toLowerCase()).toContain("my long podcast");
  });

  it("the generated title is capped at the 120-char project limit", async () => {
    const long: ModelRunner = async () => "x".repeat(300);
    const out = await generateClipTitle(input, { runCloud: long, modelEnabled: false });
    // a 300-char single line parses as one hook item; the title is capped, not rejected
    expect(out.title.length).toBeLessThanOrEqual(120);
  });
});

describe("clipTitleFromGenerated", () => {
  it("strips surrounding quotes and collapses whitespace", () => {
    expect(clipTitleFromGenerated('  "My   great\n clip"  ')).toBe("My great clip");
  });
});
