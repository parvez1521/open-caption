import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, type CaptionDoc, type Page, type Word } from "@capseasy/shared";
import { CaptionsPanel } from "../panels/CaptionsPanel";

/**
 * Slice 5.5 (a): the captions track lock must actually prevent caption edits.
 * The Timeline's drag/delete/nudge paths already honoured it; the CaptionsPanel
 * (word text, find/replace, shift-all, group shift/delete, split/join/hide,
 * subtitle import, drag-retime) ignored it entirely. These tests pin the panel's
 * behaviour both ways: locked blocks every edit but keeps select/seek, unlocked
 * edits exactly as before.
 */

const doc: CaptionDoc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w1", text: "hello", startMs: 0, endMs: 400 },
    { id: "w2", text: "wide", startMs: 420, endMs: 800 },
    { id: "w3", text: "world", startMs: 820, endMs: 1200 },
  ],
});

const pageOf = (words: Word[]): Page => ({
  id: "p1",
  startMs: words[0]?.startMs ?? 0,
  endMs: words[words.length - 1]?.endMs ?? 0,
  words,
  lines: [words],
  heroIndex: -1,
  emotion: "neutral",
  position: null,
  styleOverride: null,
});
const pages = [pageOf(doc.words)];

function renderPanel(locked: boolean) {
  const edit = vi.fn();
  const onSelect = vi.fn();
  const onSeek = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <CaptionsPanel
        doc={doc}
        pages={pages}
        currentPageId="p1"
        timeMs={0}
        selectedId="w1"
        onSelect={onSelect}
        onSeek={onSeek}
        edit={edit}
        heroSupported
        selectedWordIds={new Set()}
        onWordSelectionChange={vi.fn()}
        locked={locked}
      />
    </QueryClientProvider>,
  );
  return { edit, onSelect, onSeek, ...utils };
}

describe("CaptionsPanel — captions track lock (5.5a)", () => {
  it("locked: shows the lock note and disables the edit controls", () => {
    const { container } = renderPanel(true);
    expect(screen.getByText(/Captions track is locked/)).toBeTruthy();
    // the word-text editor for the selected word is disabled
    expect((screen.getByLabelText("Edit word") as HTMLInputElement).disabled).toBe(true);
    // find input disabled
    expect((screen.getByPlaceholderText("Find") as HTMLInputElement).disabled).toBe(true);
    // every shift-all preset button is disabled
    const shiftButtons = [...container.querySelectorAll("button")].filter((b) => /^[+−]\d/.test(b.textContent ?? ""));
    expect(shiftButtons.length).toBeGreaterThan(0);
    for (const b of shiftButtons) expect((b as HTMLButtonElement).disabled).toBe(true);
    // split / join / hide are disabled
    for (const name of ["Split card here", "Join previous", "Hide word"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("locked: no edit reaches the doc, but selecting a word still works", () => {
    const { edit, onSelect, container } = renderPanel(true);
    // attempt the (disabled) controls anyway — a click on a disabled button fires nothing,
    // and the panel's edit chokepoint would swallow a call even if one slipped through
    for (const b of container.querySelectorAll("button")) fireEvent.click(b);
    expect(edit).not.toHaveBeenCalled();
    // word chips stay selectable: clicking one selects + seeks, without editing
    fireEvent.click(screen.getByText("world"));
    expect(onSelect).toHaveBeenCalledWith("w3");
    expect(edit).not.toHaveBeenCalled();
  });

  it("unlocked: no lock note, and the same controls edit as before", () => {
    const { edit, container } = renderPanel(false);
    expect(screen.queryByText(/Captions track is locked/)).toBeNull();
    expect((screen.getByLabelText("Edit word") as HTMLInputElement).disabled).toBe(false);
    const plusOne = [...container.querySelectorAll("button")].find((b) => b.textContent === "+1s")!;
    fireEvent.click(plusOne);
    expect(edit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Split card here" }));
    expect(edit).toHaveBeenCalledTimes(2);
  });
});
