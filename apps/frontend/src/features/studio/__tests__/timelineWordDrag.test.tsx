/**
 * Timeline word drags (owner video 2026-11-16): selecting one word and changing its
 * duration did not work, and moving a section earlier/later did not work at all.
 * Root cause: the drag clamped a block's move to [previous end … next start], and
 * caption words are contiguous — so the window collapsed to a point and the drag was
 * silently swallowed. Neighbours now give way at the shared boundary instead.
 * These tests pin the fix in word mode with contiguous words (the case the 2026-11-13
 * edge-resize probe missed — it used line mode with a 4.4s gap between cards):
 * single-word move / edge resize commit, drag-select across blocks, group retime,
 * shift-click toggle, and the plain-click path.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Page, Word } from "@capseasy/shared";
import { Timeline } from "../Timeline";
import { formatDelta } from "../dragSelect";

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
  // jsdom has no pointer capture; the drag code calls it on the block/handle
  for (const name of ["setPointerCapture", "releasePointerCapture"] as const) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: () => {} });
  }
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
});

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });

// contiguous words — the owner's case: no gaps between neighbours
const WORDS = [
  word("w1", "Par", 0, 300),
  word("w2", "such", 300, 600),
  word("w3", "bolun", 600, 900),
  word("w4", "club", 900, 1200),
  word("w5", "mein", 1200, 1500),
  word("w6", "shor", 1500, 1800),
  word("w7", "restaurant", 1800, 2100),
];

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

beforeEach(() => {
  mockWidth = 1200;
  localStorage.setItem("ce_tl_mode", "word");
  localStorage.setItem("ce_tl_snap", "0");
  localStorage.setItem("ce_tl_ripple", "0");
});

type Mocks = {
  onRetimeRun: ReturnType<typeof vi.fn<(firstId: string, lastId: string, startMs: number, endMs: number, ripple: boolean) => void>>;
  onShiftWords: ReturnType<typeof vi.fn<(ids: string[], deltaMs: number) => void>>;
  onWordSelectionChange: ReturnType<typeof vi.fn<(ids: Set<string>) => void>>;
  onSelect: ReturnType<typeof vi.fn<(wordId: string | null) => void>>;
  onSeek: ReturnType<typeof vi.fn<(ms: number) => void>>;
};

const renderTimeline = (selectedWordIds: Set<string>, selectedId: string | null): { mocks: Mocks } => {
  const mocks: Mocks = {
    onRetimeRun: vi.fn<(firstId: string, lastId: string, startMs: number, endMs: number, ripple: boolean) => void>(),
    onShiftWords: vi.fn<(ids: string[], deltaMs: number) => void>(),
    onWordSelectionChange: vi.fn<(ids: Set<string>) => void>(),
    onSelect: vi.fn<(wordId: string | null) => void>(),
    onSeek: vi.fn<(ms: number) => void>(),
  };
  render(
    <Timeline
      pages={[page("p1", WORDS)]}
      words={WORDS}
      durationMs={30000}
      timeMs={0}
      selectedId={selectedId}
      peaks={null}
      waveState="idle"
      onSeek={mocks.onSeek}
      onSelect={mocks.onSelect}
      selectedWordIds={selectedWordIds}
      onWordSelectionChange={mocks.onWordSelectionChange}
      onShiftWords={mocks.onShiftWords}
      onRetimeRun={mocks.onRetimeRun}
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
  return { mocks };
};

/** px per ms from the rendered block position (left = x(startMs)) */
const pxPerMsOf = (block: HTMLElement, startMs: number) => parseFloat(block.style.left) / startMs;

const blockOf = (text: string) => {
  const el = screen.getByText(text);
  // the word label sits inside the block div
  let node: HTMLElement | null = el;
  while (node && node.getAttribute("role") !== "button") node = node.parentElement;
  return node as HTMLElement;
};

