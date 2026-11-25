/**
 * Timeline multi-select of caption cards (owner 2026-11-16, Premiere-style):
 * in LINE mode the user picks cards for a selective position move — Shift /
 * Ctrl / Cmd-click toggles a card, dragging on empty track space marquees a
 * rectangle across cards, and a plain click clears the selection back to the
 * global move. Word mode is untouched: shift-click still toggles words for
 * retiming, never cards.
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
  // jsdom has no pointer capture; the drag code calls it on blocks / the track row
  for (const name of ["setPointerCapture", "releasePointerCapture"] as const) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: () => {} });
  }
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
});

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });

const WORDS = [
  word("w1", "Par", 0, 400),
  word("w2", "such", 420, 800),
  word("w3", "bolun", 820, 1200),
  word("w4", "club", 1220, 1600),
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

const PAGES = [page("p1", WORDS.slice(0, 2)), page("p2", WORDS.slice(2))];

beforeEach(() => {
  mockWidth = 1200;
  localStorage.setItem("ce_tl_mode", "line");
  localStorage.setItem("ce_tl_snap", "0");
  localStorage.setItem("ce_tl_ripple", "0");
});

type Mocks = {
  onWordSelectionChange: ReturnType<typeof vi.fn<(ids: Set<string>) => void>>;
  onCardSelectionChange: ReturnType<typeof vi.fn<(ids: Set<string>) => void>>;
  onSelect: ReturnType<typeof vi.fn<(wordId: string | null) => void>>;
  onSeek: ReturnType<typeof vi.fn<(ms: number) => void>>;
};

const renderTimeline = (selectedCardIds: Set<string>, selectedWordIds: Set<string> = new Set(), opts: { multiSelectArmed?: boolean } = {}) => {
  const mocks: Mocks = {
    onWordSelectionChange: vi.fn<(ids: Set<string>) => void>(),
    onCardSelectionChange: vi.fn<(ids: Set<string>) => void>(),
    onSelect: vi.fn<(wordId: string | null) => void>(),
    onSeek: vi.fn<(ms: number) => void>(),
  };
  const utils = render(
    <Timeline
      pages={PAGES}
      words={WORDS}
      durationMs={30000}
      timeMs={0}
      selectedId={null}
      peaks={null}
      waveState="idle"
      onSeek={mocks.onSeek}
      onSelect={mocks.onSelect}
      selectedWordIds={selectedWordIds}
      onWordSelectionChange={mocks.onWordSelectionChange}
      selectedCardIds={selectedCardIds}
      onCardSelectionChange={mocks.onCardSelectionChange}
      multiSelectArmed={opts.multiSelectArmed ?? false}
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
  return { ...utils, mocks };
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

describe("timeline card multi-select (line mode, owner 2026-11-16)", () => {
  it("shift-click on a card block toggles it into the card selection (no retime, no word toggle)", () => {
    const { mocks } = renderTimeline(new Set());
    const block = blockOf("Par such");
    fireEvent.pointerDown(block, { button: 0, shiftKey: true, clientX: 10 });
    expect(mocks.onCardSelectionChange).toHaveBeenCalledTimes(1);
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set(["p1"]));
    expect(mocks.onWordSelectionChange).not.toHaveBeenCalled();
  });

  it("shift-click on a selected card toggles it back out", () => {
    const { mocks } = renderTimeline(new Set(["p1", "p2"]));
    const block = blockOf("bolun club");
    fireEvent.pointerDown(block, { button: 0, shiftKey: true, clientX: 10 });
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set(["p1"]));
  });

  it("ctrl-click and cmd-click toggle cards too", () => {
    const { mocks } = renderTimeline(new Set());
    fireEvent.pointerDown(blockOf("Par such"), { button: 0, ctrlKey: true, clientX: 10 });
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set(["p1"]));
    fireEvent.pointerDown(blockOf("bolun club"), { button: 0, metaKey: true, clientX: 10 });
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set(["p2"]));
  });

  it("a plain click on a card clears the multi-selection back to empty", () => {
    const { mocks } = renderTimeline(new Set(["p1", "p2"]));
    const block = blockOf("Par such");
    fireEvent.pointerDown(block, { button: 0, clientX: 10 });
    fireEvent.pointerUp(block);
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set());
    // the click still selects the word, as before
    expect(mocks.onSelect).toHaveBeenCalledWith("w1");
  });

  it("selected cards are highlighted and the toolbar says how many", () => {
    const { rerender, mocks } = renderTimeline(new Set(["p1"]));
    expect(blockOf("Par such").getAttribute("data-card-selected")).toBe("true");
    expect(blockOf("bolun club").getAttribute("data-card-selected")).toBeNull();
    rerender(
      <Timeline
        pages={PAGES}
        words={WORDS}
        durationMs={30000}
        timeMs={0}
        selectedId={null}
        peaks={null}
        waveState="idle"
        onSeek={mocks.onSeek}
        onSelect={mocks.onSelect}
        selectedWordIds={new Set()}
        onWordSelectionChange={mocks.onWordSelectionChange}
        selectedCardIds={new Set(["p1", "p2"])}
        onCardSelectionChange={mocks.onCardSelectionChange}
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
    expect(screen.getByText("2 cards selected — drag a caption to move only them")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear card selection" }));
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set());
  });

  it("switching word/line mode keeps the card selection", () => {
    renderTimeline(new Set(["p1"]));
    expect(blockOf("Par such").getAttribute("data-card-selected")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "WORD" }));
    fireEvent.click(screen.getByRole("radio", { name: "LINE" }));
    expect(blockOf("Par such").getAttribute("data-card-selected")).toBe("true");
  });

  it("marquee on empty track space selects the cards the rectangle crosses", () => {
    const { mocks } = renderTimeline(new Set());
    const row = blockOf("Par such").parentElement!;
    const pxPerMs = pxPerMsOf(blockOf("bolun club"), 820);
    // drag from 100 ms to 1000 ms: crosses both cards (0–800 and 820–1600)
    fireEvent.pointerDown(row, { button: 0, clientX: 100 * pxPerMs });
    fireEvent.pointerMove(row, { clientX: 1000 * pxPerMs });
    expect(screen.getByTestId("timeline-marquee")).toBeTruthy();
    fireEvent.pointerUp(row, { clientX: 1000 * pxPerMs });
    expect(screen.queryByTestId("timeline-marquee")).toBeNull();
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set(["p1", "p2"]));
    expect(mocks.onSeek).not.toHaveBeenCalled();
  });

  it("marquee selects only the cards it crosses", () => {
    const { mocks } = renderTimeline(new Set());
    const row = blockOf("Par such").parentElement!;
    const pxPerMs = pxPerMsOf(blockOf("bolun club"), 820);
    // drag from 900 ms to 1100 ms: only the second card
    fireEvent.pointerDown(row, { button: 0, clientX: 900 * pxPerMs });
    fireEvent.pointerMove(row, { clientX: 1100 * pxPerMs });
    fireEvent.pointerUp(row, { clientX: 1100 * pxPerMs });
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set(["p2"]));
  });

  it("a plain click on empty track space seeks and clears the card selection", () => {
    const { mocks } = renderTimeline(new Set(["p1"]));
    const row = blockOf("Par such").parentElement!;
    const pxPerMs = pxPerMsOf(blockOf("bolun club"), 820);
    fireEvent.pointerDown(row, { button: 0, clientX: 500 * pxPerMs });
    fireEvent.pointerUp(row, { clientX: 500 * pxPerMs });
    expect(mocks.onSeek).toHaveBeenCalledWith(expect.closeTo(500, 0));
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set());
    fireEvent.click(row);
    expect(mocks.onSelect).toHaveBeenCalledWith(null);
  });
});

describe("timeline card multi-select — word mode is untouched", () => {
  it("shift-click in word mode toggles words, never cards", () => {
    localStorage.setItem("ce_tl_mode", "word");
    const { mocks } = renderTimeline(new Set());
    const block = blockOf("such");
    fireEvent.pointerDown(block, { button: 0, shiftKey: true, clientX: 10 });
    expect(mocks.onWordSelectionChange).toHaveBeenCalledWith(new Set(["w2"]));
    expect(mocks.onCardSelectionChange).not.toHaveBeenCalled();
  });
});

describe("timeline card multi-select — armed multi mode (owner 2026-11-25)", () => {
  it("one selected card shows the toolbar count (singular)", () => {
    renderTimeline(new Set(["p1"]));
    expect(screen.getByText("1 card selected — drag a caption to move only it")).toBeTruthy();
  });

  it("armed in word mode, empty-space drag marquees cards instead of scrubbing", async () => {
    localStorage.setItem("ce_tl_mode", "word");
    const { mocks } = renderTimeline(new Set(), new Set(), { multiSelectArmed: true });
    const row = blockOf("such").parentElement!;
    const pxPerMs = pxPerMsOf(blockOf("bolun"), 820);
    // drag from 900 ms to 1100 ms: only the second card (w3 "bolun" 820–1200)
    fireEvent.pointerDown(row, { button: 0, clientX: 900 * pxPerMs });
    fireEvent.pointerMove(row, { clientX: 1100 * pxPerMs });
    expect(screen.getByTestId("timeline-marquee")).toBeTruthy();
    fireEvent.pointerUp(row, { clientX: 1100 * pxPerMs });
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set(["p2"]));
    // scrubs seek on the next animation frame: wait past it, still no seek
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.onSeek).not.toHaveBeenCalled();
  });

  it("armed in word mode, each drag selects exactly the dragged set (replaces, never adds)", () => {
    localStorage.setItem("ce_tl_mode", "word");
    const { mocks } = renderTimeline(new Set(["p1"]), new Set(), { multiSelectArmed: true });
    const row = blockOf("such").parentElement!;
    const pxPerMs = pxPerMsOf(blockOf("bolun"), 820);
    // drag across only the second card: the old p1 selection is replaced, not kept
    fireEvent.pointerDown(row, { button: 0, clientX: 900 * pxPerMs });
    fireEvent.pointerMove(row, { clientX: 1100 * pxPerMs });
    fireEvent.pointerUp(row, { clientX: 1100 * pxPerMs });
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set(["p2"]));
  });

  it("armed in word mode, a drag over a middle word still selects its card", () => {
    localStorage.setItem("ce_tl_mode", "word");
    const { mocks } = renderTimeline(new Set(), new Set(), { multiSelectArmed: true });
    const row = blockOf("such").parentElement!;
    const pxPerMs = pxPerMsOf(blockOf("bolun"), 820);
    // drag from 500 ms to 700 ms: only w2 "such" (420–800), a middle word of card p1
    fireEvent.pointerDown(row, { button: 0, clientX: 500 * pxPerMs });
    fireEvent.pointerMove(row, { clientX: 700 * pxPerMs });
    fireEvent.pointerUp(row, { clientX: 700 * pxPerMs });
    expect(mocks.onCardSelectionChange).toHaveBeenCalledWith(new Set(["p1"]));
  });

  it("armed, a plain click on empty space neither seeks nor clears the selection", async () => {
    localStorage.setItem("ce_tl_mode", "word");
    const { mocks } = renderTimeline(new Set(["p1"]), new Set(), { multiSelectArmed: true });
    const row = blockOf("such").parentElement!;
    const pxPerMs = pxPerMsOf(blockOf("bolun"), 820);
    fireEvent.pointerDown(row, { button: 0, clientX: 500 * pxPerMs });
    fireEvent.pointerUp(row, { clientX: 500 * pxPerMs });
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.onSeek).not.toHaveBeenCalled();
    expect(mocks.onCardSelectionChange).not.toHaveBeenCalled();
  });

  it("armed, the toolbar says multi-select is on", () => {
    renderTimeline(new Set(), new Set(), { multiSelectArmed: true });
    expect(screen.getByText(/Multi-select on/)).toBeTruthy();
  });

  it("unarmed in word mode, empty-space drag still scrubs (no card selection)", async () => {
    localStorage.setItem("ce_tl_mode", "word");
    const { mocks } = renderTimeline(new Set());
    const row = blockOf("such").parentElement!;
    const pxPerMs = pxPerMsOf(blockOf("bolun"), 820);
    fireEvent.pointerDown(row, { button: 0, clientX: 100 * pxPerMs });
    fireEvent.pointerMove(row, { clientX: 1000 * pxPerMs });
    fireEvent.pointerUp(row, { clientX: 1000 * pxPerMs });
    expect(mocks.onCardSelectionChange).not.toHaveBeenCalled();
    // scrubs seek on the next animation frame
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.onSeek).toHaveBeenCalled();
  });

  it("in word mode, word blocks of a selected card are highlighted too", () => {
    localStorage.setItem("ce_tl_mode", "word");
    renderTimeline(new Set(["p1"]));
    expect(blockOf("Par").getAttribute("data-card-selected")).toBe("true");
    expect(blockOf("such").getAttribute("data-card-selected")).toBe("true");
    expect(blockOf("bolun").getAttribute("data-card-selected")).toBeNull();
  });
});
