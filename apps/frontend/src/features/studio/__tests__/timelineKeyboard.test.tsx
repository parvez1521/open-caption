/**
 * Timeline keyboard access (overnight QA F-03, B-03): video/audio clips are
 * reachable by keyboard — tabIndex=0 with Enter/Space to select — and the
 * video trim handles announce real milliseconds, not seconds-as-ms.
 *
 * Scoped fix only: selection via keyboard + the SegmentInspector numeric
 * controls is the keyboard path; keyboard drag/trim is out of scope.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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
    { id: "a", kind: "video", startMs: 0, durationMs: 2000, sourceInMs: 0, sourceOutMs: 4000, playbackRate: 1, transitionIn: null, assetId: null, still: false } as never,
    { id: "b", kind: "video", startMs: 2000, durationMs: 4000, sourceInMs: 0, sourceOutMs: 4000, playbackRate: 1, transitionIn: null, assetId: null, still: false } as never,
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

const baseProps = {
  pages: [], words: [], durationMs: 6000, timeMs: 0, selectedId: null, peaks: null, waveState: "idle",
  onSeek: vi.fn(), onSelect: vi.fn(), selectedWordIds: new Set(), onWordSelectionChange: vi.fn(),
  onShiftWords: vi.fn(), onRetimeRun: vi.fn(), onRename: vi.fn(), onAddWord: () => null,
  onSplit: vi.fn(), onJoin: vi.fn(), onSplitAtPlayhead: vi.fn(), onOpenSettings: vi.fn(),
  selectedOverlayId: null, onSelectOverlay: vi.fn(), onMoveOverlay: vi.fn(),
} as const;

describe("Timeline clip keyboard selection (F-03)", () => {
  it("Enter on a video segment selects it", () => {
    const onSelectVideoClip = vi.fn();
    render(
      <Timeline {...baseProps} editorComp={editorComp} selectedVideoClipId={null} onSelectVideoClip={onSelectVideoClip} />,
    );
    const clip = screen.getByRole("button", { name: "Video segment 1" });
    expect(clip.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(clip, { key: "Enter" });
    expect(onSelectVideoClip).toHaveBeenCalledWith("a");
  });

  it("Space on a video segment selects it", () => {
    const onSelectVideoClip = vi.fn();
    render(
      <Timeline {...baseProps} editorComp={editorComp} selectedVideoClipId={null} onSelectVideoClip={onSelectVideoClip} />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Video segment 2" }), { key: " " });
    expect(onSelectVideoClip).toHaveBeenCalledWith("b");
  });

  it("Enter on an audio clip selects it", () => {
    const onSelectAudioClip = vi.fn();
    render(
      <Timeline
        {...baseProps}
        editorComp={editorComp}
        selectedVideoClipId={null}
        onSelectVideoClip={vi.fn()}
        audioTracks={[{ id: "t1", name: "Music", role: "music", volume: 1, muted: false, locked: false, ducking: { enabled: false, amountDb: 12, thresholdDb: -42 } }]}
        audioClips={[{ id: "ac1", assetId: "song", assetName: "song.mp3", trackId: "t1", startMs: 0, sourceInMs: 0, sourceOutMs: 4000, volume: 1, fadeInMs: 0, fadeOutMs: 0 } as never]}
        selectedAudioClipId={null}
        onSelectAudioClip={onSelectAudioClip}
      />,
    );
    const clip = screen.getByRole("button", { name: "Audio clip song.mp3" });
    expect(clip.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(clip, { key: "Enter" });
    expect(onSelectAudioClip).toHaveBeenCalledWith("ac1");
  });
});

describe("Timeline video trim handle times (B-03)", () => {
  it("announces the trim point in real milliseconds, not seconds divided by 1000", () => {
    render(
      <Timeline
        {...baseProps}
        editorComp={editorComp}
        selectedVideoClipId={null}
        onSelectVideoClip={vi.fn()}
        onTrimVideoEdge={vi.fn()}
      />,
    );
    // clip a ends at 2000ms → "0:02.0"; the /1000 bug announced "0:00.0"
    const end = screen.getByRole("slider", { name: "Trim end of segment 1" });
    expect(end.getAttribute("aria-valuetext")).toBe("0:02.0");
    expect(end.getAttribute("aria-valuenow")).toBe("2000");
  });
});
