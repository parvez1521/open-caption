/**
 * Timeline segment badges (Run 2): the video track's blocks dress themselves from the
 * segment's Run-2 fields — still image / Freeze label, "Reversed", "2×", and the
 * transition chip at the left boundary. The badge DATA is pure (segmentBadges, tested in
 * segmentView.test.ts); this test pins that the Timeline actually renders it.
 */
import React from "react";
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMPOSITION_TRACKS } from "@capseasy/shared";
import { Timeline } from "../Timeline";
import type { EditorComposition } from "../compositionDoc";

class FakeRO { observe() {} unobserve() {} disconnect() {} }

beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeRO;
});

const editorComp: EditorComposition = {
  version: 1,
  durationMs: 6000,
  sourceDurationMs: 10000,
  rangeStartMs: 0,
  videoClips: [
    { id: "a", kind: "video", startMs: 0, durationMs: 2000, sourceInMs: 0, sourceOutMs: 4000, playbackRate: 2, transitionIn: null, assetId: null, still: false } as never,
    { id: "b", kind: "video", startMs: 2000, durationMs: 2000, sourceInMs: 0, sourceOutMs: 2000, playbackRate: 1, transitionIn: null, assetId: "freeze-1", still: true } as never,
    { id: "c", kind: "video", startMs: 4000, durationMs: 2000, sourceInMs: 6000, sourceOutMs: 8000, playbackRate: 1, transitionIn: { type: "fade", durationMs: 300 }, assetId: "rev-1", still: false } as never,
  ],
  captionClips: [],
  overlayClips: [],
  markers: [],
  trackState: structuredClone(DEFAULT_COMPOSITION_TRACKS),
  audioTracks: [],
  audioClips: [],
  audioMaster: { volume: 1, videoVolume: 1, compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 } },
  audioBleeps: [], audioNoiseSuppressionAssetId: null,
};

describe("Timeline segment badges", () => {
  it("renders rate, freeze, reversed and transition dressing on the video blocks", () => {
    const view = render(
      <Timeline
        pages={[]}
        words={[]}
        durationMs={6000}
        timeMs={0}
        selectedId={null}
        peaks={null}
        waveState="idle"
        onSeek={vi.fn()}
        onSelect={vi.fn()}
        selectedWordIds={new Set()}
        onWordSelectionChange={vi.fn()}
        onShiftWords={vi.fn()}
        onRetimeRun={vi.fn()}
        onRename={vi.fn()}
        onAddWord={() => null}
        onSplit={vi.fn()}
        onJoin={vi.fn()}
        onSplitAtPlayhead={vi.fn()}
        onOpenSettings={vi.fn()}
        selectedOverlayId={null}
        onSelectOverlay={vi.fn()}
        onMoveOverlay={vi.fn()}
        editorComp={editorComp}
        selectedVideoClipId={null}
        onSelectVideoClip={vi.fn()}
        segmentAssetUrls={{ "freeze-1": "blob:freeze" }}
        segmentAssetNames={{ "rev-1": "Reversed — clip.mp4", "freeze-1": "clip — freeze at 1000ms.png" }}
      />,
    );
    const text = view.container.textContent ?? "";
    expect(text).toContain("2×");
    expect(text).toContain("Freeze");
    expect(text).toContain("Reversed");
    expect(text).toContain("Fade 300ms");
    // the still block shows its image when the asset resolves on this device
    const img = view.container.querySelector('img[src="blob:freeze"]');
    expect(img).toBeTruthy();
    // the still block is labelled for assistive tech as a freeze segment
    expect(view.container.querySelector('[aria-label="Freeze frame segment 2"]')).toBeTruthy();
  });

  it("an unresolved still renders as a labelled Freeze block, not a broken image", () => {
    const view = render(
      <Timeline
        pages={[]} words={[]} durationMs={6000} timeMs={0} selectedId={null} peaks={null} waveState="idle"
        onSeek={vi.fn()} onSelect={vi.fn()} selectedWordIds={new Set()} onWordSelectionChange={vi.fn()}
        onShiftWords={vi.fn()} onRetimeRun={vi.fn()} onRename={vi.fn()} onAddWord={() => null}
        onSplit={vi.fn()} onJoin={vi.fn()} onSplitAtPlayhead={vi.fn()} onOpenSettings={vi.fn()}
        selectedOverlayId={null} onSelectOverlay={vi.fn()} onMoveOverlay={vi.fn()}
        editorComp={editorComp} selectedVideoClipId={null} onSelectVideoClip={vi.fn()}
        segmentAssetUrls={{}} segmentAssetNames={{}}
      />,
    );
    expect(view.container.textContent).toContain("Freeze frame");
    expect(view.container.querySelector('img[src="blob:freeze"]')).toBeNull();
  });
});
