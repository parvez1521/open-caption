import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, type CaptionDoc } from "@capseasy/shared";
import { derivePages, toSrt, toTxt } from "@motion-ai/caption-engine/core";
import type { ModelRunner } from "@/features/create/service";
import { sourceBadge } from "@/features/create/model";
import {
  applyEmphasisSuggestions,
  buildEmphasisPrompt,
  emphasisRouteAvailable,
  generateEmphasisSuggestions,
  parseEmphasisOutput,
  type EmphasisSuggestion,
} from "../emphasis";

/**
 * Addition A1: auto-emphasis + keyword-emoji suggestions. The routing is
 * mocked at the ModelRunner boundary (the service.test.ts pattern — no
 * network, no model). The hard rules pinned here: suggestions bind to real
 * doc words; there is NO template fallback (no/failing AI route =
 * unavailable, never a heuristic batch); malformed items drop one by one.
 */

const doc: CaptionDoc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w0", text: "Stop", startMs: 0, endMs: 300 },
    { id: "w1", text: "wasting", startMs: 320, endMs: 700 },
    { id: "w2", text: "money", startMs: 720, endMs: 1100 },
    { id: "w3", text: "on", startMs: 1120, endMs: 1300 },
    { id: "w4", text: "free", startMs: 1320, endMs: 1600 },
    { id: "w5", text: "tools", startMs: 1620, endMs: 2000 },
  ],
});

const GOOD_JSON = JSON.stringify([
  { index: 0, word: "Stop", action: "emphasise" },
  { index: 4, word: "free", action: "supersize" },
  { index: 2, word: "money", action: "emoji", emoji: "💰" },
]);
const goodCloud: ModelRunner = async () => GOOD_JSON;

describe("generateEmphasisSuggestions — routing (mocked)", () => {
  it("cloud success: parsed suggestions bound to real doc words (id, index, text, timing from the DOC)", async () => {
    const out = await generateEmphasisSuggestions(doc, { runCloud: goodCloud, modelEnabled: false });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.source).toBe("cloud");
    expect(out.fellBack).toBe(false);
    expect(sourceBadge(out.source)).toContain("Free AI");
    expect(out.suggestions).toHaveLength(3);
    const byAction = Object.fromEntries(out.suggestions.map((s) => [s.action, s]));
    expect(byAction.emphasise).toMatchObject({ wordId: "w0", wordIndex: 0, text: "Stop", startMs: 0, endMs: 300 });
    expect(byAction.supersize).toMatchObject({ wordId: "w4", wordIndex: 4, text: "free", startMs: 1320 });
    expect(byAction.emoji).toMatchObject({ wordId: "w2", wordIndex: 2, text: "money", emoji: "💰" });
    // sorted by word order, and every suggestion resolves to a word that exists in the doc
    expect(out.suggestions.map((s) => s.wordIndex)).toEqual([0, 2, 4]);
    for (const s of out.suggestions) expect(doc.words[s.wordIndex]!.id).toBe(s.wordId);
  });

  it("the prompt carries the numbered transcript so the model can reference real indices", async () => {
    const spy = vi.fn(goodCloud);
    await generateEmphasisSuggestions(doc, { runCloud: spy, modelEnabled: false });
    const prompt = spy.mock.calls[0]![0];
    expect(prompt.user).toContain("2: money");
    expect(prompt.user).toContain("4: free");
    expect(prompt.system).toContain("JSON array");
  });

  it("prefers the cloud over the local model, like every Phase-3 generator", async () => {
    const runModel = vi.fn(goodCloud);
    const out = await generateEmphasisSuggestions(doc, { runCloud: goodCloud, modelEnabled: true, runModel });
    expect(out.status === "ok" && out.source).toBe("cloud");
    expect(runModel).not.toHaveBeenCalled();
  });

  it("local-model success is badged as the local model", async () => {
    const out = await generateEmphasisSuggestions(doc, { modelEnabled: true, runModel: goodCloud });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.source).toBe("model");
    expect(sourceBadge(out.source)).toContain("Local model");
  });

  it("a failed cloud steps down to a working local model, labelled as a fallback", async () => {
    const down: ModelRunner = async () => { throw new Error("429 from provider"); };
    const out = await generateEmphasisSuggestions(doc, { runCloud: down, modelEnabled: true, runModel: goodCloud });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.source).toBe("model");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("local model wrote these suggestions");
  });

  it("NO template fallback: with no AI route configured the feature is unavailable, not degraded", async () => {
    const deps = { modelEnabled: false };
    expect(emphasisRouteAvailable(deps)).toBe(false);
    const out = await generateEmphasisSuggestions(doc, deps);
    expect(out.status).toBe("unavailable");
    if (out.status !== "unavailable") return;
    expect(out.reason).toContain("no template or heuristic fallback");
  });

  it("NO template fallback: a failing cloud with no local model is unavailable (never a 'template' batch)", async () => {
    const down: ModelRunner = async () => { throw new Error("upstream down"); };
    const out = await generateEmphasisSuggestions(doc, { runCloud: down, modelEnabled: false });
    expect(out.status).toBe("unavailable");
    if (out.status !== "unavailable") return;
    expect(out.reason).toContain("no template fallback");
  });

  it("unusable (non-JSON) model output is a route failure -> unavailable, not an error and not a fake batch", async () => {
    const junk: ModelRunner = async () => "Sure! Emphasise money and free.";
    const out = await generateEmphasisSuggestions(doc, { runCloud: junk, modelEnabled: false });
    expect(out.status).toBe("unavailable");
  });

  it("an empty transcript is unavailable with a plain reason", async () => {
    const empty = CaptionDocSchema.parse({ version: 2, language: "en", words: [] });
    const out = await generateEmphasisSuggestions(empty, { runCloud: goodCloud, modelEnabled: false });
    expect(out.status).toBe("unavailable");
  });
});

