import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CaptionDocSchema,
  CreateExportBody,
  ProjectSettingsSchema,
  exportMemoryErrorMessage,
  type CaptionDoc,
  type Page,
  type ProjectSettings,
  type Word,
} from "@capseasy/shared";
import { applyLook, getLook } from "@capseasy/templates";
import { derivePages, toSrt } from "@motion-ai/caption-engine/core";

/* Chain 1 (Phase 6 → 3): Analyzer → content library → Creator Studio chat */
import { analyzeReel } from "@/features/analyzer/analyze";
import {
  analysisContextText,
  buildAnalysisBody,
  readAnalysisBody,
} from "@/features/analyzer/breakdownItem";
import { contextTextForItem } from "@/features/create/chat";
import type { ContentItem } from "@/features/create/library";

/* Chain 2 (Phase 6 → 7): Growth weekly plan → Planner import */
import type { GrowthPost } from "@/features/growth/model";
import { assemblePlan, nextWeekMonday, planDates, readWeeklyPlan } from "@/features/growth/plan";
import { computeWeeklyReport } from "@/features/growth/report";
import { importWeeklyPlan, readPlannerCard } from "@/features/planner/model";

/* Chain 3 (Phase 3 → 7): Script Studio → Teleprompter */
import { scriptDocFromBody } from "@/features/create/libraryMigration";
import { generateScript, scriptToText } from "@/features/create/scripts";
import {
  estimatedReadSeconds,
  prompterTextForScriptItem,
  wordCount,
} from "@/features/prompter/model";

/* Chain 5 (Phase 5 → 4 → export): captions + placed audio → Polish → export */
import { toComposition, type CompositionInput } from "@/features/studio/composition";
import { buildEditorComposition } from "@/features/studio/compositionDoc";
import { EXPORT_OPTIONS, exportDimsWithCanvas } from "@/features/studio/exportOptions";
import {
  applyPolishPlan,
  buildPolishPlan,
  polishCommitSettings,
  type PolishProjectState,
} from "@/features/studio/polish";

/**
 * Cross-phase integration chains (Phase 9, W7).
 *
 * Each describe block chains the REAL modules across a phase boundary the
 * way the pages wire them — including the JSON storage round-trip in the
 * middle, because every handoff below passes through a stored
 * content-library body or a stored project doc. Per-phase unit coverage is
 * cited in each block; these tests exist for the seams between them.
 */

const contentItem = (patch: Partial<ContentItem>): ContentItem => ({
  id: "item-1",
  kind: "idea",
  title: "Item",
  body: {},
  source: "manual",
  folder: null,
  projectId: null,
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
  ...patch,
});
const stored = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/* ------------------------------------------------------------------ chain 1 */

describe("chain 1: Analyzer → library → Creator Studio chat context (6→3)", () => {
  // Per-phase coverage: analyzer/breakdownItem.test.ts (build/read/context
  // text in isolation) and create/__tests__/chat.test.ts
  // "contextTextForItem renders a saved analysis as its breakdown text"
  // (analyze → build → context, but WITHOUT the storage round-trip through
  // readAnalysisBody that the chat page's attached item actually survives,
  // and without pinning chat context ≡ analysisContextText).
  it("a measured breakdown survives storage and renders in chat exactly as analysisContextText", () => {
    const breakdown = analyzeReel({
      words: [
        { text: "How", startMs: 0, endMs: 400 },
        { text: "to", startMs: 500, endMs: 900 },
        { text: "follow", startMs: 5000, endMs: 5400 },
      ],
      durationMs: 10_000,
      sceneCutsMs: [4000],
    });
    const body = buildAnalysisBody({
      subject: { type: "competitor", name: "Rival Creates" },
      sourceProjectId: null,
      videoTitle: "Their reel",
      durationMs: 10_000,
      breakdown,
      notes: "Steal the pacing, not the script",
    });

    // storage: the Analyzer page saves the body on a library item; the item
    // the chat page later attaches has been through JSON persistence.
    const item = contentItem({
      kind: "analysis",
      title: "Analysis — Their reel",
      body: stored(body) as unknown as Record<string, unknown>,
    });

    const reread = readAnalysisBody(item.body);
    expect(reread).toEqual(body);
    const text = contextTextForItem(item);
    expect(text).toBe(analysisContextText(reread!));
    expect(text).toContain("Video: Their reel");
    expect(text).toContain("Hook: How to");
    expect(text).toContain("Call to action: follow (0:05)");
    expect(text).toContain("Notes: Steal the pacing, not the script");
  });
});

