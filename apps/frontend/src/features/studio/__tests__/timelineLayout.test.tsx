/**
 * Timeline label-column tiers (B-31 fix): the squeeze the owner screenshotted —
 * full track names + 24px buttons crammed into an 88px column at mid window widths —
 * is pinned shut here. Pure tier math is tested directly; the render tests drive the
 * ResizeObserver with mocked container widths and assert what each tier shows:
 * no clipped full names, no dropped controls, ever-narrower label columns.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LABEL_WIDTHS, TRACK_NAMES, Timeline, labelTierForWidth } from "../Timeline";

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
});

const renderTimeline = () =>
  render(
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
    />,
  );

describe("labelTierForWidth", () => {
  it("maps container widths to tiers at the documented boundaries", () => {
    expect(labelTierForWidth(1920)).toBe("wide");
    expect(labelTierForWidth(880)).toBe("wide");
    expect(labelTierForWidth(879)).toBe("mid");
    expect(labelTierForWidth(540)).toBe("mid");
    expect(labelTierForWidth(539)).toBe("narrow");
    expect(labelTierForWidth(360)).toBe("narrow");
  });

  it("label columns narrow monotonically and mid/narrow names never overflow their column", () => {
    expect(LABEL_WIDTHS.wide).toBeGreaterThan(LABEL_WIDTHS.mid);
    expect(LABEL_WIDTHS.mid).toBeGreaterThan(LABEL_WIDTHS.narrow);
    // the mid tier's longest name at 11px must fit beside nothing (it gets its own line)
    expect(TRACK_NAMES.mid.captions.length).toBeLessThanOrEqual(8);
    // narrow shows glyphs only
    for (const n of Object.values(TRACK_NAMES.narrow)) expect(n.length).toBeLessThanOrEqual(2);
  });
});

describe("Timeline label column at container widths", () => {
  it("wide (1200px): full names on one line, 148px label column", () => {
    mockWidth = 1200;
    const { container } = renderTimeline();
    expect(screen.getByText(/Text \/ Elements/)).toBeTruthy();
    const grid = container.querySelector(".grid.w-max") as HTMLElement;
    expect(grid.style.gridTemplateColumns.startsWith(`${LABEL_WIDTHS.wide}px`)).toBe(true);
    expect(screen.getByRole("button", { name: "Lock video track" })).toBeTruthy();
  });

  it("mid (620px): short names, stacked button row, 92px label column, no control dropped", () => {
    mockWidth = 620;
    const { container } = renderTimeline();
    expect(screen.queryByText(/Text \/ Elements/)).toBeNull();
    expect(screen.getByText("Captions")).toBeTruthy();
    const grid = container.querySelector(".grid.w-max") as HTMLElement;
    expect(grid.style.gridTemplateColumns.startsWith(`${LABEL_WIDTHS.mid}px`)).toBe(true);
    // every track control still present at this width
    for (const name of ["Lock captions track", "Hide captions track", "Lock video track", "Hide video track", "Mute video", "Lock overlay tracks", "Hide overlay tracks"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("narrow (400px): glyph labels with full aria names, 60px column, controls still present", () => {
    mockWidth = 400;
    const { container } = renderTimeline();
    expect(screen.queryByText("Captions")).toBeNull();
    expect(screen.getByLabelText("Captions track")).toBeTruthy();
    expect(screen.getByLabelText("Video track")).toBeTruthy();
    const grid = container.querySelector(".grid.w-max") as HTMLElement;
    expect(grid.style.gridTemplateColumns.startsWith(`${LABEL_WIDTHS.narrow}px`)).toBe(true);
    expect(screen.getByRole("button", { name: "Mute video" })).toBeTruthy();
  });
});
