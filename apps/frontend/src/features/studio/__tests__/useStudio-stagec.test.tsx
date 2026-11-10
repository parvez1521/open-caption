/**
 * Stage-C wiring in useStudio (stageC.ts checklist step 4), tested with the
 * flag OFF — the state this branch ships in. The pins here are the inertness
 * guarantees the coordinator relies on before the separate flag-flip commit:
 *  - LOAD: a project row carrying a perfectly valid `composition_json`
 *    column value still adopts the SETTINGS composition slice
 *    (readCompositionSettings never returns source "column" while the flag
 *    is off), so the wiring changes nothing about what the editor shows.
 *  - PERSIST: the savePatch body contains no `composition_json` key at all
 *    while the flag is off — byte-identical to the pre-Stage-C body.
 * When the flag flips, these two tests are the ones that must be updated.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompositionSettingsSchema } from "@capseasy/shared";

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

const SETTINGS_COMPOSITION = {
  version: 1,
  videoSegments: [{ id: "seg-settings", sourceInMs: 0, sourceOutMs: 10_000 }],
  markers: [{ id: "mk-settings", atMs: 1_000, label: "from settings" }],
  tracks: {
    video: { locked: false, visible: true, muted: false },
    captions: { locked: false, visible: true, muted: false },
    text: { locked: false, visible: true, muted: false },
    graphics: { locked: false, visible: true, muted: false },
  },
};

/** A different, equally valid composition living in the column. */
const COLUMN_COMPOSITION = {
  version: 1,
  videoSegments: [
    { id: "seg-column-1", sourceInMs: 0, sourceOutMs: 5_000 },
    { id: "seg-column-2", sourceInMs: 5_000, sourceOutMs: 20_000 },
  ],
  markers: [{ id: "mk-column", atMs: 7_500, label: "from column" }],
  tracks: {
    video: { locked: true, visible: true, muted: true },
    captions: { locked: false, visible: false, muted: false },
    text: { locked: false, visible: true, muted: false },
    graphics: { locked: false, visible: true, muted: false },
  },
};

const state = vi.hoisted(() => ({
  savePatch: vi.fn(async (_id: string, _patch: Record<string, unknown>) => undefined),
}));

const studioData = {
  project: {
    id: "p1", title: "Stage C", status: "ready", language: "en", aspect_ratio: null,
    look_id: "hormozi_box", template_id: null, style_json: null,
    settings_json: { composition: SETTINGS_COMPOSITION },
    composition_json: COLUMN_COMPOSITION,
    platform: null,
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
    savePatch: state.savePatch,
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

describe("useStudio Stage-C wiring (flag off)", () => {
  it("LOAD: adopts the settings composition, NOT the column value, while STAGE_C_ENABLED is false", async () => {
    const { result } = await renderStudio();
    expect(result.current.settings.composition).toEqual(CompositionSettingsSchema.parse(SETTINGS_COMPOSITION));
    expect(result.current.settings.composition).not.toEqual(CompositionSettingsSchema.parse(COLUMN_COMPOSITION));
  });

  it("PERSIST: the savePatch body has no composition_json key while the flag is off", async () => {
    await renderStudio();
    // style_json is null in the fixture, so the first-open path persists once (debounced)
    await waitFor(() => expect(state.savePatch).toHaveBeenCalled(), { timeout: 3000 });
    for (const call of state.savePatch.mock.calls) {
      const body = call[1] as Record<string, unknown>;
      expect(body).not.toHaveProperty("composition_json");
      expect(body).toHaveProperty("settings_json");
      expect(body).toHaveProperty("style_json");
    }
  });
});
