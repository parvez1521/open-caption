import { describe, expect, it, vi } from "vitest";
import { generateScriptContent } from "../scriptService";
import type { ModelRunner } from "../service";
import type { ScriptInput } from "../scripts";
import { EMPTY_VOICE, type BrandProfile } from "../brandProfile";

const makeProfile = (voice: Partial<BrandProfile["voice"]>): BrandProfile => ({
  id: "profile-1",
  name: "Test profile",
  isActive: true,
  colors: [],
  fontId: null,
  voice: { ...EMPTY_VOICE, ...voice },
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
});

const input: ScriptInput = { topic: "morning stretches", format: "reel", durationSec: 30, tone: "friendly" };

const goodScript: ModelRunner = async () =>
  [
    "TITLE: From the model",
    "BEAT | 0-10 | Hook | Model hook dialogue here. | Hook text | Camera close-up",
    "BEAT | 10-30 | Point | Model point dialogue here. | Point text | Demo footage",
    "CTA: Follow for part two.",
    "CAPTION: A model caption :: #model #script",
  ].join("\n");

describe("Script Studio service routing", () => {
  it("uses the template engine when no runner is available", async () => {
    const out = await generateScriptContent(input, { modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(false);
    expect(out.script.beats.length).toBeGreaterThanOrEqual(4);
    expect(out.script.beats[0]!.startSec).toBe(0);
    expect(out.script.beats[out.script.beats.length - 1]!.endSec).toBe(30);
  });

  it("routes to the cloud when its output parses as a script", async () => {
    const out = await generateScriptContent(input, { runCloud: goodScript, modelEnabled: false });
    expect(out.source).toBe("cloud");
    expect(out.fellBack).toBe(false);
    expect(out.script.title).toBe("From the model");
    expect(out.script.beats).toHaveLength(2);
  });

  it("prefers cloud over the local model", async () => {
    const runModel = vi.fn(goodScript);
    const out = await generateScriptContent(input, { runCloud: goodScript, modelEnabled: true, runModel });
    expect(out.source).toBe("cloud");
    expect(runModel).not.toHaveBeenCalled();
  });

  it("falls back to templates with a note when the cloud throws", async () => {
    const runCloud: ModelRunner = async () => { throw new Error("429"); };
    const out = await generateScriptContent(input, { runCloud, modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("free AI service was not available");
    expect(out.note).toContain("script");
  });

  it("falls back when the cloud returns unparseable text", async () => {
    const runCloud: ModelRunner = async () => "just some prose, no beats at all";
    const out = await generateScriptContent(input, { runCloud, modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
  });

  it("steps down to the local model when the cloud fails", async () => {
    const runCloud: ModelRunner = async () => { throw new Error("down"); };
    const out = await generateScriptContent(input, { runCloud, modelEnabled: true, runModel: goodScript });
    expect(out.source).toBe("model");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("local model wrote it");
    expect(out.script.title).toBe("From the model");
  });

  it("names both failures when cloud and local both fail", async () => {
    const down: ModelRunner = async () => { throw new Error("nope"); };
    const out = await generateScriptContent(input, { runCloud: down, modelEnabled: true, runModel: down });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("both unavailable");
  });

  it("the runner receives the script prompt, including the deps profile block", async () => {
    const profile = makeProfile({ niche: "fitness", wordsToAvoid: ["guaranteed"] });
    let captured: { system: string; user: string } | null = null;
    const runCloud: ModelRunner = async (prompt) => {
      captured = prompt;
      return goodScript(prompt);
    };
    const out = await generateScriptContent(input, { runCloud, modelEnabled: false, profile });
    expect(out.source).toBe("cloud");
    expect(captured!.user).toContain("BEAT | <startSec>-<endSec>");
    expect(captured!.user).toContain("Brand voice");
    expect(captured!.user).toContain("guaranteed");
  });
});