describe("timeline word drags on contiguous words (owner 2026-11-16)", () => {
  it("moving one word earlier commits the new window (neighbours give way)", () => {
    const { mocks } = renderTimeline(new Set(["w2"]), "w2");
    const block = blockOf("such");
    const pxPerMs = pxPerMsOf(block, 300);
    expect(pxPerMs).toBeGreaterThan(0);
    const leftBefore = parseFloat(block.style.left);
    const x0 = 500;
    const deltaPx = Math.round(200 * pxPerMs);

    fireEvent.pointerDown(block, { clientX: x0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(block, { clientX: x0 - deltaPx, button: 0, pointerId: 1 });
    // live preview: the block moves left while dragging
    expect(parseFloat(block.style.left)).toBeLessThan(leftBefore);
    // live readout shows the shift
    expect(screen.getByText(formatDelta(Math.round(300 - deltaPx / pxPerMs) - 300))).toBeTruthy();
    fireEvent.pointerUp(block, { clientX: x0 - deltaPx, button: 0, pointerId: 1 });

    expect(mocks.onRetimeRun).toHaveBeenCalledTimes(1);
    const expectedStart = Math.round(300 - deltaPx / pxPerMs);
    expect(mocks.onRetimeRun).toHaveBeenCalledWith("w2", "w2", expectedStart, expectedStart + 300, false);
    expect(mocks.onShiftWords).not.toHaveBeenCalled();
  });

  it("dragging a word's end edge later grows its duration (old code clamped it to the neighbour)", () => {
    const { mocks } = renderTimeline(new Set(["w2"]), "w2");
    const handle = screen.getByTitle("Move end of such");
    const block = blockOf("such");
    const pxPerMs = pxPerMsOf(block, 300);
    const widthBefore = parseFloat(block.style.width);
    const x0 = 500;
    const deltaPx = Math.round(200 * pxPerMs);

    fireEvent.pointerDown(handle, { clientX: x0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: x0 + deltaPx, button: 0, pointerId: 1 });
    // preview: the block renders longer while dragging
    expect(parseFloat(block.style.width)).toBeGreaterThan(widthBefore);
    fireEvent.pointerUp(handle, { clientX: x0 + deltaPx, button: 0, pointerId: 1 });

    expect(mocks.onRetimeRun).toHaveBeenCalledTimes(1);
    const expectedEnd = Math.round(600 + deltaPx / pxPerMs);
    expect(mocks.onRetimeRun).toHaveBeenCalledWith("w2", "w2", 300, expectedEnd, false);
  });

  it("dragging the start edge earlier grows the word backwards", () => {
    const { mocks } = renderTimeline(new Set(["w2"]), "w2");
    const handle = screen.getByTitle("Move start of such");
    const block = blockOf("such");
    const pxPerMs = pxPerMsOf(block, 300);
    const x0 = 500;
    const deltaPx = Math.round(200 * pxPerMs);

    fireEvent.pointerDown(handle, { clientX: x0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: x0 - deltaPx, button: 0, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: x0 - deltaPx, button: 0, pointerId: 1 });

    expect(mocks.onRetimeRun).toHaveBeenCalledTimes(1);
    const expectedStart = Math.round(300 - deltaPx / pxPerMs);
    expect(mocks.onRetimeRun).toHaveBeenCalledWith("w2", "w2", expectedStart, 600, false);
  });

  it("dragging across blocks selects the range (6-7 keywords, then drag the group)", () => {
    const { mocks } = renderTimeline(new Set(), null);
    const block = blockOf("such");
    const pxPerMs = pxPerMsOf(block, 300);
    // pointer x for a time inside the "club" block (900–1200): label column (148px) + x(t)
    const focusX = 148 + Math.round(1000 * pxPerMs);

    fireEvent.pointerDown(block, { clientX: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(block, { clientX: focusX, button: 0, pointerId: 1 });
    fireEvent.pointerUp(block, { clientX: focusX, button: 0, pointerId: 1 });

    expect(mocks.onWordSelectionChange).toHaveBeenCalled();
    const last = mocks.onWordSelectionChange.mock.calls.at(-1)![0] as Set<string>;
    expect([...last].sort()).toEqual(["w2", "w3", "w4"]);
    // a drag-select commits no retime
    expect(mocks.onRetimeRun).not.toHaveBeenCalled();
  });

  it("dragging a selected group earlier retimes the whole run together", () => {
    const { mocks } = renderTimeline(new Set(["w2", "w3", "w4"]), "w3");
    const block = blockOf("bolun");
    const pxPerMs = pxPerMsOf(block, 600);
    const x0 = 500;
    const deltaPx = Math.round(200 * pxPerMs);

    fireEvent.pointerDown(block, { clientX: x0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(block, { clientX: x0 - deltaPx, button: 0, pointerId: 1 });
    fireEvent.pointerUp(block, { clientX: x0 - deltaPx, button: 0, pointerId: 1 });

    expect(mocks.onRetimeRun).toHaveBeenCalledTimes(1);
    const dx = Math.round(300 - deltaPx / pxPerMs) - 300;
    expect(mocks.onRetimeRun).toHaveBeenCalledWith("w2", "w4", 300 + dx, 1200 + dx, false);
    expect(mocks.onShiftWords).not.toHaveBeenCalled();
  });

  it("a group drag stops honestly at the neighbour's far edge (clamped, not swallowed)", () => {
    const { mocks } = renderTimeline(new Set(["w2", "w3", "w4"]), "w3");
    const block = blockOf("bolun");
    const pxPerMs = pxPerMsOf(block, 600);
    const x0 = 500;
    // far past the clamp: the run's start cannot pass w1.start + 40ms = 40ms
    const deltaPx = Math.round(1000 * pxPerMs);

    fireEvent.pointerDown(block, { clientX: x0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(block, { clientX: x0 - deltaPx, button: 0, pointerId: 1 });
    fireEvent.pointerUp(block, { clientX: x0 - deltaPx, button: 0, pointerId: 1 });

    expect(mocks.onRetimeRun).toHaveBeenCalledTimes(1);
    expect(mocks.onRetimeRun).toHaveBeenCalledWith("w2", "w4", 40, 940, false);
  });

  it("shift+click toggles a block in the selection without starting a drag", () => {
    const { mocks } = renderTimeline(new Set(["w2"]), "w2");
    const block = blockOf("bolun");
    fireEvent.pointerDown(block, { clientX: 500, button: 0, pointerId: 1, shiftKey: true });
    expect(mocks.onWordSelectionChange).toHaveBeenCalledTimes(1);
    const next = mocks.onWordSelectionChange.mock.calls[0]![0] as Set<string>;
    expect([...next].sort()).toEqual(["w2", "w3"]);
    expect(mocks.onRetimeRun).not.toHaveBeenCalled();
  });

  it("a plain click selects just that block and the following click is not double-counted", () => {
    const { mocks } = renderTimeline(new Set(), null);
    const block = blockOf("such");
    fireEvent.pointerDown(block, { clientX: 500, button: 0, pointerId: 1 });
    fireEvent.pointerUp(block, { clientX: 500, button: 0, pointerId: 1 });
    expect(mocks.onWordSelectionChange).toHaveBeenCalledWith(new Set(["w2"]));
    expect(mocks.onSelect).toHaveBeenCalledTimes(1);
    expect(mocks.onSelect).toHaveBeenCalledWith("w2");
    expect(mocks.onSeek).toHaveBeenCalledWith(301);
    fireEvent.click(block);
    expect(mocks.onSelect).toHaveBeenCalledTimes(1);
  });

  it("edge handles render on a normal-width word block", () => {
    renderTimeline(new Set(["w2"]), "w2");
    expect(screen.getByTitle("Move start of such")).toBeTruthy();
    expect(screen.getByTitle("Move end of such")).toBeTruthy();
  });
});
