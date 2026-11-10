import { describe, expect, it } from "vitest";
import {
  classifyDerivedAsset,
  clearProjectDerivedCache,
  collectReferencedAssetIds,
  planDerivedCleanup,
  previewBytesOf,
  summarizeDerivedCache,
  type DerivedAssetLike,
  type DerivedCacheStore,
} from "../derivedCache";
import type { MediaAssetKind } from "../mediaAssets";

/**
 * Slice 8.2: derived-cache lifecycle. Fixtures model the real producers —
 * source imports (mediaProbe writes thumb/peaks), reversed conforms and
 * freeze stills (segmentAssets), noise-suppressed WAVs (audio/denoise) —
 * across TWO projects, so every assertion can prove the other project and
 * all source media survive a cleanup untouched.
 */

const blob = (n: number) => new Blob([new Uint8Array(n)]);

interface Fixture extends DerivedAssetLike {
  blob: Blob;
}

const asset = (over: Partial<Fixture> & { id: string }): Fixture => ({
  projectId: "p1",
  kind: "video" as MediaAssetKind,
  name: "clip.mp4",
  size: 1000,
  thumb: null,
  peaks: null,
  blob: blob(1000),
  ...over,
});

const fixtures = (): Fixture[] => [
  // p1 source video with an embedded thumbnail preview (100 B thumb)
  asset({ id: "src-video", projectId: "p1", kind: "video", name: "Interview.mp4", size: 5000, blob: blob(5000), thumb: blob(100) }),
  // p1 source audio with embedded waveform peaks
  asset({ id: "src-audio", projectId: "p1", kind: "audio", name: "music.mp3", size: 2000, blob: blob(2000), peaks: [0.5, 0.25] }),
  // p1 REFERENCED reversed conform (a segment's assetId points at it)
  asset({ id: "rev-used", projectId: "p1", kind: "video", name: "Reversed — Interview.mp4", size: 4800, blob: blob(4800) }),
  // p1 UNREFERENCED reversed conform (its segment was removed)
  asset({ id: "rev-orphan", projectId: "p1", kind: "video", name: "Reversed — B-roll.mp4", size: 3000, blob: blob(3000) }),
  // p1 UNREFERENCED freeze still
  asset({ id: "freeze-orphan", projectId: "p1", kind: "image", name: "Interview — freeze at 1500ms.png", size: 700, blob: blob(700) }),
  // p1 UNREFERENCED noise-suppressed copy (suppression was switched off)
  asset({ id: "noise-orphan", projectId: "p1", kind: "audio", name: "Noise-suppressed audio.wav", size: 2600, blob: blob(2600) }),
  // p2: a source and its own referenced freeze still — must never be touched by a p1 cleanup
  asset({ id: "p2-src", projectId: "p2", kind: "video", name: "Podcast.mov", size: 9000, blob: blob(9000), thumb: blob(50) }),
  asset({ id: "p2-freeze", projectId: "p2", kind: "image", name: "Podcast — freeze at 500ms.png", size: 600, blob: blob(600) }),
];

const peaksBytes = (peaks: number[]) => JSON.stringify(peaks).length;

describe("classifyDerivedAsset", () => {
  it("recognises each producer's derived record by name + kind", () => {
    expect(classifyDerivedAsset({ kind: "video", name: "Reversed — x.mp4" })).toBe("reversed");
    expect(classifyDerivedAsset({ kind: "image", name: "x — freeze at 42ms.png" })).toBe("freeze");
    expect(classifyDerivedAsset({ kind: "audio", name: "Noise-suppressed audio.wav" })).toBe("noise-suppressed");
  });

  it("does not misclassify source media, even with a lookalike name in the wrong kind", () => {
    expect(classifyDerivedAsset({ kind: "video", name: "Interview.mp4" })).toBeNull();
    expect(classifyDerivedAsset({ kind: "audio", name: "Reversed — x.mp4" })).toBeNull();
    expect(classifyDerivedAsset({ kind: "video", name: "x — freeze at 42ms.png" })).toBeNull();
    expect(classifyDerivedAsset({ kind: "audio", name: "Noise-suppressed audio (1).wav" })).toBeNull();
  });
});

