import { describe, expect, it } from "vitest";
import { analyzeReel, type AnalyzerWord } from "./analyze";
import {
  analysisContextText,
  buildAnalysisBody,
  fmtMs,
  readAnalysisBody,
  recordEdit,
  type AnalysisBody,
} from "./breakdownItem";

const seg = (texts: string[], startMs: number, stepMs: number, durMs = 400): AnalyzerWord[] =>
  texts.map((text, i) => ({ text, startMs: startMs + i * stepMs, endMs: startMs + i * stepMs + durMs }));

const words: AnalyzerWord[] = [
  ...seg(["Kya", "aap", "3", "galti", "karte", "ho?"], 0, 500),
  ...seg(["Pehle", "apna", "topic", "chuno"], 3800, 600),
  ...seg(["Aur", "ab", "follow", "karo"], 36_400, 500),
];
const breakdown = analyzeReel({ words, durationMs: 45_000, sceneCutsMs: [5200, 10_000] });

const ownBody = (): AnalysisBody =>
  buildAnalysisBody({
    subject: { type: "own" },
    sourceProjectId: "proj-1",
    videoTitle: "My morning reel",
    durationMs: 45_000,
    breakdown,
  });

const competitorBody = (): AnalysisBody =>
  buildAnalysisBody({
    subject: { type: "competitor", name: "Rival Creates" },
    sourceProjectId: null,
    videoTitle: "Their viral reel",
    durationMs: 45_000,
    breakdown,
    notes: "Watch their pacing.",
  });

describe("buildAnalysisBody / readAnalysisBody round-trip", () => {
  it("round-trips an own-video body", () => {
    const body = ownBody();
    expect(body.version).toBe(1);
    expect(body.editedFields).toEqual([]);
    expect(body.notes).toBe("");
    expect(readAnalysisBody(body)).toEqual(body);
    // a JSON round-trip (what the server stores) reads back identically too
    expect(readAnalysisBody(JSON.parse(JSON.stringify(body)))).toEqual(body);
  });

  it("round-trips a competitor body with notes", () => {
    const body = competitorBody();
    expect(readAnalysisBody(JSON.parse(JSON.stringify(body)))).toEqual(body);
  });
});

describe("readAnalysisBody rejects malformed bodies", () => {
  it("returns null for non-objects and wrong versions", () => {
    expect(readAnalysisBody(null)).toBeNull();
    expect(readAnalysisBody("analysis")).toBeNull();
    expect(readAnalysisBody([])).toBeNull();
    expect(readAnalysisBody({ ...ownBody(), version: 2 })).toBeNull();
    expect(readAnalysisBody({ ...ownBody(), version: "1" })).toBeNull();
  });

  it("returns null when beats or metrics are missing, or the hook is not text", () => {
    const good = ownBody();
    const noBeats = JSON.parse(JSON.stringify(good));
    delete noBeats.breakdown.beats;
    expect(readAnalysisBody(noBeats)).toBeNull();
    const noMetrics = JSON.parse(JSON.stringify(good));
    delete noMetrics.breakdown.metrics;
    expect(readAnalysisBody(noMetrics)).toBeNull();
    const badHook = JSON.parse(JSON.stringify(good));
    badHook.breakdown.hook.text = 42;
    expect(readAnalysisBody(badHook)).toBeNull();
    const noBreakdown = { ...good, breakdown: undefined };
    expect(readAnalysisBody(noBreakdown)).toBeNull();
  });

  it("returns null for a bad subject (competitor without a name)", () => {
    expect(readAnalysisBody({ ...ownBody(), subject: { type: "competitor" } })).toBeNull();
    expect(readAnalysisBody({ ...ownBody(), subject: { type: "competitor", name: "  " } })).toBeNull();
    expect(readAnalysisBody({ ...ownBody(), subject: { type: "someone-else" } })).toBeNull();
    expect(readAnalysisBody({ ...ownBody(), subject: null })).toBeNull();
  });
});

describe("recordEdit", () => {
  it("adds a field once and dedupes repeats, without mutating the input", () => {
    const body = ownBody();
    const once = recordEdit(body, "hook.text");
    expect(once.editedFields).toEqual(["hook.text"]);
    expect(body.editedFields).toEqual([]);
    const twice = recordEdit(once, "hook.text");
    expect(twice.editedFields).toEqual(["hook.text"]);
    const more = recordEdit(twice, "beats.0.label");
    expect(more.editedFields).toEqual(["hook.text", "beats.0.label"]);
  });
});

describe("analysisContextText", () => {
  it("contains the title, subject, hook, beat, CTA and pacing lines", () => {
    const text = analysisContextText(ownBody());
    expect(text).toContain("Video: My morning reel");
    expect(text).toContain("Subject: My video");
    expect(text).toContain("Hook: Kya aap 3 galti karte ho?");
    // beat lines in the "0:03–0:11 Hook: …" shape
    expect(text).toMatch(/0:00–0:02 Hook: Kya aap 3 galti karte ho\?/);
    expect(text).toContain("Call to action: follow karo (0:37)");
    expect(text).toContain(`Pacing: ${breakdown.pacing.wordsPerMin.toFixed(1)} words/min`);
    expect(text).toContain(`${breakdown.pacing.cutsPerMin.toFixed(1)} cuts/min`);
  });

  it("names the competitor when the subject is a competitor, and includes notes", () => {
    const text = analysisContextText(competitorBody());
    expect(text).toContain("Subject: Competitor: Rival Creates");
    expect(text).toContain("Notes: Watch their pacing.");
  });

  it("says 'none found' when the breakdown has no CTA", () => {
    const noCta = analyzeReel({
      words: seg(["Bas", "kuch", "baatein"], 0, 500),
      durationMs: 10_000,
      sceneCutsMs: [],
    });
    const body = buildAnalysisBody({
      subject: { type: "own" },
      sourceProjectId: null,
      videoTitle: "Quiet reel",
      durationMs: 10_000,
      breakdown: noCta,
    });
    expect(analysisContextText(body)).toContain("Call to action: none found");
  });
});

describe("fmtMs", () => {
  it("formats m:ss", () => {
    expect(fmtMs(0)).toBe("0:00");
    expect(fmtMs(3000)).toBe("0:03");
    expect(fmtMs(65_000)).toBe("1:05");
    expect(fmtMs(760_000)).toBe("12:40");
  });
});
