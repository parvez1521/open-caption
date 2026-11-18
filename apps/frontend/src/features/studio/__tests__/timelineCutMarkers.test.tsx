/**
 * Timeline cut markers (Studio revision phase 2): one marker per join, on
 * the video track at the boundary where the next clip starts. A click
 * selects the join (the clip after the cut); a transition card dropped on
 * one applies at that cut. A single clip has no joins and no markers.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMPOSITION_TRACKS } from "@capseasy/shared";
import { Timeline } from "../Timeline";
import { TRANSITION_DRAG_MIME } from "../panels/TransitionsPanel";
import type { EditorComposition } from "../compositionDoc";

class FakeRO { observe() {} unobserve() {} disconnect() {} }

beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeRO;
});

const threeClipComp: EditorComposition = {
  version: 1,
  durationMs: 6000,
  sourceDurationMs: 10000,
  rangeStartMs: 0,
  videoClips: [
    { id: "a", kind: "video", startMs: 0, durationMs: 2000, sourceInMs: 0, sourceOutMs: 2000, playbackRate: 1, transitionIn: null, assetId: null, still: false } as never,
    { id: "b", kind: "video", startMs: 2000, durationMs: 2000, sourceInMs: 2000, sourceOutMs: 4000, playbackRate: 1, transitionIn: null, assetId: null, still: false } as never,
    { id: "c", kind: "video", startMs: 4000, durationMs: 2000, sourceInMs: 4000, sourceOutMs: 6000, playbackRate: 1, transitionIn: { type: "fade", durationMs: 300 }, assetId: null, still: false } as never,
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

const oneClipComp: EditorComposition = {
  ...threeClipComp,
  durationMs: 2000,
  videoClips: [threeClipComp.videoClips[0]!],
};

function renderTimeline(editorComp: EditorComposition, overrides: Partial<React.ComponentProps<typeof Timeline>> = {}) {
  const onSelectJoin = vi.fn();
  const onDropTransition = vi.fn();
  const view = render(
    <Timeline
      pages={[]}
      words={[]}
      durationMs={editorComp.durationMs}
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
      onSelectJoin={onSelectJoin}
      onDropTransition={onDropTransition}
      {...overrides}
    />,
  );
  return { ...view, onSelectJoin, onDropTransition };
}

describe("Timeline cut markers", () => {
  it("renders one marker per join, labelled by the clip before the cut", () => {
    const { getByRole, queryByRole } = renderTimeline(threeClipComp);
    expect(getByRole("button", { name: "Cut after Clip 1" })).toBeTruthy();
    expect(getByRole("button", { name: "Cut after Clip 2" })).toBeTruthy();
    expect(queryByRole("button", { name: "Cut after Clip 3" })).toBeNull();
    expect(queryByRole("button", { name: "Cut after Clip 0" })).toBeNull();
  });

  it("clicking a marker selects that join — the clip after the cut", () => {
    const { getByRole, onSelectJoin } = renderTimeline(threeClipComp);
    fireEvent.click(getByRole("button", { name: "Cut after Clip 2" }));
    expect(onSelectJoin).toHaveBeenCalledTimes(1);
    expect(onSelectJoin).toHaveBeenCalledWith("c");
  });

  it("the selected join's marker is pressed", () => {
    const { getByRole } = renderTimeline(threeClipComp, { selectedJoinClipId: "b" });
    expect((getByRole("button", { name: "Cut after Clip 1" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
    expect((getByRole("button", { name: "Cut after Clip 2" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("false");
  });

  it("dropping a transition card on a marker applies it at that cut", () => {
    const { getByRole, onDropTransition } = renderTimeline(threeClipComp);
    const marker = getByRole("button", { name: "Cut after Clip 1" });
    const payload = JSON.stringify({ type: "wipe-left", durationMs: 400 });
    fireEvent.dragOver(marker, {
      dataTransfer: { types: [TRANSITION_DRAG_MIME], getData: () => payload },
    });
    fireEvent.drop(marker, {
      dataTransfer: { types: [TRANSITION_DRAG_MIME], getData: (t: string) => (t === TRANSITION_DRAG_MIME ? payload : "") },
    });
    expect(onDropTransition).toHaveBeenCalledTimes(1);
    expect(onDropTransition).toHaveBeenCalledWith("b", { type: "wipe-left", durationMs: 400 });
  });

  it("dropping anything else on a marker does nothing", () => {
    const { getByRole, onDropTransition } = renderTimeline(threeClipComp);
    const marker = getByRole("button", { name: "Cut after Clip 1" });
    fireEvent.drop(marker, {
      dataTransfer: { types: ["text/plain"], getData: () => "not a transition" },
    });
    expect(onDropTransition).not.toHaveBeenCalled();
  });

  it("a single clip has no cut markers", () => {
    const { queryByRole } = renderTimeline(oneClipComp);
    expect(queryByRole("button", { name: /Cut after Clip/ })).toBeNull();
  });
});
