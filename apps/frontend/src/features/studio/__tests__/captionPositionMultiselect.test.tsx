import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, type CaptionDoc, type Page, type Word } from "@capseasy/shared";
import type { CaptionedVideoInput } from "@capseasy/compositions";
import { CaptionsPanel } from "../panels/CaptionsPanel";

/**
 * Caption card selection controls (owner 2026-11-25): "Select all captions"
 * picks every card, "Multiple captions" arms marquee drag-select on the
 * timeline, and "How to position captions" replays the walkthrough. They live
 * in the Captions panel's sticky bottom bar (the selection home), so they are
 * reachable whenever captions exist — not only while words are selected.
 */

vi.mock("@remotion/player", () => ({
  Player: () => <div data-testid="mock-player" />,
}));
vi.mock("@capseasy/compositions", () => ({ CaptionedVideo: () => null }));

import { StudioPlayer } from "../StudioPlayer";

const words: Word[] = [
  { id: "w1", text: "Dulha", startMs: 0, endMs: 400 },
  { id: "w2", text: "Dulhan?", startMs: 420, endMs: 800 },
  { id: "w3", text: "hota", startMs: 820, endMs: 1200 },
  { id: "w4", text: "hai?", startMs: 1220, endMs: 1600 },
  { id: "w5", text: "aur", startMs: 1620, endMs: 2000 },
  { id: "w6", text: "kya?", startMs: 2020, endMs: 2400 },
];

const pageOf = (ws: Word[], id: string): Page => ({
  id,
  startMs: ws[0]!.startMs,
  endMs: ws[ws.length - 1]!.endMs,
  words: ws,
  lines: [ws],
  heroIndex: -1,
  emotion: "neutral",
  position: null,
  styleOverride: null,
});

const PAGES = [pageOf(words.slice(0, 2), "p1"), pageOf(words.slice(2, 4), "p2"), pageOf(words.slice(4), "p3")];
const DOC: CaptionDoc = CaptionDocSchema.parse({ version: 2, language: "en", words });

function renderPanel() {
  const onSelectAllCards = vi.fn();
  const onToggleMultiSelect = vi.fn();
  const onClearCardSelection = vi.fn();
  const onReplayTutorial = vi.fn();
  function Harness() {
    const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
    const [armed, setArmed] = useState(false);
    return (
      <CaptionsPanel
        doc={DOC}
        pages={PAGES}
        currentPageId="p1"
        timeMs={0}
        selectedId={null}
        onSelect={() => {}}
        onSeek={() => {}}
        edit={() => {}}
        heroSupported
        selectedWordIds={new Set()}
        onWordSelectionChange={() => {}}
        selectedCardIds={selectedCardIds}
        onSelectAllCards={() => { onSelectAllCards(); setSelectedCardIds(new Set(PAGES.map((p) => p.id))); }}
        multiSelectArmed={armed}
        onToggleMultiSelect={() => { onToggleMultiSelect(); setArmed((v) => !v); }}
        onClearCardSelection={() => { onClearCardSelection(); setSelectedCardIds(new Set()); }}
        onReplayTutorial={onReplayTutorial}
      />
    );
  }
  const utils = render(<Harness />);
  return { ...utils, onSelectAllCards, onToggleMultiSelect, onClearCardSelection, onReplayTutorial };
}

describe("CaptionsPanel — card selection controls", () => {
  it("the card controls are visible with no word selection (the bar is the selection home)", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Select all captions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Multiple captions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "How to position captions" })).toBeTruthy();
    // no word selection, so the word actions stay hidden
    expect(screen.queryByText(/words? selected/)).toBeNull();
  });

  it("Select all captions selects every card", () => {
    const { onSelectAllCards } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Select all captions" }));
    expect(onSelectAllCards).toHaveBeenCalledTimes(1);
    expect(screen.getByText("3 captions selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select all captions" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Multiple captions arms multi mode (active state) and a re-tap disarms it", () => {
    const { onToggleMultiSelect } = renderPanel();
    const btn = screen.getByRole("button", { name: "Multiple captions" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(onToggleMultiSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Multiple captions" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Multiple captions" }));
    expect(onToggleMultiSelect).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Multiple captions" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("Clear clears the card selection", () => {
    const { onClearCardSelection } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Select all captions" }));
    expect(screen.getByText("3 captions selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear card selection" }));
    expect(onClearCardSelection).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("3 captions selected")).toBeNull();
  });

  it("How to position captions replays the walkthrough", () => {
    const { onReplayTutorial } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "How to position captions" }));
    expect(onReplayTutorial).toHaveBeenCalledTimes(1);
  });

  it("the card buttons carry the walkthrough anchors", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Select all captions" }).getAttribute("data-tour")).toBe("select-all-captions");
    expect(screen.getByRole("button", { name: "Multiple captions" }).getAttribute("data-tour")).toBe("multi-select-captions");
  });
});

describe("StudioPlayer — the selected caption is highlighted in the preview", () => {
  const input = { src: "blob:clip", media: { width: 1080, height: 1920, fps: 30, durationMs: 5000, rotation: 0 }, settings: {} } as unknown as CaptionedVideoInput;
  const box = { x: 0.5, y: 0.72, w: 0.8, h: 0.1 };

  it("the caption hitbox is ringed when the playhead card is selected, plain when it is not", () => {
    const { rerender } = render(
      <StudioPlayer
        input={input}
        width={1080}
        height={1920}
        fps={30}
        durationMs={5000}
        position={{ x: 0.5, y: 0.72 }}
        onMovePosition={() => undefined}
        onTime={() => undefined}
        captionBox={box}
        currentCardSelected={false}
      />,
    );
    expect(screen.getByTestId("caption-position-hitbox").getAttribute("data-card-selected")).toBeNull();
    rerender(
      <StudioPlayer
        input={input}
        width={1080}
        height={1920}
        fps={30}
        durationMs={5000}
        position={{ x: 0.5, y: 0.72 }}
        onMovePosition={() => undefined}
        onTime={() => undefined}
        captionBox={box}
        currentCardSelected
      />,
    );
    expect(screen.getByTestId("caption-position-hitbox").getAttribute("data-card-selected")).toBe("true");
  });

  it("the position grip carries the walkthrough anchor", () => {
    render(
      <StudioPlayer
        input={input}
        width={1080}
        height={1920}
        fps={30}
        durationMs={5000}
        position={{ x: 0.5, y: 0.72 }}
        onMovePosition={() => undefined}
        onTime={() => undefined}
        captionBox={box}
      />,
    );
    expect(screen.getByRole("slider", { name: "Caption position (drag)" }).getAttribute("data-tour")).toBe("move-caption");
  });
});