/* ------------------------------------------------------------------ chain 2 */

describe("chain 2: Growth weekly plan → Planner import (6→7)", () => {
  // Per-phase coverage: growth/plan.test.ts (report → assemblePlan, with a
  // hand-shaped report fixture path) and planner/__tests__/model.test.ts
  // "importWeeklyPlan" (a HAND-WRITTEN WeeklyPlanBody fixture). Neither
  // chained computeWeeklyReport → assemblePlan → readWeeklyPlan →
  // importWeeklyPlan, so the suggested-time/basis strings the Growth side
  // formats were never asserted against the Planner side's cards.
  const NOW = Date.parse("2026-02-18T12:00:00.000Z");
  const DAY = 24 * 60 * 60 * 1000;
  let seq = 0;
  const post = (over: Partial<GrowthPost>): GrowthPost => ({
    id: `p${++seq}`,
    platform: "instagram",
    title: "Post",
    postUrl: null,
    postedAt: new Date(NOW - DAY).toISOString(),
    views: null, reach: null, likes: null, comments: null, shares: null, saves: null,
    source: "manual",
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...over,
  });

  it("report-derived suggested times land on planner cards for the plan's local dates", () => {
    const atHour = (daysAgo: number, hour: number, over: Partial<GrowthPost>) => {
      const d = new Date(NOW - daysAgo * DAY);
      d.setHours(hour, 0, 0, 0);
      return post({ postedAt: d.toISOString(), ...over });
    };
    const report = computeWeeklyReport(
      [
        atHour(1, 18, { title: "Winner reel", views: 1230, likes: 100 }),
        atHour(2, 18, { title: "Second", views: 1000, likes: 60 }),
        post({ postedAt: new Date(NOW - 8 * DAY).toISOString(), views: 1000, likes: 80 }),
      ],
      NOW,
      { competitors: [], analyses: [] },
    );
    expect(report.bestHours.status).toBe("ok");

    const weekStart = nextWeekMonday(new Date(2026, 1, 18));
    const plan = assemblePlan({
      weekStart,
      items: [
        { title: "Launch reel", detail: "Caption for the launch reel" },
        { title: "Teaser short" },
        { title: "Carousel post", detail: "Carousel caption" },
      ],
      report,
      source: "template",
      fellBack: false,
      generatedAt: "2026-02-18T12:00:00.000Z",
    });

    // storage round-trip: the planner page reads the stored item body back
    // through readWeeklyPlan before importing (planner/page.tsx).
    const reread = readWeeklyPlan(stored(plan));
    expect(reread).toEqual(plan);

    const drafts = importWeeklyPlan("plan-item-9", reread!);
    expect(drafts.map((d) => d.title)).toEqual(["Launch reel", "Teaser short", "Carousel post"]);
    expect(drafts.map((d) => d.body.date)).toEqual(planDates(weekStart).slice(0, 3));
    for (const draft of drafts) {
      // the Growth side's best-hour evidence (18:00, from the two posts
      // above) is carried verbatim onto every card…
      expect(draft.body.time).toBe("18:00");
      expect(draft.body.timeBasis).toContain("Your posts at 18:00 averaged");
      expect(draft.body.timeBasis).toContain("across 2 posts");
      expect(draft.body.sourcePlanId).toBe("plan-item-9");
      expect(draft.body.status).toBe("planned");
      // …and each draft body is a valid planner card after its own storage
      // round-trip (the planner persists cards as content items too).
      expect(readPlannerCard(stored(draft.body))).toEqual(draft.body);
    }
    expect(drafts[0]!.body.caption).toBe("Caption for the launch reel");
    expect(drafts[1]!.body.caption).toBe("");
  });
});

