/**
 * Timeline keyboard access (overnight QA F-03, B-03): video/audio clips are
 * reachable by keyboard — tabIndex=0 with Enter/Space to select — and the
 * video trim handles announce real milliseconds, not seconds-as-ms.
 *
 * MA-A5-003: keyboard trim is now in scope — trim handles and caption-card
 * edge handles are focusable sliders with arrow-key handlers through the
 * same trim/retime APIs the pointer drags commit through.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMPOSITION_TRACKS } from "@capseasy/shared";
import type { Page, Word } from "@capseasy/shared";
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
  pages: [] as Page[], words: [] as Word[], durationMs: 6000, timeMs: 0, selectedId: null, peaks: null, waveState: "idle" as const,
  onSeek: vi.fn(), onSelect: vi.fn(), selectedWordIds: new Set<string>(), onWordSelectionChange: vi.fn(),
  onShiftWords: vi.fn(), onRetimeRun: vi.fn(), onRename: vi.fn(), onAddWord: () => null,
  onSplit: vi.fn(), onJoin: vi.fn(), onSplitAtPlayhead: vi.fn(), onOpenSettings: vi.fn(),
  selectedOverlayId: null, onSelectOverlay: vi.fn(), onMoveOverlay: vi.fn(),
};

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

describe("Timeline word-block keyboard selection (F-03 remainder)", () => {
  const words: Word[] = [
    { id: "w1", text: "hello", startMs: 500, endMs: 900 },
    { id: "w2", text: "world", startMs: 900, endMs: 1400 },
  ];

  const renderWithWords = (extra: Record<string, unknown> = {}) =>
    render(
      <Timeline
        {...baseProps}
        words={words}
        pages={[]}
        editorComp={editorComp}
        selectedVideoClipId={null}
        onSelectVideoClip={vi.fn()}
        {...extra}
      />,
    );

  it("word blocks are focusable buttons", () => {
    renderWithWords();
    const block = screen.getByRole("button", { name: /hello/ });
    expect(block.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("button", { name: /world/ }).getAttribute("tabindex")).toBe("0");
  });

  it("Enter on a word block selects it, exactly like a click", () => {
    const onSelect = vi.fn();
    const onSeek = vi.fn();
    renderWithWords({ onSelect, onSeek });
    fireEvent.keyDown(screen.getByRole("button", { name: /hello/ }), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("w1");
    expect(onSeek).toHaveBeenCalledWith(501);
  });

  it("Space on a word block selects it", () => {
    const onSelect = vi.fn();
    const onSeek = vi.fn();
    renderWithWords({ onSelect, onSeek });
    fireEvent.keyDown(screen.getByRole("button", { name: /world/ }), { key: " " });
    expect(onSelect).toHaveBeenCalledWith("w2");
    expect(onSeek).toHaveBeenCalledWith(901);
  });

  it("Space inside the rename input still types — it must not select the block", () => {
    const onSelect = vi.fn();
    const onSeek = vi.fn();
    renderWithWords({ onSelect, onSeek });
    const block = screen.getByRole("button", { name: /hello/ });
    // double-click opens the rename input inside the block
    fireEvent.doubleClick(block);
    const input = screen.getByLabelText("Word text") as HTMLInputElement;
    expect(input.value).toBe("hello");
    fireEvent.keyDown(input, { key: " " });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
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

  it("video trim handles carry the invisible hit-area expander (F-10 follow-up)", () => {
    render(
      <Timeline
        {...baseProps}
        editorComp={editorComp}
        selectedVideoClipId={null}
        onSelectVideoClip={vi.fn()}
        onTrimVideoEdge={vi.fn()}
      />,
    );
    const start = screen.getByRole("slider", { name: "Trim start of first segment" });
    const end = screen.getByRole("slider", { name: "Trim end of segment 1" });
    for (const handle of [start, end]) {
      expect(handle.className).toContain("before:-inset-x-2.5");
    }
  });

  it("MA-A5-003: trim handles are focusable and ArrowRight trims one frame via onTrimVideoEdge", () => {
    const onTrimVideoEdge = vi.fn();
    render(
      <Timeline
        {...baseProps}
        editorComp={editorComp}
        selectedVideoClipId={null}
        onSelectVideoClip={vi.fn()}
        onTrimVideoEdge={onTrimVideoEdge}
      />,
    );
    const end = screen.getByRole("slider", { name: "Trim end of segment 1" });
    expect(end.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(end, { key: "ArrowRight" });
    expect(onTrimVideoEdge).toHaveBeenCalledWith("a", "end", expect.closeTo(2000 + 1000 / 30, 0.01));
    fireEvent.keyDown(end, { key: "ArrowLeft", shiftKey: true });
    expect(onTrimVideoEdge).toHaveBeenCalledWith("a", "end", expect.closeTo(2000 - 10 * (1000 / 30), 0.01));
  });

  it("MA-A5-003: caption-card edge handles are focusable sliders and arrow keys retime the block", () => {
    const onRetimeRun = vi.fn();
    render(
      <Timeline
        {...baseProps}
        words={[
          // long spans: edge handles only render when the card is >16 px wide,
          // and jsdom measures a narrow view, so short words hide them
          { id: "w1", text: "hello", startMs: 500, endMs: 2500 },
          { id: "w2", text: "world", startMs: 2500, endMs: 4500 },
        ]}
        pages={[]}
        editorComp={editorComp}
        selectedVideoClipId={null}
        onSelectVideoClip={vi.fn()}
        onRetimeRun={onRetimeRun}
      />,
    );
    const start = screen.getByRole("slider", { name: "Move start of hello" });
    expect(start.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(start, { key: "ArrowLeft" });
    expect(onRetimeRun).toHaveBeenCalledWith("w1", "w1", 400, 2500, false);
    const end = screen.getByRole("slider", { name: "Move end of world" });
    fireEvent.keyDown(end, { key: "ArrowRight", shiftKey: true });
    expect(onRetimeRun).toHaveBeenCalledWith("w2", "w2", 2500, 5000, false);
  });
});