describe("parseEmphasisOutput — strict, item-by-item", () => {
  it("drops malformed items one by one and keeps the valid ones", () => {
    const raw = JSON.stringify([
      { index: 2, word: "money", action: "emoji", emoji: "💰" }, // valid
      { index: 99, word: "ghost", action: "emphasise" }, // out of range
      { index: -1, action: "emphasise" }, // out of range
      { index: 1.5, action: "emphasise" }, // non-integer
      { index: 1, word: "money", action: "emphasise" }, // echoed word does not match index 1 ("wasting")
      { index: 1, action: "banana" }, // unknown action
      { index: 3, action: "emoji", emoji: "abc" }, // not an emoji
      { index: 3, action: "emoji" }, // missing emoji
      { index: 2, word: "money", action: "emoji", emoji: "💰" }, // exact duplicate
      "nonsense",
      null,
      { index: 5, word: "tools", action: "emphasise" }, // valid
    ]);
    const out = parseEmphasisOutput(raw, doc);
    expect(out).not.toBeNull();
    expect(out!.map((s) => `${s.wordId}:${s.action}`)).toEqual(["w2:emoji", "w5:emphasise"]);
  });

  it("hidden words are never suggested", () => {
    const withHidden = CaptionDocSchema.parse({
      version: 2, language: "en",
      words: [
        { id: "w0", text: "um", startMs: 0, endMs: 200, hidden: true },
        { id: "w1", text: "money", startMs: 220, endMs: 600 },
      ],
    });
    const out = parseEmphasisOutput(JSON.stringify([
      { index: 0, action: "emphasise" },
      { index: 1, action: "emphasise" },
    ]), withHidden);
    expect(out!.map((s) => s.wordId)).toEqual(["w1"]);
  });

  it("supersize outranks emphasise for the same word, in either arrival order", () => {
    const a = parseEmphasisOutput(JSON.stringify([
      { index: 4, action: "emphasise" }, { index: 4, action: "supersize" },
    ]), doc);
    expect(a!.map((s) => s.action)).toEqual(["supersize"]);
    const b = parseEmphasisOutput(JSON.stringify([
      { index: 4, action: "supersize" }, { index: 4, action: "emphasise" },
    ]), doc);
    expect(b!.map((s) => s.action)).toEqual(["supersize"]);
  });

  it("an empty array is a successful empty result; prose around a fenced array still parses", () => {
    expect(parseEmphasisOutput("[]", doc)).toEqual([]);
    const fenced = "Here you go:\n```json\n" + GOOD_JSON + "\n```";
    expect(parseEmphasisOutput(fenced, doc)).toHaveLength(3);
  });

  it("an array of only-bad items is an empty success, not null", () => {
    expect(parseEmphasisOutput(JSON.stringify([{ index: 42, action: "emphasise" }]), doc)).toEqual([]);
  });

  it("non-JSON / non-array output returns null (runner failure)", () => {
    expect(parseEmphasisOutput("no json here", doc)).toBeNull();
    expect(parseEmphasisOutput('{"index":1}', doc)).toBeNull();
    expect(parseEmphasisOutput("[not json]", doc)).toBeNull();
  });

  it("buildEmphasisPrompt indexes every word", () => {
    const p = buildEmphasisPrompt(doc);
    for (let i = 0; i < doc.words.length; i++) expect(p.user).toContain(`${i}: ${doc.words[i]!.text}`);
  });
});

