import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaptionDocSchema, type CaptionDoc, type Page, type Word } from "@capseasy/shared";
import { CaptionsPanel } from "../panels/CaptionsPanel";

/**
 * Owner report 2026-11-13 (real-user test with a friend):
 * (1) a single-word card's edit input would not accept a space / 2nd word;
 * (2) the only editor lived below the caption list, so he could not find where to edit.
 * The editor is now inline under the selected word's own card, and the bottom editor
 * is gone. These tests pin the inline path: typing a space + 2nd word, editor placement,
 * and the actions working from their new spot.
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

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [doc, setDoc] = useState(initialDoc);
    const [selectedId, setSelectedId] = useState<string | null>("w1");
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
          selectedWordIds={new Set()}
          onWordSelectionChange={() => {}}
        />
      </QueryClientProvider>
    );
  }
  return render(<Harness />);
}

const editInput = () => screen.getByLabelText("Edit word") as HTMLInputElement;

describe("CaptionsPanel — inline word editor (owner 2026-11-13)", () => {
  it("renders the editor under the selected word's card, not below the list", () => {
    const { container } = renderPanel();
    const editor = screen.getByTestId("inline-word-editor");
    const card = container.querySelector('[data-page="p1"]')!;
    expect(card.contains(editor)).toBe(true);
    // exactly one edit input in the whole panel (no leftover bottom editor)
    expect(screen.getAllByLabelText("Edit word")).toHaveLength(1);
    expect(editInput().value).toBe("Dulha");
  });

  it("clicking another word moves the inline editor to that word's card", () => {
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

  it("the actions under the selected word still work: key word, split, hide", () => {
    const { container } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "☆ Make key word" }));
    expect(screen.getByRole("button", { name: "★ Key word" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Split card here" }));
    // split is a no-op on the first word, so the editor stays; hide closes it
    fireEvent.click(screen.getByRole("button", { name: "Hide word" }));
    expect(screen.queryByTestId("inline-word-editor")).toBeNull();
    expect(container.textContent).toContain("1 hidden word");
  });

  it("Escape closes the inline editor", () => {
    renderPanel();
    fireEvent.keyDown(editInput(), { key: "Escape" });
    expect(screen.queryByTestId("inline-word-editor")).toBeNull();
  });
});
