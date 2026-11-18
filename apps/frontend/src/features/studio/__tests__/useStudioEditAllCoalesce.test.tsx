/**
 * CAP-T06: a duration-slider drag must be ONE undo step, not one per 50 ms
 * tick. editAll accepts opts.coalesceKey (same 600 ms window recordHistory
 * already gives typing and patchSettings); StudioPage passes
 * `transition-duration:<clipId>` for duration-only transition changes.
 * The save side was already debounced (800 ms persist/schedule), so a drag
 * also saves once per burst.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const DOC = {
  version: 2, language: "en", direction: "ltr",
  words: [
    { id: "w1", text: "hello", startMs: 0, endMs: 400 },
    { id: "w2", text: "there", startMs: 450, endMs: 900 },
  ],
  manualBreaks: [], noBreakAfter: [], cards: {}, meta: { userEdited: false },
};

const studioData = {
  project: {
    id: "p1", title: "Coalesce", status: "ready", language: "en", aspect_ratio: null,
    look_id: "hormozi_box", template_id: null, style_json: null, settings_json: {}, platform: null,
  },
  video: null, job: null, canTranscribe: false,
  document: { doc: DOC, revision: 1, unchanged: false },
};

vi.mock("@/services/studio", () => ({
  RevisionConflict: class RevisionConflict extends Error {},
  studioService: {
    getStudio: vi.fn(async () => studioData),
    saveDocument: vi.fn(async () => 2),
    savePatch: vi.fn(async () => undefined),
  },
}));
vi.mock("@/features/transcribe/session", () => ({ hasActiveSession: () => false }));

import { useStudio } from "../useStudio";

function renderStudioHook() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useStudio("p1"), { wrapper });
}

describe("editAll coalescing (CAP-T06)", () => {
  it("three editAll calls sharing a coalesceKey are ONE undo step", async () => {
    const hook = renderStudioHook();
    await waitFor(() => expect(hook.result.current.doc).not.toBeNull());
    await waitFor(() => expect(hook.result.current.style).not.toBeNull());
    const initial = hook.result.current.settings.maxWordsPerCard;
    const key = "transition-duration:seg-2";
    act(() => {
      // a slider drag: 3 ticks inside one burst, same key
      hook.result.current.editAll({ settings: { ...hook.result.current.settings, maxWordsPerCard: initial + 1 } }, { coalesceKey: key });
      hook.result.current.editAll({ settings: { ...hook.result.current.settings, maxWordsPerCard: initial + 2 } }, { coalesceKey: key });
      hook.result.current.editAll({ settings: { ...hook.result.current.settings, maxWordsPerCard: initial + 3 } }, { coalesceKey: key });
    });
    expect(hook.result.current.settings.maxWordsPerCard).toBe(initial + 3);
    expect(hook.result.current.canUndo).toBe(true);
    act(() => { hook.result.current.undo(); });
    expect(hook.result.current.settings.maxWordsPerCard).toBe(initial);
    expect(hook.result.current.canUndo).toBe(false); // exactly ONE step was recorded
    act(() => { hook.result.current.redo(); });
    expect(hook.result.current.settings.maxWordsPerCard).toBe(initial + 3);
  });

  it("editAll calls without a key stay separate undo steps", async () => {
    const hook = renderStudioHook();
    await waitFor(() => expect(hook.result.current.doc).not.toBeNull());
    await waitFor(() => expect(hook.result.current.style).not.toBeNull());
    const initial = hook.result.current.settings.maxWordsPerCard;
    act(() => {
      hook.result.current.editAll({ settings: { ...hook.result.current.settings, maxWordsPerCard: initial + 1 } });
      hook.result.current.editAll({ settings: { ...hook.result.current.settings, maxWordsPerCard: initial + 2 } });
    });
    act(() => { hook.result.current.undo(); });
    expect(hook.result.current.settings.maxWordsPerCard).toBe(initial + 1);
    expect(hook.result.current.canUndo).toBe(true); // a second step remains
    act(() => { hook.result.current.undo(); });
    expect(hook.result.current.settings.maxWordsPerCard).toBe(initial);
    expect(hook.result.current.canUndo).toBe(false);
  });
});
