/**
 * Phase 2B pro precision: the timeline toolbar steps exactly one frame and
 * takes a typed timecode. Render-level pins on top of the pure timecode tests.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Timeline } from "../Timeline";
import { frameDurationMs } from "../timecode";

class FakeRO {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe() {
    this.cb([], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeRO;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 1200;
    },
  });
});

function renderTimeline(timeMs = 0, fps = 30) {
  const onSeek = vi.fn();
  render(
    <Timeline
      pages={[]}
      words={[]}
      durationMs={60000}
      timeMs={timeMs}
      fps={fps}
      selectedId={null}
      peaks={null}
      waveState="idle"
      onSeek={onSeek}
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
    />,
  );
  const tc = screen.getByLabelText("Playhead timecode (hours:minutes:seconds:frames)") as HTMLInputElement;
  return { onSeek, tc };
}

describe("Timeline frame-step + timecode entry", () => {
  it("shows the playhead as HH:MM:SS:FF", () => {
    const { tc } = renderTimeline(61000, 30);
    expect(tc.value).toBe("00:01:01:00");
  });

  it("Next frame seeks exactly one frame forward at the project fps", () => {
    const { onSeek } = renderTimeline(0, 30);
    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek.mock.calls[0][0]).toBeCloseTo(frameDurationMs(30), 9);
  });

  it("Previous frame is disabled at 0", () => {
    const { onSeek } = renderTimeline(0, 30);
    expect(screen.getByRole("button", { name: "Previous frame" })).toBeDisabled();
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("Previous frame seeks exactly one frame back at the project fps", () => {
    const { onSeek } = renderTimeline(1000, 60);
    fireEvent.click(screen.getByRole("button", { name: "Previous frame" }));
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek.mock.calls[0][0]).toBeCloseTo(1000 - frameDurationMs(60), 9);
  });

  it("typing a timecode and pressing Enter seeks there", () => {
    const { onSeek, tc } = renderTimeline(0, 30);
    fireEvent.change(tc, { target: { value: "00:00:02:15" } });
    fireEvent.keyDown(tc, { key: "Enter" });
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek.mock.calls[0][0]).toBeCloseTo(2000 + 15 * frameDurationMs(30), 9);
  });

  it("a malformed timecode reverts without seeking", () => {
    const { onSeek, tc } = renderTimeline(1000, 30);
    fireEvent.change(tc, { target: { value: "not-a-time" } });
    fireEvent.blur(tc);
    expect(onSeek).not.toHaveBeenCalled();
    expect(tc.value).toBe("00:00:01:00");
  });
});