/* ------------------------------------------------------------------ chain 3 */

describe("chain 3: Script Studio → Teleprompter fidelity (3→7)", () => {
  // Per-phase coverage: prompter/__tests__/model.test.ts
  // "prompterTextForScriptItem returns scriptToText(scriptDocFromBody(body))
  // verbatim" already pins this chain for a generated script and a
  // hand-written fixture. This block adds the two ends that test does not
  // exercise: the JSON storage round-trip in between, and the prompter
  // model's own consumption (word count / read-time) of the imported text.
  it("a stored script imports verbatim and the prompter model measures the full text", () => {
    const doc = generateScript({ topic: "morning routines", format: "reel", durationSec: 30, tone: "friendly" });
    const item = contentItem({
      kind: "script",
      title: doc.title,
      body: stored(doc) as unknown as Record<string, unknown>,
    });

    const text = prompterTextForScriptItem(item);
    expect(text).not.toBeNull();
    expect(text).toBe(scriptToText(scriptDocFromBody(item.body)!));
    for (const beat of doc.beats) expect(text).toContain(beat.dialogue);
    if (doc.cta) expect(text).toContain(doc.cta);

    // the prompter stage consumes exactly this text: its word count covers
    // every beat's dialogue words (title/cta/labels only add more).
    const dialogueWords = doc.beats
      .map((b) => b.dialogue.trim().split(/\s+/).filter(Boolean).length)
      .reduce((a, b) => a + b, 0);
    expect(wordCount(text!)).toBeGreaterThanOrEqual(dialogueWords);
    expect(estimatedReadSeconds(text!)).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ chain 5 */

describe("chain 5: captions + placed audio → Polish → export-readiness (5→4→export)", () => {
  // Per-phase coverage: studio/__tests__/polish.test.ts pins the full
  // Polish pass and "polishCommitSettings(next) toBeTruthy" — but its
  // fixture's music track carries NO placed audio clip, and it never
  // checks the export payload builders. This block adds a placed clip and
  // runs the result through projectComposition (via polishCommitSettings),
  // the subtitle builder, and the create-export payload validation.
  const word = (id: string, text: string, startMs: number, endMs: number, extra: Partial<Word> = {}): Word => ({
    id, text, startMs, endMs, ...extra,
  });
  const words: Word[] = [
    word("w1", "hello", 0, 500),
    word("w2", "um", 600, 900),
    word("w3", "amazing", 2000, 2400, { emphasis: "hero" }),
    word("w4", "world", 5000, 5500),
    word("w5", "done", 6000, 6400),
  ];
  const HOP = 20;
  const peaks = (() => {
    const n = Math.ceil(20_000 / HOP);
    const out = new Float32Array(n).fill(0.8);
    for (let i = Math.floor(2400 / HOP); i < Math.min(n, Math.ceil(5000 / HOP)); i++) out[i] = 0.02;
    return out;
  })();

  const settings: ProjectSettings = ProjectSettingsSchema.parse({
    composition: {
      version: 1,
      videoSegments: [],
      markers: [],
      audio: {
        tracks: [
          { id: "music-1", name: "Music", role: "music", volume: 1, muted: false, locked: false, ducking: { enabled: false, amountDb: 12, thresholdDb: -42 } },
          { id: "voice-1", name: "Voice", role: "voice", volume: 1, muted: false, locked: false, ducking: { enabled: false, amountDb: 12, thresholdDb: -42 } },
        ],
        clips: [
          { id: "music-clip-1", assetId: "asset-music", assetName: "song.mp3", trackId: "music-1", startMs: 0, sourceInMs: 0, sourceOutMs: 10000, volume: 0.8 },
        ],
      },
    },
  });

  const page = (id: string, ws: Word[]): Page => ({
    id, startMs: ws[0]?.startMs ?? 0, endMs: ws[ws.length - 1]?.endMs ?? 0,
    words: ws, lines: [ws], heroIndex: -1, emotion: "neutral", position: null, styleOverride: null,
  });

  function stateFor(): PolishProjectState {
    const input: CompositionInput = {
      media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 20_000 },
      doc: null, pages: [page("p1", words)], settings, durationMs: 20_000,
    };
    const comp = buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs: 20_000 });
    const look = getLook("hormozi_box")!;
    return {
      doc: CaptionDocSchema.parse({ version: 2, language: "en", words }) as CaptionDoc,
      comp,
      settings,
      style: applyLook(look).style,
      lookId: "hormozi_box",
    };
  }

  it("the polished project still projects, keeps its placed audio, and validates every export payload", () => {
    const state = stateFor();
    expect(state.comp.audioClips.map((c) => c.assetId)).toEqual(["asset-music"]);

    const plan = buildPolishPlan(
      { doc: state.doc, comp: state.comp, settings: state.settings, lookId: state.lookId, peaks, hopMs: HOP },
      { titleResult: { title: "The thing nobody tells you", source: "cloud", fellBack: false } },
    );
    expect(plan.steps.map((s) => s.kind)).toContain("music-ducking");
    const { state: next } = applyPolishPlan(state, plan, plan.steps.map((s) => s.id));

    // export-readiness 1: the commit projection (projectComposition inside
    // polishCommitSettings) must not throw on the polished composition,
    // and the result must re-parse as valid project settings.
    const commit = polishCommitSettings(next);
    expect(ProjectSettingsSchema.parse(commit)).toEqual(commit);

    // the placed audio clip survives the pass: the trim steps retime it
    // (Phase 9 W5) — removing two ranges from under a clip that spans
    // them SPLITS it into the pieces either side of the cuts, every piece
    // still carrying the same asset on the same track, total placed
    // duration shorter than the original 10 s. It is never dropped.
    const placed = commit.composition.audio.clips;
    expect(placed.length).toBeGreaterThanOrEqual(1);
    for (const clip of placed) {
      expect(clip.assetId).toBe("asset-music");
      expect(clip.trackId).toBe("music-1");
    }
    const placedMs = placed.reduce((a, c) => a + (c.sourceOutMs - c.sourceInMs), 0);
    expect(placedMs).toBeGreaterThan(0);
    expect(placedMs).toBeLessThan(10_000);
    const musicTrack = commit.composition.audio.tracks.find((t) => t.id === "music-1")!;
    expect(musicTrack.ducking.enabled).toBe(true);

    // export-readiness 2: the polished caption doc still builds subtitles —
    // the filler word the Polish trims removed is gone from the SRT too.
    expect(next.doc.words.map((w) => w.text)).not.toContain("um");
    const srt = toSrt(derivePages(next.doc, commit));
    expect(srt).toContain("hello");
    expect(srt).not.toContain("um");

    // export-readiness 3: every option the Export modal offers produces a
    // payload the create-export API accepts, built exactly as ExportModal
    // builds it (kind + crf, plus dims/fps for range-using kinds, with the
    // dims from the one shared exportDimsWithCanvas computation).
    const outDims = exportDimsWithCanvas({ width: 1080, height: 1920 }, null, "1080p");
    expect(outDims).toEqual({ width: 1080, height: 1920 });
    for (const o of EXPORT_OPTIONS) {
      const body = {
        kind: o.kind,
        crf: 24,
        ...(o.usesRange ? { width: outDims.width, height: outDims.height, fps: 30 } : {}),
      };
      expect(CreateExportBody.safeParse(body).success, `payload for ${o.kind}`).toBe(true);
    }

    // export-readiness 4 (memory ceiling, Part B4 at the frontend seam):
    // 2K/4K dims are computable, and an allocation failure at those
    // resolutions maps to the named plain-words message — the error path
    // is the feature; no real 2K/4K render is attempted here.
    expect(exportDimsWithCanvas({ width: 1080, height: 1920 }, null, "4k")).toEqual({ width: 2160, height: 3840 });
    const oom4k = exportMemoryErrorMessage(new Error("Failed to allocate 2160x3840 frame buffer"), "4k");
    expect(oom4k).toContain("ran out of memory");
    expect(oom4k).toContain("4K");
    expect(exportMemoryErrorMessage(new Error("Array buffer allocation failed"), "2k")).toContain("2K");
  });
});
