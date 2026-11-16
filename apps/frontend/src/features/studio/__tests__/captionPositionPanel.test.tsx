import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaptionDocSchema, defaultStyle, type CaptionDoc, type Page, type Word } from "@capseasy/shared";
import { CaptionsPanel } from "../panels/CaptionsPanel";

/**
 * Per-card caption position (owner 2026-11-16): the Captions panel gets a
 * preset grid + Reset for the card at the playhead. Presets write the card's
 * override; Reset clears it back to the global position. The controls live
 * inside the current card's own block and only render when a style is passed.
 */

const initialDoc: CaptionDoc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w1", text: "Dulha", startMs: 0, endMs: 400 },
    { id: "w2", text: "Dulhan?", startMs: 420, endMs: 800 },
    { id: "w3", text: "hota", startMs: 820, endMs: 1200 },
    { id: "w4", text: "hai?", startMs: 1220, endMs: 1600 },
  ],
});

const pageOf = (words: Word[], id = "p1", position: { x: number; y: number } | null = null): Page => ({
  id,
  startMs: words[0]?.startMs ?? 0,
  endMs: words[words.length - 1]?.endMs ?? 0,
  words,
  lines: [words],
  heroIndex: -1,
  emotion: "neutral",
  position,
  styleOverride: null,
});

function renderPanel(doc: CaptionDoc, opts: { style?: boolean; locked?: boolean; currentPageId?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [d, setDoc] = useState(doc);
    // same derivation rule as derivePages: the page's position is the card's
    // override from doc.cards, keyed by the first word id
    const page = pageOf(d.words, "p1", d.cards.w1?.position ?? null);
    return (
      <QueryClientProvider client={qc}>
        <CaptionsPanel
          doc={d}
          pages={[page]}
          currentPageId={opts.currentPageId ?? "p1"}
          timeMs={0}
          selectedId={null}
          onSelect={() => {}}
          onSeek={() => {}}
          edit={(fn) => setDoc((cur) => fn(cur))}
          style={opts.style === false ? undefined : defaultStyle()}
          heroSupported
          selectedWordIds={new Set()}
          onWordSelectionChange={() => {}}
          locked={opts.locked}
        />
      </QueryClientProvider>
    );
  }
  return render(<Harness />);
}

describe("CaptionsPanel — per-card position presets", () => {
  it("a preset writes the current card's override (first word id) and marks itself active", () => {
    renderPanel(initialDoc);
    expect(screen.getByTestId("card-position-controls")).toBeTruthy();
    // the global default (0.5, 0.72) matches no preset, so Reset starts disabled
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Top Center" }));

    expect(screen.getByRole("button", { name: "Top Center" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty("disabled", false);
  });

  it("Reset clears the override back to the global position", () => {
    renderPanel(initialDoc);
    fireEvent.click(screen.getByRole("button", { name: "Bottom Right" }));
    expect(screen.getByRole("button", { name: "Bottom Right" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByRole("button", { name: "Bottom Right" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty("disabled", true);
  });

  it("the controls render only for the current card", () => {
    renderPanel(initialDoc, { currentPageId: "other" });
    expect(screen.queryByTestId("card-position-controls")).toBeNull();
  });

  it("the controls do not render when no style is passed", () => {
    renderPanel(initialDoc, { style: false });
    expect(screen.queryByTestId("card-position-controls")).toBeNull();
  });

  it("a locked captions track disables the presets and Reset", () => {
    renderPanel(initialDoc, { locked: true });
    expect(screen.getByRole("button", { name: "Top Center" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty("disabled", true);
  });
});
