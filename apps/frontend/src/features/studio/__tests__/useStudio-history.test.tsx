/**
 * Unified undo/redo history (owner bug 2026-11-10: "undo/redo kaam nahi kar raha").
 * Before this fix only caption-doc edits were recorded; template picks, style tweaks and
 * settings changes lived in a separate store with no history, so Ctrl+Z and the toolbar
 * buttons did nothing for the actions a user performs most. These tests pin the unified
 * behaviour: every store is undoable, redo reapplies, and slider-style bursts coalesce.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { deleteWordsByIds, setWordText } from "@motion-ai/caption-engine/core";
import { getLook } from "@capseasy/templates";

const DOC = {
  version: 2,
  language: "en",
  direction: "ltr",
  words: [
    { id: "w1", text: "hello", startMs: 0, endMs: 400 },
    { id: "w2", text: "world", startMs: 450, endMs: 900 },
  ],
  manualBreaks: [],
  noBreakAfter: [],
  cards: {},
  meta: { userEdited: false },
};

const studioData = {
  project: {
    id: "p1", title: "History", status: "ready", language: "en", aspect_ratio: null,
    look_id: "hormozi_box", template_id: null, style_json: null, settings_json: {}, platform: null,
  },
  video: null,
  job: null,
  canTranscribe: false,
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

async function renderStudio() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useStudio("p1"), { wrapper });
  await waitFor(() => expect(hook.result.current.doc).not.toBeNull());
  await waitFor(() => expect(hook.result.current.style).not.toBeNull());
  return hook;
}

describe("useStudio unified history", () => {
  it("doc edits: edit -> undo restores -> redo reapplies", async () => {
    const { result } = await renderStudio();
    expect(result.current.canUndo).toBe(false);
    act(() => { result.current.edit((d) => setWordText(d, "w1", "changed")); });
    expect(result.current.doc!.words[0]!.text).toBe("changed");
    expect(result.current.canUndo).toBe(true);
    act(() => { result.current.undo(); });
    expect(result.current.doc!.words[0]!.text).toBe("hello");
    expect(result.current.canRedo).toBe(true);
    act(() => { result.current.redo(); });
    expect(result.current.doc!.words[0]!.text).toBe("changed");
  });

  it("word delete is one undo step that restores the words", async () => {
    const { result } = await renderStudio();
    act(() => { result.current.edit((d) => deleteWordsByIds(d, ["w1", "w2"])); });
    expect(result.current.doc!.words).toHaveLength(0);
    act(() => { result.current.undo(); });
    expect(result.current.doc!.words.map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("settings changes (adjust sliders) are undoable and redoable", async () => {
    const { result } = await renderStudio();
    const before = result.current.settings.videoAdjust.brightness;
    act(() => { result.current.patchSettings({ videoAdjust: { ...result.current.settings.videoAdjust, brightness: 1.4 } }); });
    expect(result.current.settings.videoAdjust.brightness).toBe(1.4);
    expect(result.current.canUndo).toBe(true);
    act(() => { result.current.undo(); });
    expect(result.current.settings.videoAdjust.brightness).toBe(before);
    act(() => { result.current.redo(); });
    expect(result.current.settings.videoAdjust.brightness).toBe(1.4);
  });

  it("a settings burst with the same keys coalesces into ONE undo step", async () => {
    const { result } = await renderStudio();
    const before = result.current.settings.videoAdjust.brightness;
    act(() => { result.current.patchSettings({ videoAdjust: { ...result.current.settings.videoAdjust, brightness: 1.1 } }); });
    act(() => { result.current.patchSettings({ videoAdjust: { ...result.current.settings.videoAdjust, brightness: 1.2 } }); });
    act(() => { result.current.patchSettings({ videoAdjust: { ...result.current.settings.videoAdjust, brightness: 1.3 } }); });
    expect(result.current.settings.videoAdjust.brightness).toBe(1.3);
    act(() => { result.current.undo(); });
    expect(result.current.settings.videoAdjust.brightness).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("a no-op patch records no undo step", async () => {
    const { result } = await renderStudio();
    act(() => { result.current.patchSettings({ videoAdjust: result.current.settings.videoAdjust }); });
    expect(result.current.canUndo).toBe(false);
  });

  it("style tweaks are undoable", async () => {
    const { result } = await renderStudio();
    const before = result.current.style!.fontSize;
    act(() => { result.current.patchStyle((s) => ({ ...s, fontSize: before + 10 })); });
    expect(result.current.style!.fontSize).toBe(before + 10);
    act(() => { result.current.undo(); });
    expect(result.current.style!.fontSize).toBe(before);
  });

  it("template picks are undoable, restoring look and style together", async () => {
    const { result } = await renderStudio();
    expect(result.current.lookId).toBe("hormozi_box");
    const look = getLook("soft_glow")!;
    act(() => { result.current.chooseLook(look); });
    expect(result.current.lookId).toBe("soft_glow");
    act(() => { result.current.undo(); });
    expect(result.current.lookId).toBe("hormozi_box");
    act(() => { result.current.redo(); });
    expect(result.current.lookId).toBe("soft_glow");
  });

  it("editAll applies doc + settings as ONE undo step (Phase 4 atomic commit)", async () => {
    const { result } = await renderStudio();
    const brightness = result.current.settings.videoAdjust.brightness;
    const nextSettings = { ...result.current.settings, videoAdjust: { ...result.current.settings.videoAdjust, brightness: 1.45 } };
    act(() => {
      result.current.editAll({
        doc: setWordText(result.current.doc!, "w1", "atomic"),
        settings: nextSettings,
      });
    });
    expect(result.current.doc!.words[0]!.text).toBe("atomic");
    expect(result.current.settings.videoAdjust.brightness).toBe(1.45);
    expect(result.current.canUndo).toBe(true);
    act(() => { result.current.undo(); });
    expect(result.current.doc!.words[0]!.text).toBe("hello");
    expect(result.current.settings.videoAdjust.brightness).toBe(brightness);
    expect(result.current.canUndo).toBe(false);
    act(() => { result.current.redo(); });
    expect(result.current.doc!.words[0]!.text).toBe("atomic");
    expect(result.current.settings.videoAdjust.brightness).toBe(1.45);
  });

  it("editAll with absent or identical values records no undo step", async () => {
    const { result } = await renderStudio();
    act(() => { result.current.editAll({}); });
    act(() => { result.current.editAll({ doc: result.current.doc!, settings: result.current.settings }); });
    expect(result.current.canUndo).toBe(false);
  });

  it("mixed doc + settings actions unwind in reverse order", async () => {
    const { result } = await renderStudio();
    const brightness = result.current.settings.videoAdjust.brightness;
    act(() => { result.current.edit((d) => setWordText(d, "w1", "first")); });
    act(() => { result.current.patchSettings({ videoAdjust: { ...result.current.settings.videoAdjust, brightness: 1.5 } }); });
    act(() => { result.current.undo(); });
    expect(result.current.settings.videoAdjust.brightness).toBe(brightness);
    expect(result.current.doc!.words[0]!.text).toBe("first");
    act(() => { result.current.undo(); });
    expect(result.current.doc!.words[0]!.text).toBe("hello");
    expect(result.current.canUndo).toBe(false);
  });
});
