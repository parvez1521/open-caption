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

  it("MA-A5-009: the cut-marker buttons carry the 24px+ hit expander", () => {
    const { getByRole } = renderTimeline(threeClipComp);
    const marker = getByRole("button", { name: "Cut after Clip 1" }) as HTMLButtonElement;
    // 18x14px join marker with before:-inset-2 expands the hit area to 34x30px
    expect(marker.className).toContain("before:-inset-2");
  });

  it("a single clip has no cut markers", () => {
    const { queryByRole } = renderTimeline(oneClipComp);
    expect(queryByRole("button", { name: /Cut after Clip/ })).toBeNull();
  });
});

describe("Timeline video-row drop target (CAP-T09)", () => {
  const payload = JSON.stringify({ type: "dissolve-cross", durationMs: 300 });
  const drag = { types: [TRANSITION_DRAG_MIME], getData: (t: string) => (t === TRANSITION_DRAG_MIME ? payload : "") };
  function dragEvent(type: string, clientX: number): Event {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX }) as MouseEvent & { dataTransfer?: unknown };
    Object.defineProperty(ev, "dataTransfer", { value: drag });
    return ev;
  }
  // jsdom's DragEvent constructor drops clientX, so drag events are built as
  // MouseEvents above. ResizeObserver never fires, so the tier stays "wide"
  // (LABEL_W 148) and viewW stays 0 (pxPerMs = 200/6000 = 1/30 at zoom 1).
  // A cut's marker renders at left x(cutMs); the scroll container's
  // scrollLeft is live-read (jsdom's zero clientWidth leaves it at 49.33).
  function clientXNear(marker: HTMLElement, dxPx: number): number {
    const scroller = marker.closest(".overflow-auto") as HTMLElement;
    return 148 - scroller.scrollLeft + parseFloat(marker.style.left || "0") + dxPx;
  }

  it("dropping a card on the video row near a cut applies it at that cut", () => {
    const { getByRole, onDropTransition } = renderTimeline(threeClipComp);
    const marker = getByRole("button", { name: "Cut after Clip 1" });
    fireEvent(marker.parentElement!, dragEvent("drop", clientXNear(marker, 5)));
    expect(onDropTransition).toHaveBeenCalledTimes(1);
    expect(onDropTransition).toHaveBeenCalledWith("b", { type: "dissolve-cross", durationMs: 300 });
  });

  it("dropping on the row far from any cut does nothing", () => {
    const { getByRole, onDropTransition } = renderTimeline(threeClipComp);
    const marker = getByRole("button", { name: "Cut after Clip 1" });
    // 50 px past cut 1: 16.7 px from cut 2 — outside the 14 px snap radius
    fireEvent(marker.parentElement!, dragEvent("drop", clientXNear(marker, 50)));
    expect(onDropTransition).not.toHaveBeenCalled();
  });

  it("dragging over the row near a cut highlights that cut's marker until the drag leaves", () => {
    const { getByRole } = renderTimeline(threeClipComp);
    const marker = getByRole("button", { name: "Cut after Clip 1" });
    expect(marker.querySelector("span")!.className).not.toContain("bg-st-em");
    fireEvent(marker.parentElement!, dragEvent("dragover", clientXNear(marker, 5)));
    expect(marker.querySelector("span")!.className).toContain("bg-st-em");
    fireEvent(marker.parentElement!, dragEvent("dragleave", clientXNear(marker, 5)));
    expect(marker.querySelector("span")!.className).not.toContain("bg-st-em");
  });
});
