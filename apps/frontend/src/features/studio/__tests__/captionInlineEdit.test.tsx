import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, type CaptionDoc, type Page, type Word } from "@capseasy/shared";
import { CaptionsPanel } from "../panels/CaptionsPanel";

/**
 * Owner report 2026-11-13 (real-user test with a friend):
 * (1) a single-word card's edit input would not accept a space / 2nd word;
 * (2) the only editor lived below the caption list, so he could not find where to edit.
 * The editor moved inline under the selected word's own card — and 2026-11-16 it moved
 * again, PINNED above the list: the inline editor slid below the fold (half-cut or
 * invisible) whenever the word sat near the bottom of the visible list, and a
 * drag-selected range showed no editor at all (selection without a clicked word).
 * These tests pin the pinned path: typing a space + 2nd word, editor placement,
 * the actions working from their new spot, the drag-select fallback, and the
 * selected word scrolling into view.
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

const pageOf = (words: Word[], id = "p1"): Page => ({
  id,
  startMs: words[0]?.startMs ?? 0,
  endMs: words[words.length - 1]?.endMs ?? 0,
  words,
  lines: [words],
  heroIndex: -1,
  emotion: "neutral",
  position: null,
  styleOverride: null,
});

function renderPanel(initial: { selectedId?: string | null; selectedWordIds?: Set<string> } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [doc, setDoc] = useState(initialDoc);
    const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId !== undefined ? initial.selectedId : "w1");
    const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(initial.selectedWordIds ?? new Set());
    return (
      <QueryClientProvider client={qc}>
        <CaptionsPanel
          doc={doc}
          pages={[pageOf(doc.words)]}
          currentPageId="p1"
          timeMs={0}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={() => {}}
          edit={(fn) => setDoc((d) => fn(d))}
          heroSupported
          selectedWordIds={selectedWordIds}
          onWordSelectionChange={setSelectedWordIds}
        />
      </QueryClientProvider>
    );
  }
  return render(<Harness />);
}

const editInput = () => screen.getByLabelText("Edit word") as HTMLInputElement;

describe("CaptionsPanel — pinned word editor (owner 2026-11-16)", () => {
  it("renders the editor pinned above the list, never inside a card or the scrollable list", () => {
    const { container } = renderPanel();
    const editor = screen.getByTestId("pinned-word-editor");
    const card = container.querySelector('[data-page="p1"]')!;
    expect(card.contains(editor)).toBe(false);
    const list = container.querySelector(".overflow-y-auto")!;
    expect(list.contains(editor)).toBe(false);
    // exactly one edit input in the whole panel (no leftover bottom editor)
    expect(screen.getAllByLabelText("Edit word")).toHaveLength(1);
    expect(editInput().value).toBe("Dulha");
  });

  it("clicking another word moves the pinned editor to that word", () => {
    renderPanel();
    fireEvent.click(screen.getByText("hota"));
    expect(editInput().value).toBe("hota");
    expect(editInput()).toHaveFocus();
  });

  it("single-word card: a typed space survives and a 2nd word can be added", () => {
    renderPanel();
    // the exact keystroke sequence the owner tried: "Dulha" + space + "Dulhan?"
    fireEvent.change(editInput(), { target: { value: "Dulha " } });
    expect(editInput().value).toBe("Dulha ");
    fireEvent.change(editInput(), { target: { value: "Dulha Dulhan?" } });
    expect(editInput().value).toBe("Dulha Dulhan?");
    // the word chip in the list shows the new text too
    expect(screen.getByText("Dulha Dulhan?")).toBeTruthy();
  });

  it("the actions still work from the pinned spot: key word, split, hide", () => {
    const { container } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "☆ Make key word" }));
    expect(screen.getByRole("button", { name: "★ Key word" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Split card here" }));
    // split is a no-op on the first word, so the editor stays; hide closes it
    fireEvent.click(screen.getByRole("button", { name: "Hide word" }));
    expect(screen.queryByTestId("pinned-word-editor")).toBeNull();
    expect(container.textContent).toContain("1 hidden word");
  });

  it("Escape closes the pinned editor", () => {
    renderPanel();
    fireEvent.keyDown(editInput(), { key: "Escape" });
    expect(screen.queryByTestId("pinned-word-editor")).toBeNull();
  });

  it("a drag-selected range (no clicked word) shows the editor for the first selected word", () => {
    renderPanel({ selectedId: null, selectedWordIds: new Set(["w3", "w4"]) });
    // w3 "hota" is first in document order — and the editor is visible, not missing
    expect(editInput().value).toBe("hota");
    // closing it clears the range selection, so it does not pop straight back
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(screen.queryByTestId("pinned-word-editor")).toBeNull();
  });

  it("selecting a word scrolls its row into view in the list", () => {
    const spy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: spy });
    renderPanel({ selectedId: "w4" });
    expect(spy).toHaveBeenCalledWith({ block: "nearest" });
  });
});
