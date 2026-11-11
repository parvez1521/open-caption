import { describe, expect, it, vi, beforeEach } from "vitest";
import { CaptionDocSchema, type CaptionDoc } from "@capseasy/shared";
import { clipTargetCount, type RankedClipProposal } from "./clipper";
import { elementSuggestionsFor } from "./suggestions";
import { brollQueryFor, brollSearchUrl, mapBrollHits } from "./broll";

/**
 * Package 3 item I — the clip-count rule, the element-suggestion rules, the B-roll
 * mapping, and (in the second half) the unticked-by-default gate at creation time.
 */

describe("clipTargetCount (I.2: ~1 per 6 min, min 3, max 8, never more than supported)", () => {
  const cases: [number, number, number][] = [
    // [durationMs, available, expected]
    [30_000, 10, 3], // short video still gets the minimum…
    [30_000, 2, 2], // …unless detection only supports 2
    [30_000, 0, 0],
    [6 * 60_000, 10, 3], // 6 min → round(1) → clamped up to the min of 3
    [24 * 60_000, 10, 4], // 24 min → 4
    [36 * 60_000, 10, 6], // 36 min → 6
    [60 * 60_000, 20, 8], // 60 min → 10, clamped to the max of 8
    [120 * 60_000, 5, 5], // signals support only 5 → 5
    [0, 7, 3], // unknown duration → the minimum, still capped by support
  ];
  for (const [dur, avail, want] of cases) {
    it(`duration ${dur}ms, available ${avail} → ${want}`, () => {
      expect(clipTargetCount(dur, avail)).toBe(want);
    });
  }
});

const signals = (hookDetected = false): RankedClipProposal["signals"] => ({
  hook: { detected: hookDetected, kinds: hookDetected ? ["claim"] : [], matched: hookDetected ? "changes" : null, openingText: "this trick changes" },
  pauseCount: 0,
  pausesPerMinute: 0,
  wordCount: 60,
  wordRateWpm: 150,
  wordsPerSecond: 2,
  sceneChangeCount: 0,
  silenceMsInside: 0,
  startBoundary: { atMs: 60_000, silenceDistanceMs: null, sceneDistanceMs: null, aligned: false, label: "" },
  endBoundary: { atMs: 90_000, silenceDistanceMs: null, sceneDistanceMs: null, aligned: false, label: "" },
  alignedBoundaryCount: 0,
});

const proposal = (over: Partial<RankedClipProposal> = {}): RankedClipProposal => ({
  startMs: 60_000,
  endMs: 90_000,
  durationMs: 30_000,
  wordCount: 60,
  text: "this trick changes everything for your videos today",
  rank: 1,
  signals: signals(),
  explanation: "",
  ...over,
});

describe("elementSuggestionsFor (I.3: deterministic rules, 2–4 items, clip-relative)", () => {
  it("always offers the hook text from the first four words, at the clip start", () => {
    const s = elementSuggestionsFor(proposal(), { mediaDurationMs: 600_000 });
    const hook = s.find((x) => x.id === "hook")!;
    expect(hook.item.kind).toBe("text");
    expect(hook.item.text).toBe("this trick changes everything");
    expect(hook.item.startMs).toBe(0);
  });
  it("a 30s mid-video clip gets hook + subscribe (≥2, ≤4), all inside the clip window", () => {
    const s = elementSuggestionsFor(proposal(), { mediaDurationMs: 600_000 });
    expect(s.map((x) => x.id)).toEqual(["hook", "subscribe"]);
    for (const x of s) {
      expect(x.item.startMs).toBeGreaterThanOrEqual(0);
      expect(x.item.endMs).toBeLessThanOrEqual(30_000);
      expect(x.item.endMs).toBeGreaterThan(x.item.startMs);
    }
  });
  it("a short clip still gets two suggestions (like pop fills in)", () => {
    const s = elementSuggestionsFor(proposal({ startMs: 0, endMs: 10_000, durationMs: 10_000 }), { mediaDurationMs: 600_000 });
    expect(s.length).toBe(2);
    expect(s.map((x) => x.id)).toContain("like");
  });
  it("an outro clip gets the follow card, and subscribe moves earlier to make room", () => {
    const s = elementSuggestionsFor(proposal({ startMs: 570_000, endMs: 600_000, durationMs: 30_000 }), { mediaDurationMs: 600_000 });
    expect(s.map((x) => x.id)).toContain("follow");
    const sub = s.find((x) => x.id === "subscribe")!;
    const fol = s.find((x) => x.id === "follow")!;
    expect(sub.item.endMs).toBeLessThanOrEqual(fol.item.startMs);
  });
  it("the lower third appears only when the clip has a title", () => {
    expect(elementSuggestionsFor(proposal(), { mediaDurationMs: 600_000 }).map((x) => x.id)).not.toContain("lower-third");
    const withTitle = elementSuggestionsFor(proposal(), { mediaDurationMs: 600_000, title: "My Clip Title" });
    const lt = withTitle.find((x) => x.id === "lower-third")!;
    expect(lt.item.text).toBe("My Clip Title");
  });
  it("never returns more than four", () => {
    const s = elementSuggestionsFor(
      proposal({ startMs: 570_000, endMs: 600_000, durationMs: 30_000, signals: signals(true) }),
      { mediaDurationMs: 600_000, title: "T" },
    );
    expect(s.length).toBe(4);
  });
});

