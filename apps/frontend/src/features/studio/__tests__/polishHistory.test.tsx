/**
 * A2 wiring: a One-click Polish apply carries doc + settings + style + lookId
 * through ONE editAll call, so ONE undo restores the whole pre-Polish state
 * (the look included) and one redo reapplies it.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getLook, applyLook } from "@capseasy/templates";
import { ProjectSettingsSchema } from "@capseasy/shared";

const DOC = {
  version: 2, language: "en", direction: "ltr",
  words: [
    { id: "w1", text: "hello", startMs: 0, endMs: 400 },
    { id: "w2", text: "um", startMs: 450, endMs: 700 },
  ],
  manualBreaks: [], noBreakAfter: [], cards: {}, meta: { userEdited: false },
};

const studioData = {
  project: {
    id: "p1", title: "Polish history", status: "ready", language: "en", aspect_ratio: null,
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

describe("editAll with style + lookId (polish commit)", () => {
  it("one editAll applies doc+settings+look together; ONE undo restores all of it", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useStudio("p1"), { wrapper });
    await waitFor(() => expect(hook.result.current.doc).not.toBeNull());
    await waitFor(() => expect(hook.result.current.style).not.toBeNull());
    const before = {
      words: hook.result.current.doc!.words.map((w) => w.id),
      lookId: hook.result.current.lookId,
      fontSize: hook.result.current.style!.fontSize,
    };

    const newLook = getLook("beast_bounce")!;
    const applied = applyLook(newLook);
    const nextDoc = { ...hook.result.current.doc!, words: hook.result.current.doc!.words.filter((w) => w.id !== "w2") };
    act(() => {
      hook.result.current.editAll({
        doc: nextDoc,
        settings: ProjectSettingsSchema.parse({ ...hook.result.current.settings, ...applied.settings }),
        style: applied.style,
        lookId: newLook.id,
      });
    });
    expect(hook.result.current.doc!.words.map((w) => w.id)).toEqual(["w1"]);
    expect(hook.result.current.lookId).toBe("beast_bounce");

    act(() => { hook.result.current.undo(); });
    expect(hook.result.current.doc!.words.map((w) => w.id)).toEqual(before.words);
    expect(hook.result.current.lookId).toBe(before.lookId);
    expect(hook.result.current.style!.fontSize).toBe(before.fontSize);
    expect(hook.result.current.canUndo).toBe(false); // exactly ONE step was recorded

    act(() => { hook.result.current.redo(); });
    expect(hook.result.current.lookId).toBe("beast_bounce");
    expect(hook.result.current.doc!.words.map((w) => w.id)).toEqual(["w1"]);
  });
});
