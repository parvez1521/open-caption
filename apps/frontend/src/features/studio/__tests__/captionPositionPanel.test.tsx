import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaptionDocSchema, type CaptionDoc, type Page, type Word } from "@capseasy/shared";
import { CaptionsPanel } from "../panels/CaptionsPanel";

/**
 * Per-card caption position, presets REMOVED (owner 2026-11-16): the
 * "Caption position" section — heading, hint, 3×3 preset grid, Reset — is
 * gone from the Captions panel. Dragging the caption on the preview is the
 * only way to move a card now; the bulk actions live in the Style panel.
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

function renderPanel(doc: CaptionDoc, opts: { currentPageId?: string } = {}) {
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
          heroSupported
          selectedWordIds={new Set()}
          onWordSelectionChange={() => {}}
        />
      </QueryClientProvider>
    );
  }
  return render(<Harness />);
}

describe("CaptionsPanel — preset grid removed", () => {
  it("no 'Caption position' section, preset grid, or Reset anywhere in the panel", () => {
    renderPanel(initialDoc);
    expect(screen.queryByTestId("card-position-controls")).toBeNull();
    expect(screen.queryByText("Caption position")).toBeNull();
    expect(screen.queryByText(/Drag the caption on the preview/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Caption position presets" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Top Center" })).toBeNull();
  });

  it("the section stays gone even when the current card HAS an override", () => {
    const doc = CaptionDocSchema.parse({
      version: 2,
      language: "en",
      words: initialDoc.words,
      cards: { w1: { position: { x: 0.5, y: 0.2 } } },
    });
    renderPanel(doc);
    expect(screen.queryByTestId("card-position-controls")).toBeNull();
    expect(screen.queryByText("Caption position")).toBeNull();
    // the word list itself is untouched — the card still renders and selects
    expect(screen.getByRole("button", { name: "Dulha" })).toBeTruthy();
  });

  it("clicking a word still selects it (the panel's own behaviour is untouched)", () => {
    const onSelect = (id: string | null) => {
      selected.push(id);
    };
    const selected: (string | null)[] = [];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const page = pageOf(initialDoc.words);
    render(
      <QueryClientProvider client={qc}>
        <CaptionsPanel
          doc={initialDoc}
          pages={[page]}
          currentPageId="p1"
          timeMs={0}
          selectedId={null}
          onSelect={onSelect}
          onSeek={() => {}}
          edit={(fn) => fn(initialDoc)}
          heroSupported
          selectedWordIds={new Set()}
          onWordSelectionChange={() => {}}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dulhan?" }));
    expect(selected).toEqual(["w2"]);
  });
});