describe("B-roll query + mapping (I.4)", () => {
  it("builds query terms from content words only", () => {
    expect(brollQueryFor("How to make your videos look amazing today")).toBe("make videos look");
    expect(brollQueryFor("the a an")).toBe("video");
  });
  it("searches the Pixabay videos endpoint on the one allowed host", () => {
    const u = new URL(brollSearchUrl("ocean waves", "KEY123"));
    expect(u.host).toBe("api.pixabay.com");
    expect(u.pathname).toBe("/api/videos/");
    expect(u.searchParams.get("q")).toBe("ocean waves");
    expect(u.searchParams.get("key")).toBe("KEY123");
  });
  it("maps hits to thumbnails + files, skipping unusable hits", () => {
    const out = mapBrollHits({
      hits: [
        { id: 1, pageURL: "https://pixabay.com/videos/1", tags: "ocean, waves", duration: 12, user: "bob", videos: { medium: { url: "https://cdn/m.mp4", width: 1280, height: 720, thumbnail: "https://cdn/t.jpg" } } },
        { id: 2, pageURL: "https://pixabay.com/videos/2", videos: {} },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 1, previewUrl: "https://cdn/t.jpg", fileUrl: "https://cdn/m.mp4", durationSec: 12, user: "bob" });
  });
});

// ---- the creation gate: unticked elements NEVER reach the new project
const createClip = vi.fn();
const getStudio = vi.fn();
const savePatch = vi.fn();
const saveAsset = vi.fn();
vi.mock("@/services/studio", () => ({
  studioService: {
    createClip: (...a: unknown[]) => createClip(...a),
    getStudio: (...a: unknown[]) => getStudio(...a),
    savePatch: (...a: unknown[]) => savePatch(...a),
  },
}));
vi.mock("@/features/upload/localVideos", () => ({ getLocalVideo: vi.fn(async () => null), saveLocalVideo: vi.fn(async () => undefined) }));
vi.mock("@/features/studio/mediaProbe", () => ({ probeMediaFile: vi.fn(async () => ({ durationMs: 5000, width: 1280, height: 720, thumb: null, peaks: null })) }));
vi.mock("@/features/studio/mediaStore", () => ({ saveAsset: (...a: unknown[]) => saveAsset(...a) }));

import { createClipProject } from "./clipper";

const doc: CaptionDoc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w1", text: "hello", startMs: 0, endMs: 400 },
    { id: "w2", text: "world", startMs: 420, endMs: 900 },
  ],
});

describe("createClipProject — the tick gate (I.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClip.mockResolvedValue({ project: { id: "new-1", title: "Clip" }, videoId: null });
    getStudio.mockResolvedValue({ project: { settings_json: {} } });
    savePatch.mockResolvedValue({});
    saveAsset.mockResolvedValue(undefined);
  });
  const base = { sourceProjectId: "src-1", sourceTitle: "Source", sourceVideoId: null, doc, startMs: 0, endMs: 900 };

  it("with NO elements (nothing ticked), no settings write happens at all", async () => {
    const r = await createClipProject({ ...base });
    expect(r.projectId).toBe("new-1");
    expect(savePatch).not.toHaveBeenCalled();
    expect(getStudio).not.toHaveBeenCalled();
  });
  it("with an explicitly empty elements list, still no settings write", async () => {
    await createClipProject({ ...base, elements: [] });
    expect(savePatch).not.toHaveBeenCalled();
  });
  it("ticked elements are appended to the new project's overlays", async () => {
    const item = { id: "ov1", kind: "text" as const, text: "hook", startMs: 0, endMs: 2000, x: 0.5, y: 0.3, scale: 1, rotation: 0, color: "#FFFFFF" };
    await createClipProject({ ...base, elements: [item] });
    expect(savePatch).toHaveBeenCalledTimes(1);
    const [pid, patch] = savePatch.mock.calls[0] as [string, { settings_json: { overlays: unknown[] } }];
    expect(pid).toBe("new-1");
    expect(patch.settings_json.overlays).toEqual([item]);
  });
  it("a failing elements write surfaces as a warning, not silence", async () => {
    savePatch.mockRejectedValue(new Error("offline"));
    const item = { id: "ov1", kind: "text" as const, text: "hook", startMs: 0, endMs: 2000, x: 0.5, y: 0.3, scale: 1, rotation: 0, color: "#FFFFFF" };
    const r = await createClipProject({ ...base, elements: [item] });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("ticked elements");
  });
});

import React from "react";
import { render, screen } from "@testing-library/react";
import { ClipperLaunchCard } from "../studio/panels/ClipperLaunchCard";
import { NAV_ITEMS } from "@/components/studio/nav";

describe("Clipper launch behaviour (I.1)", () => {
  it("the main-nav Clipper entry opens in a new tab; the other entries do not", () => {
    const clipper = NAV_ITEMS.find((i) => i.id === "clipper")!;
    expect(clipper.newTab).toBe(true);
    expect(NAV_ITEMS.filter((i) => i.newTab).map((i) => i.id)).toEqual(["clipper"]);
  });
  it("the Studio launch card links to the standalone Clipper for THIS project, in a new tab", () => {
    render(<ClipperLaunchCard projectId="proj-9" />);
    const link = screen.getByRole("link", { name: "Open Clipper" });
    expect(link.getAttribute("href")).toBe("/clipper?project=proj-9");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