describe("applyEmphasisSuggestions — existing ops only", () => {
  const suggestions: EmphasisSuggestion[] = [
    { id: "w0:emphasise", wordId: "w0", wordIndex: 0, text: "Stop", startMs: 0, endMs: 300, action: "emphasise" },
    { id: "w4:supersize", wordId: "w4", wordIndex: 4, text: "free", startMs: 1320, endMs: 1600, action: "supersize" },
    { id: "w2:emoji", wordId: "w2", wordIndex: 2, text: "money", startMs: 720, endMs: 1100, action: "emoji", emoji: "💰" },
  ];

  it("applies through setEmphasis/setWordEmoji: strong, hero and an above-word emoji", () => {
    const out = applyEmphasisSuggestions(doc, suggestions);
    expect(out.words[0]!.emphasis).toBe("strong");
    expect(out.words[4]!.emphasis).toBe("hero");
    expect(out.words[2]!.emoji).toEqual({ char: "💰", position: "above" });
    // untouched words keep object identity; the source doc is not mutated
    expect(out.words[1]).toBe(doc.words[1]);
    expect(doc.words[0]!.emphasis).toBeUndefined();
  });

  it("skips stale words and already-satisfied suggestions; a no-op returns the SAME doc reference", () => {
    const stale: EmphasisSuggestion = { id: "gone:emphasise", wordId: "gone", wordIndex: 0, text: "x", startMs: 0, endMs: 1, action: "emphasise" };
    expect(applyEmphasisSuggestions(doc, [stale])).toBe(doc);
    const once = applyEmphasisSuggestions(doc, suggestions);
    expect(applyEmphasisSuggestions(once, suggestions)).toBe(once);
  });

  it("exports are affected only through the doc itself: SRT/TXT text is identical before and after applying", () => {
    const settings = ProjectSettingsSchema.parse({});
    const before = applyEmphasisSuggestions(doc, []);
    expect(before).toBe(doc);
    const after = applyEmphasisSuggestions(doc, suggestions);
    const srt = (d: CaptionDoc) => toSrt(derivePages(d, settings));
    const txt = (d: CaptionDoc) => toTxt(derivePages(d, settings));
    expect(srt(after)).toBe(srt(doc));
    expect(txt(after)).toBe(txt(doc));
    // timings and words unchanged — emphasis/emoji are render-time styling, not subtitle text
    expect(after.words.map((w) => [w.text, w.startMs, w.endMs])).toEqual(doc.words.map((w) => [w.text, w.startMs, w.endMs]));
  });
});
