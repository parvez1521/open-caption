/**
 * A8 wiring: an Edit Assistant apply carries the plan's resulting state
 * through ONE editAll call (the StudioPage assistant commit path, shared
 * with Polish), so ONE undo restores the prior composition/document and
 * one redo reapplies it — exactly like the A2 history pin.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition } from "../compositionDoc";
import { applyPolishPlan, polishCommitSettings, type PolishProjectState } from "../polish";
import { buildAssistantPlan } from "../editAssistant";

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
    id: "p1", title: "Assistant history", status: "ready", language: "en", aspect_ratio: null,
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

describe("editAll with an assistant plan (one undo step)", () => {
  it("applying a plan = one history step; ONE undo restores the prior doc, redo reapplies", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useStudio("p1"), { wrapper });
    await waitFor(() => expect(hook.result.current.doc).not.toBeNull());
    await waitFor(() => expect(hook.result.current.style).not.toBeNull());

    const { doc, settings, style, lookId } = hook.result.current;
    const input: CompositionInput = {
      media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 10_000 },
      doc: null, pages: [], settings, durationMs: 10_000,
    };
    const comp = buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs: 10_000 });
    const state: PolishProjectState = { doc: doc!, comp, settings, style, lookId };

    const { plan } = buildAssistantPlan(
      { doc: doc!, comp, settings, lookId, peaks: null, hopMs: 20 },
      { intent: "trim-fillers" },
      { badge: { source: "cloud", fellBack: false } },
    );
    expect(plan.steps).toHaveLength(1);
    const { state: next, record } = applyPolishPlan(state, plan, plan.steps.map((s) => s.id));
    expect(record.steps).toHaveLength(1);

    // StudioPage's assistant onCommit: exactly one editAll for the whole plan
    act(() => {
      hook.result.current.editAll({
        doc: next.doc,
        settings: polishCommitSettings(next),
        style: next.style,
        lookId: next.lookId,
      });
    });
    expect(hook.result.current.doc!.words.map((w) => w.id)).toEqual(["w1"]);
    expect(hook.result.current.canUndo).toBe(true);

    act(() => { hook.result.current.undo(); });
    expect(hook.result.current.doc!.words.map((w) => w.id)).toEqual(["w1", "w2"]);
    expect(hook.result.current.canUndo).toBe(false); // exactly ONE step was recorded

    act(() => { hook.result.current.redo(); });
    expect(hook.result.current.doc!.words.map((w) => w.id)).toEqual(["w1"]);
  });
});
