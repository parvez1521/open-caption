import { describe, expect, it, vi } from "vitest";

/**
 * Slice 5.4: the clip-title module's contract with the Phase-3 routing, with
 * `generateContent` itself mocked at the module boundary: the title call must
 * go out as ONE "hooks" item whose topic is the segment's opening text, and the
 * outcome's source / fellBack / note must propagate untouched to the result the
 * creation UI badges. (End-to-end routing behaviour with fake runners lives in
 * clipTitle.test.ts; the service's own routing is pinned by service.test.ts.)
 */
const state = vi.hoisted(() => ({
  calls: [] as Array<{ kind: string; input: Record<string, unknown>; deps: unknown }>,
  outcome: null as unknown,
}));

vi.mock("../create/service", () => ({
  generateContent: async (kind: string, input: Record<string, unknown>, deps: unknown) => {
    state.calls.push({ kind, input, deps });
    return state.outcome;
  },
}));

import { generateClipTitle } from "./clipTitle";

const deps = { modelEnabled: false };

describe("generateClipTitle with generateContent mocked", () => {
  it("asks the routing for one hooks item on the segment text, deps passed through", async () => {
    state.calls = [];
    state.outcome = { items: [{ title: "A generated clip title" }], source: "cloud", fellBack: false };
    const out = await generateClipTitle(
      { sourceTitle: "Source", segmentText: "the segment opening words", startMs: 0, endMs: 30_000 },
      deps,
    );
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]!.kind).toBe("hooks");
    expect(state.calls[0]!.input).toMatchObject({ topic: "the segment opening words", count: 1, platform: "shorts" });
    expect(state.calls[0]!.deps).toBe(deps);
    expect(out).toEqual({ title: "A generated clip title", source: "cloud", fellBack: false, note: undefined });
  });

  it("propagates a labelled fallback (source + fellBack + note) untouched", async () => {
    state.outcome = {
      items: [{ title: "A template hook title" }],
      source: "template",
      fellBack: true,
      note: "The free AI service was not available for this batch. So it came from the template engine instead.",
    };
    const out = await generateClipTitle(
      { sourceTitle: "Source", segmentText: "words", startMs: 0, endMs: 30_000 },
      deps,
    );
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("template engine");
    expect(out.title).toBe("A template hook title");
  });

  it("an empty batch becomes the plain range title, reported as template with a note — never a fake generated title", async () => {
    state.outcome = { items: [], source: "cloud", fellBack: false };
    const out = await generateClipTitle(
      { sourceTitle: "My podcast", segmentText: "words", startMs: 32_000, endMs: 65_000 },
      deps,
    );
    expect(out.title).toBe("My podcast · Clip 0:32–1:05");
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("plain range title");
  });
});
