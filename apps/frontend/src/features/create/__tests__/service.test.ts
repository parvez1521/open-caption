import { describe, expect, it, vi } from "vitest";
import { generateContent, type ModelRunner } from "../service";
import { buildPrompt, parseModelOutput } from "../prompts";
import { CLOUD_AI, LOCAL_MODEL, sourceBadge, sourceNote } from "../model";

const ideas = { niche: "home workouts", platform: "reels" as const, audience: "busy parents", count: 4 };
const hooks = { topic: "morning routines", style: "curiosity" as const, platform: "shorts" as const, count: 3 };
const captions = { topic: "trail running", platform: "reels" as const, tone: "friendly" as const };

const goodIdeas: ModelRunner = async () =>
  "Home workout wins :: Start with the mistake\nTwo-minute mornings :: The angle nobody films\nNo-equipment strength :: Proof over promises\nParent-friendly circuits :: Fits a nap window";

describe("generation service routing", () => {
  it("uses the template engine when the model is disabled, even if a runner exists", async () => {
    const runModel = vi.fn(goodIdeas);
    const out = await generateContent("ideas", ideas, { modelEnabled: false, runModel });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(false);
    expect(out.items).toHaveLength(4);
    expect(runModel).not.toHaveBeenCalled();
  });

  it("uses the template engine when no runner is supplied", async () => {
    const out = await generateContent("hooks", hooks, { modelEnabled: true });
    expect(out.source).toBe("template");
    expect(out.items).toHaveLength(3);
  });

  it("routes to the model when enabled and the output parses", async () => {
    const out = await generateContent("ideas", ideas, { modelEnabled: true, runModel: goodIdeas });
    expect(out.source).toBe("model");
    expect(out.fellBack).toBe(false);
    expect(out.items[0]!.title).toBe("Home workout wins");
    expect(out.items[0]!.detail).toBe("Start with the mistake");
  });

  it("falls back to templates with a note when the model runner throws", async () => {
    const runModel: ModelRunner = async () => { throw new Error("wasm out of memory"); };
    const out = await generateContent("ideas", ideas, { modelEnabled: true, runModel });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("template engine");
    expect(out.items).toHaveLength(4);
    expect(out.items[0]!.title.toLowerCase()).toContain("home workouts");
  });

  it("falls back when the model returns unusable text", async () => {
    const runModel: ModelRunner = async () => "ok";
    const out = await generateContent("hooks", hooks, { modelEnabled: true, runModel });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.items).toHaveLength(3);
  });

  it("falls back when fewer than half the requested items parse", async () => {
    const runModel: ModelRunner = async () => "Only one decent hook lives here";
    const out = await generateContent("hooks", { ...hooks, count: 6 }, { modelEnabled: true, runModel });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
  });

  it("parses caption lines into text plus hashtags on the model path", async () => {
    const runModel: ModelRunner = async () =>
      "Trail day done right :: #trailrunning #running\nSunrise miles club :: #trailrunning #sunrise\nMud is a feature :: #trailrunning #mudrun";
    const out = await generateContent("captions", captions, { modelEnabled: true, runModel });
    expect(out.source).toBe("model");
    expect(out.items).toHaveLength(3);
    expect(out.items[0]!.hashtags).toContain("#trailrunning");
    expect(out.items[0]!.title).not.toContain("#");
  });
});

const goodHooks: ModelRunner = async () =>
  "Stop scrolling for this one\nNobody films the first step\nYour mornings are lying to you";