describe("previewBytesOf", () => {
  it("counts the thumbnail blob exactly plus the peaks at serialised size", () => {
    expect(previewBytesOf({ thumb: blob(100), peaks: null })).toBe(100);
    expect(previewBytesOf({ thumb: null, peaks: [0.5, 0.25] })).toBe(peaksBytes([0.5, 0.25]));
    expect(previewBytesOf({ thumb: null, peaks: null })).toBe(0);
    expect(previewBytesOf({ thumb: null, peaks: [] })).toBe(0);
  });
});

describe("summarizeDerivedCache", () => {
  it("accounts per kind and per project, plus the library-wide total", () => {
    const s = summarizeDerivedCache(fixtures());
    const p1 = s.projects.find((p) => p.projectId === "p1")!;
    const p2 = s.projects.find((p) => p.projectId === "p2")!;
    expect(p1.byKind.reversed).toBe(4800 + 3000);
    expect(p1.byKind.freeze).toBe(700);
    expect(p1.byKind["noise-suppressed"]).toBe(2600);
    expect(p1.byKind.previews).toBe(100 + peaksBytes([0.5, 0.25]));
    expect(p1.derivedAssetCount).toBe(4);
    expect(p1.previewRecordCount).toBe(2);
    expect(p2.byKind.freeze).toBe(600);
    expect(p2.byKind.previews).toBe(50);
    expect(s.totalBytes).toBe(p1.totalBytes + p2.totalBytes);
    expect(s.byKind.reversed).toBe(7800);
    // largest project first
    expect(s.projects[0]!.projectId).toBe("p1");
  });

  it("is zero for a bin with only plain source media", () => {
    const s = summarizeDerivedCache([asset({ id: "a" }), asset({ id: "b", projectId: "p2" })]);
    expect(s.totalBytes).toBe(0);
    expect(s.projects).toEqual([]);
  });
});

describe("collectReferencedAssetIds", () => {
  it("gathers segment, audio-clip, noise-suppression and overlay references, ignoring nulls", () => {
    const refs = collectReferencedAssetIds({
      composition: {
        videoSegments: [{ assetId: "rev-used" }, { assetId: null }, {}],
        audio: {
          clips: [{ assetId: "src-audio" }],
          noiseSuppressionAssetId: "noise-1",
        },
      },
      overlays: [{ assetId: "logo-1" }, {}],
    });
    expect([...refs].sort()).toEqual(["logo-1", "noise-1", "rev-used", "src-audio"]);
  });

  it("is empty for a project with no composition or overlays", () => {
    expect(collectReferencedAssetIds({}).size).toBe(0);
    expect(collectReferencedAssetIds({ composition: null, overlays: null }).size).toBe(0);
  });
});

describe("planDerivedCleanup", () => {
  it("deletes exactly the target project's UNREFERENCED derived records, by name", () => {
    const plan = planDerivedCleanup(fixtures(), "p1", new Set(["rev-used"]));
    expect(plan.deleteAssets.map((d) => d.id).sort()).toEqual(["freeze-orphan", "noise-orphan", "rev-orphan"]);
    expect(plan.deleteAssets.find((d) => d.id === "rev-orphan")!.name).toBe("Reversed — B-roll.mp4");
  });

  it("keeps a referenced derived record and NAMES it — referenced segments are never orphaned silently", () => {
    const plan = planDerivedCleanup(fixtures(), "p1", new Set(["rev-used"]));
    expect(plan.keptReferenced).toEqual([{ id: "rev-used", name: "Reversed — Interview.mp4", kind: "reversed", bytes: 4800 }]);
    expect(plan.deleteAssets.map((d) => d.id)).not.toContain("rev-used");
  });

  it("strips previews from records that stay (sources + kept referenced), never deletes a source", () => {
    const plan = planDerivedCleanup(fixtures(), "p1", new Set(["rev-used"]));
    expect(plan.stripPreviewAssetIds.sort()).toEqual(["src-audio", "src-video"]);
    expect(plan.stripPreviewBytes).toBe(100 + peaksBytes([0.5, 0.25]));
    expect(plan.deleteAssets.map((d) => d.id)).not.toContain("src-video");
    expect(plan.deleteAssets.map((d) => d.id)).not.toContain("src-audio");
  });

  it("never plans anything for another project", () => {
    const plan = planDerivedCleanup(fixtures(), "p1", new Set());
    const ids = [...plan.deleteAssets.map((d) => d.id), ...plan.stripPreviewAssetIds, ...plan.keptReferenced.map((d) => d.id)];
    expect(ids.some((id) => id.startsWith("p2-"))).toBe(false);
  });

  it("expected freed bytes = deleted records (+ their bytes) + stripped previews", () => {
    const plan = planDerivedCleanup(fixtures(), "p1", new Set(["rev-used"]));
    expect(plan.expectedFreedBytes).toBe(3000 + 700 + 2600 + 100 + peaksBytes([0.5, 0.25]));
  });
});

