/**
 * Timeline edge-resize commit bug (owner video 2026-11-13): dragging a caption card's
 * right edge previews the longer card while dragging but the card snaps back to its
 * original end on release — the retime never commits. This pins the commit path:
 * pointerdown on the end handle -> pointermove -> pointerup must call onRetimeRun
 * once with the dragged end.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Page, Word } from "@capseasy/shared";
import { Timeline } from "../Timeline";

let mockWidth = 1200;

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
      return mockWidth;
    },
  });
  // jsdom has no pointer capture; the drag code calls it on the handle
  for (const name of ["setPointerCapture", "releasePointerCapture"] as const) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: () => {} });
  }
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
});

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });

const page = (id: string, words: Word[]): Page => ({
  id,
  startMs: words[0]!.startMs,
  endMs: words[words.length - 1]!.endMs,
  words,
  lines: [words],
  heroIndex: 0,
  emotion: "neutral",
  position: null,
  styleOverride: null,
});

const page1 = page("p1", [
  word("w1", "hi", 14400, 14700),
  word("w2", "jagah", 14700, 15000),
  word("w3", "rah", 15000, 15300),
  word("w4", "rahi", 15300, 15600),
  word("w5", "ho,", 15600, 15900),
]);
const page2 = page("p2", [
  word("w6", "mein", 20300, 20600),
  word("w7", "aur", 20600, 20900),
  word("w8", "raat", 20900, 21200),
]);

beforeEach(() => {
  mockWidth = 1200;
  localStorage.setItem("ce_tl_mode", "line");
  localStorage.setItem("ce_tl_snap", "0");
  localStorage.setItem("ce_tl_ripple", "0");
});

type RetimeRun = (firstId: string, lastId: string, startMs: number, endMs: number, ripple: boolean) => void;

const renderTimeline = (onRetimeRun: RetimeRun, onSeek: (ms: number) => void) =>
  render(
    <Timeline
      pages={[page1, page2]}
      words={[...page1.words, ...page2.words]}
      durationMs={31500}
      timeMs={14400}
      selectedId="w1"
      peaks={null}
      waveState="idle"
      onSeek={onSeek}
      onSelect={vi.fn()}
      selectedWordIds={new Set()}
      onWordSelectionChange={vi.fn()}
      onShiftWords={vi.fn()}
      onRetimeRun={onRetimeRun}
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

describe("timeline edge resize commits on release", () => {
  it("dragging the right edge +1500ms calls onRetimeRun with the new end", () => {
    const onRetimeRun = vi.fn<RetimeRun>();
    const onSeek = vi.fn<(ms: number) => void>();
    renderTimeline(onRetimeRun, onSeek);
    const handle = screen.getByTitle(/Move end of hi jagah/);
    const block = handle.parentElement as HTMLElement;
    // px per ms from the rendered block position (left = x(14400))
    const pxPerMs = parseFloat(block.style.left) / 14400;
    expect(pxPerMs).toBeGreaterThan(0);
    const widthBefore = parseFloat(block.style.width);
    const x0 = 500;
    // onMove computes d_ms = (clientX - x0) / pxPerMs, so px = ms * pxPerMs
    const deltaPx = Math.round(1500 * pxPerMs);

    fireEvent.pointerDown(handle, { clientX: x0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: x0 + deltaPx, button: 0, pointerId: 1 });
    // preview: the block renders long while dragging (width grows by the dragged px)
    expect(parseFloat(block.style.width)).toBeCloseTo(widthBefore + deltaPx, 0);
    fireEvent.pointerUp(handle, { clientX: x0 + deltaPx, button: 0, pointerId: 1 });

    expect(onRetimeRun).toHaveBeenCalledTimes(1);
    // The Timeline rounds the drag delta to integer pixels, so the committed
    // end is 15900 + round(deltaPx / pxPerMs), not exactly 17400 (2ms off
    // here) — that is a px-rounding artifact of the test harness, not a bug.
    const expectedEnd = Math.round(15900 + deltaPx / pxPerMs);
    expect(onRetimeRun).toHaveBeenCalledWith("w1", "w5", 14400, expectedEnd, false);
  });

  it("releasing without moving does not commit", () => {
    const onRetimeRun = vi.fn<RetimeRun>();
    const onSeek = vi.fn<(ms: number) => void>();
    renderTimeline(onRetimeRun, onSeek);
    const handle = screen.getByTitle(/Move end of hi jagah/);
    fireEvent.pointerDown(handle, { clientX: 500, button: 0, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 500, button: 0, pointerId: 1 });
    expect(onRetimeRun).not.toHaveBeenCalled();
  });
});
