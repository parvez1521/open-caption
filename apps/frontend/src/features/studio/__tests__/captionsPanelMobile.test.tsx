import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, type CaptionDoc, type Page, type Word } from "@capseasy/shared";
import { CaptionsPanel } from "../panels/CaptionsPanel";

/**
 * Mobile words-clip fix (owner 2026-11-25): on a phone the panel is only
 * ~350px tall and Find / Replace / Import / Shift-all together ate ~210px,
 * so the word list was squeezed to a 0–30px sliver under the hint. Find /
 * Replace / Import now hide behind a mobile-only toggle (default closed)
 * and the sticky bar's hint line hides below the desktop breakpoint, freeing
 * ~85px for the words. Desktop layout is unchanged (toggle is lg:hidden,
 * the tools wrapper has no hiding class at lg+).
 *
 * jsdom has no layout engine, so these tests lock the responsive classes and
 * the toggle behaviour rather than measuring pixels.
 */

vi.mock("@remotion/player", () => ({
  Player: () => <div data-testid="mock-player" />,
}));
vi.mock("@capseasy/compositions", () => ({ CaptionedVideo: () => null }));

const words: Word[] = [
  { id: "w1", text: "Ye", startMs: 0, endMs: 400 },
  { id: "w2", text: "tumhare", startMs: 420, endMs: 800 },
  { id: "w3", text: "account", startMs: 820, endMs: 1200 },
];

const PAGES: Page[] = [
  {
    id: "p1",
    startMs: 0,
    endMs: 1200,
    words,
    lines: [words],
    heroIndex: -1,
    emotion: "neutral",
    position: null,
    styleOverride: null,
  },
];
const DOC: CaptionDoc = CaptionDocSchema.parse({ version: 2, language: "en", words });

function renderPanel() {
  return render(
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
      selectedCardIds={new Set()}
      onSelectAllCards={() => {}}
      multiSelectArmed={false}
      onToggleMultiSelect={() => {}}
      onClearCardSelection={() => {}}
      onReplayTutorial={() => {}}
    />,
  );
}

describe("captions panel on mobile (words-clip fix)", () => {
  it("renders the caption words and the positioning buttons", () => {
    renderPanel();
    expect(screen.getByText("Ye")).toBeTruthy();
    expect(screen.getByText("tumhare")).toBeTruthy();
    expect(screen.getByText("account")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select all captions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Multiple captions" })).toBeTruthy();
  });

  it("hides Find / Replace / Import behind a mobile-only toggle, closed by default", () => {
    renderPanel();
    const toggle = screen.getByRole("button", { name: /Search & import/ });
    // mobile-only control: hidden at the desktop breakpoint
    expect(toggle.className).toContain("lg:hidden");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // the tools wrapper carries the below-desktop hiding class while closed
    expect(screen.getByTestId("search-tools").className).toContain("max-lg:hidden");
    // the inputs stay in the DOM (CSS-only hiding) so find state and tests keep working
    expect(screen.getByLabelText("Find")).toBeTruthy();
    expect(screen.getByLabelText("Replace with")).toBeTruthy();
  });

  it("the toggle opens and closes the search tools", () => {
    renderPanel();
    const toggle = screen.getByRole("button", { name: /Search & import/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("search-tools").className).not.toContain("max-lg:hidden");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("search-tools").className).toContain("max-lg:hidden");
  });

  it("Shift-all stays visible (tour anchor + core action, never behind the toggle)", () => {
    renderPanel();
    expect(screen.getByText("Shift all captions")).toBeTruthy();
    expect(screen.getByText("Shift all captions").closest("[data-tour]")?.getAttribute("data-tour")).toBe("shift-all");
  });

  it("the sticky bar's hint line hides below the desktop breakpoint to save room", () => {
    renderPanel();
    const hint = screen.getByText(/Pick captions, then drag one on the video/);
    expect(hint.className).toContain("max-lg:hidden");
  });
});
