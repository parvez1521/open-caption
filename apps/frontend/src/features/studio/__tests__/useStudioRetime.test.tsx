/**
 * useStudio layer probe for the timeline edge-resize bug (owner video 2026-11-13):
 * the Timeline fires onRetimeRun and retimeRun stretches correctly, so the next
 * suspect is the edit/save/adoption layer. This drives the REAL useStudio hook
 * (mocked server only) through a retime edit, the debounced save, and a server
 * refetch — the doc must keep the retimed end through all of it.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, type CaptionDoc, type Word } from "@capseasy/shared";
import { retimeRun } from "@motion-ai/caption-engine/core";
import { useStudio } from "../useStudio";
import type { StudioData } from "@/services/studio";

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });
const initialDoc: CaptionDoc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    word("w1", "hi", 14400, 14700),
    word("w2", "jagah", 14700, 15000),
    word("w3", "rah", 15000, 15300),
    word("w4", "rahi", 15300, 15600),
    word("w5", "ho,", 15600, 15900),
    word("w6", "mein", 20300, 20600),
    word("w7", "aur", 20600, 20900),
    word("w8", "raat", 20900, 21200),
  ],
});

// mutable fake server: the test changes what getStudio returns between steps
const server = vi.hoisted(() => ({
  doc: null as CaptionDoc | null,
  revision: 1,
  savedDocs: [] as CaptionDoc[],
}));

vi.mock("@/services/studio", () => ({
  RevisionConflict: class extends Error {},
  studioService: {
    getStudio: vi.fn(async () => ({
      project: { id: "proj-1", title: "t", status: null, language: "en", aspect_ratio: null, look_id: null, template_id: null, style_json: null, settings_json: null, platform: null },
      video: { id: "v1", status: "ready", url: null, width: 1080, height: 1920, fps: 30, durationMs: 31500, hasAudio: true, filename: "v.mp4", size: 1000 },
      document: { revision: server.revision, doc: server.doc },
      job: null,
      canTranscribe: false,
      cloudAvailable: false,
    }) as unknown as StudioData),
    saveDocument: vi.fn(async (_projectId: string, _rev: number, doc: CaptionDoc) => {
      server.savedDocs.push(doc);
      server.revision += 1;
      return server.revision;
    }),
    savePatch: vi.fn(async () => ({})),
  },
}));

vi.mock("@/features/transcribe/session", () => ({ hasActiveSession: () => false }));

type Studio = ReturnType<typeof useStudio>;
let latest: Studio | null = null;
function Probe() {
  const s = useStudio("proj-1");
  latest = s;
  return null;
}

const renderProbe = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Probe />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  server.doc = initialDoc;
  server.revision = 1;
  server.savedDocs = [];
  latest = null;
});

describe("useStudio keeps a retime edit through save + refetch", () => {
  it("retime edit lands, saves, and survives a server refetch", async () => {
    renderProbe();
    await waitFor(() => expect(latest?.doc).not.toBeNull());
    expect(latest!.doc!.words[4]!.endMs).toBe(15900);

    act(() => {
      latest!.edit((d) => retimeRun(d, "w1", "w5", 14400, 17398, false));
    });
    expect(latest!.doc!.words[4]!.endMs).toBe(17398);

    // debounced save (800 ms) sends the retimed doc to the server
    await waitFor(() => expect(server.savedDocs.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(server.savedDocs[server.savedDocs.length - 1]!.words[4]!.endMs).toBe(17398);

    // server now holds the retimed doc at the new revision; a refetch must not revert it
    server.doc = server.savedDocs[server.savedDocs.length - 1]!;
    await act(async () => {
      await latest!.refetch();
    });
    await waitFor(() => expect(latest!.query.isFetching).toBe(false));
    expect(latest!.doc!.words[4]!.endMs).toBe(17398);
  });

  it("a stale server doc does not overwrite local edits on refetch", async () => {
    renderProbe();
    await waitFor(() => expect(latest?.doc).not.toBeNull());
    act(() => {
      latest!.edit((d) => retimeRun(d, "w1", "w5", 14400, 17398, false));
    });
    expect(latest!.doc!.words[4]!.endMs).toBe(17398);

    // server still has the ORIGINAL doc (e.g. save not yet flushed); refetch must not revert
    server.doc = initialDoc;
    server.revision = 1;
    await act(async () => {
      await latest!.refetch();
    });
    await waitFor(() => expect(latest!.query.isFetching).toBe(false));
    expect(latest!.doc!.words[4]!.endMs).toBe(17398);
  });
});