/** In-memory store double implementing the executor's seam (the repo has no IndexedDB test double). */
function fakeStore(initial: Fixture[]): DerivedCacheStore<Fixture> & { records: Map<string, Fixture> } {
  const records = new Map(initial.map((a) => [a.id, { ...a }]));
  return {
    records,
    listAll: () => Promise.resolve([...records.values()]),
    deleteAsset: (id) => { records.delete(id); return Promise.resolve(); },
    clearPreviews: (id) => {
      const r = records.get(id);
      if (r) records.set(id, { ...r, thumb: null, peaks: null });
      return Promise.resolve();
    },
  };
}

describe("clearProjectDerivedCache (executor)", () => {
  it("deletes exactly the derived set for the target project and nothing else", async () => {
    const store = fakeStore(fixtures());
    const result = await clearProjectDerivedCache(store, "p1", new Set(["rev-used"]));

    // deleted: the three unreferenced derived records of p1
    for (const id of ["rev-orphan", "freeze-orphan", "noise-orphan"]) expect(store.records.has(id)).toBe(false);
    // kept: the referenced reversed conform, with its bytes intact
    expect(store.records.get("rev-used")!.blob.size).toBe(4800);
    // source media stays, blob intact, only its previews were stripped
    const src = store.records.get("src-video")!;
    expect(src.blob.size).toBe(5000);
    expect(src.thumb).toBeNull();
    const audio = store.records.get("src-audio")!;
    expect(audio.blob.size).toBe(2000);
    expect(audio.peaks).toBeNull();
    // other project completely untouched — records, derived assets AND previews
    expect(store.records.get("p2-src")!.thumb!.size).toBe(50);
    expect(store.records.get("p2-freeze")!.blob.size).toBe(600);
    expect(result.remaining.filter((a) => a.projectId === "p2")).toHaveLength(2);
  });

  it("re-measures after deleting: freed bytes are measured, and the project's derived cache is really smaller", async () => {
    const store = fakeStore(fixtures());
    const result = await clearProjectDerivedCache(store, "p1", new Set(["rev-used"]));
    expect(result.beforeBytes).toBe(4800 + 3000 + 700 + 2600 + 100 + peaksBytes([0.5, 0.25]));
    // only the kept referenced conform remains as p1 derived bytes
    expect(result.afterBytes).toBe(4800);
    expect(result.freedBytes).toBe(result.beforeBytes - result.afterBytes);
    expect(result.freedBytes).toBe(result.plan.expectedFreedBytes);
    // and a fresh summary over the remaining listing agrees with the re-measurement
    const after = summarizeDerivedCache(result.remaining);
    expect(after.projects.find((p) => p.projectId === "p1")!.totalBytes).toBe(result.afterBytes);
  });

  it("with everything referenced, deletes nothing and strips only previews", async () => {
    const store = fakeStore(fixtures());
    const all = new Set(["rev-used", "rev-orphan", "freeze-orphan", "noise-orphan"]);
    const result = await clearProjectDerivedCache(store, "p1", all);
    expect(result.plan.deleteAssets).toEqual([]);
    expect(result.plan.keptReferenced.map((k) => k.id).sort()).toEqual(["freeze-orphan", "noise-orphan", "rev-orphan", "rev-used"]);
    expect(store.records.size).toBe(8);
    expect(result.freedBytes).toBe(100 + peaksBytes([0.5, 0.25]));
  });
});