describe("cloud routing (the free AI path)", () => {
  it("routes to the cloud when a cloud runner is supplied and the output parses", async () => {
    const out = await generateContent("hooks", hooks, { runCloud: goodHooks, modelEnabled: false });
    expect(out.source).toBe("cloud");
    expect(out.fellBack).toBe(false);
    expect(out.items).toHaveLength(3);
    expect(out.items[0]!.title).toBe("Stop scrolling for this one");
  });

  it("prefers the cloud over the local model when both are available", async () => {
    const runModel = vi.fn(goodHooks);
    const out = await generateContent("hooks", hooks, { runCloud: goodHooks, modelEnabled: true, runModel });
    expect(out.source).toBe("cloud");
    expect(runModel).not.toHaveBeenCalled();
  });

  it("falls back to templates with a note when the cloud runner throws (rate limit, outage)", async () => {
    const runCloud: ModelRunner = async () => { throw new Error("429 from provider"); };
    const out = await generateContent("ideas", ideas, { runCloud, modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("free AI service was not available");
    expect(out.items).toHaveLength(4);
  });

  it("falls back to templates when the cloud returns unusable text", async () => {
    const runCloud: ModelRunner = async () => "ok";
    const out = await generateContent("hooks", hooks, { runCloud, modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.items).toHaveLength(3);
  });

  it("steps down to the local model when the cloud fails and the local model works", async () => {
    const runCloud: ModelRunner = async () => { throw new Error("upstream down"); };
    const out = await generateContent("hooks", hooks, { runCloud, modelEnabled: true, runModel: goodHooks });
    expect(out.source).toBe("model");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("local model wrote it");
  });

  it("names both failures when cloud and local both fail", async () => {
    const down: ModelRunner = async () => { throw new Error("nope"); };
    const out = await generateContent("hooks", hooks, { runCloud: down, modelEnabled: true, runModel: down });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("free AI service and the local model were both unavailable");
  });

  it("parses caption lines into text plus hashtags on the cloud path", async () => {
    const runCloud: ModelRunner = async () =>
      "Trail day done right :: #trailrunning #running\nSunrise miles club :: #trailrunning #sunrise\nMud is a feature :: #trailrunning #mudrun";
    const out = await generateContent("captions", captions, { runCloud, modelEnabled: false });
    expect(out.source).toBe("cloud");
    expect(out.items).toHaveLength(3);
    expect(out.items[0]!.hashtags).toContain("#trailrunning");
  });
});

describe("prompts and parsing", () => {
  it("builds a bounded, format-exact prompt per kind", () => {
    const p = buildPrompt("ideas", ideas);
    expect(p.user).toContain("home workouts");
    expect(p.user).toContain("4 video content ideas");
    expect(p.user).toContain("::");
    expect(buildPrompt("hooks", hooks).user).toContain("curiosity");
    expect(buildPrompt("captions", captions).user).toContain("friendly");
  });

  it("strips numbering and bullets when parsing", () => {
    const items = parseModelOutput("hooks", "1. First real hook line here\n- Second real hook line here\n3) Third real hook line here", 3);
    expect(items).toHaveLength(3);
    expect(items[0]!.title).toBe("First real hook line here");
  });

  it("returns nothing for empty or junk output", () => {
    expect(parseModelOutput("ideas", "", 3)).toEqual([]);
    expect(parseModelOutput("ideas", "a\nb", 3)).toEqual([]);
  });
});

describe("honest labelling", () => {
  it("names the template engine plainly and never calls it a model or AI", () => {
    const badge = sourceBadge("template");
    expect(badge).toBe("Template engine");
    expect(badge.toLowerCase()).not.toContain("ai");
    expect(badge.toLowerCase()).not.toContain("model");
    expect(sourceNote("template")).toContain("No model was used");
  });

  it("names the local model and says it runs on the device", () => {
    const badge = sourceBadge("model");
    expect(badge).toBe(`Local model · ${LOCAL_MODEL.name} · runs on your device`);
    expect(badge).toContain("SmolLM2");
    expect(sourceNote("model")).toContain("Nothing was sent to a server");
  });

  it("the model record carries the verified repo, licence and size disclosure", () => {
    expect(LOCAL_MODEL.id).toBe("onnx-community/SmolLM2-360M-Instruct-ONNX");
    expect(LOCAL_MODEL.licence).toBe("Apache-2.0");
    expect(LOCAL_MODEL.approxDownloadLabel).toContain("210 MB");
    expect(LOCAL_MODEL.maxNewTokens).toBeLessThanOrEqual(512);
  });

  it("names the cloud source as free AI with model and provider, and says the text was sent", () => {
    const badge = sourceBadge("cloud");
    expect(badge).toBe(`Free AI · ${CLOUD_AI.modelName} (${CLOUD_AI.provider})`);
    expect(badge).toContain("Free AI");
    expect(CLOUD_AI.modelId).toBe("openai/gpt-oss-120b");
    expect(sourceNote("cloud")).toContain("nothing ran on your device");
    expect(sourceNote("cloud")).toContain("sent to Groq");
  });
});
