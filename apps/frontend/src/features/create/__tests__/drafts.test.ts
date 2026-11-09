import { beforeEach, describe, expect, it } from "vitest";
import { addDraft, loadDrafts, removeDraft, DRAFTS_KEY, MAX_DRAFTS } from "../drafts";

describe("drafts (localStorage, this device only)", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a saved draft with its source label intact", () => {
    addDraft({ kind: "hooks", source: "template", item: { title: "A hook" } });
    const drafts = loadDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.item.title).toBe("A hook");
    expect(drafts[0]!.source).toBe("template");
    expect(drafts[0]!.savedAt).toBeGreaterThan(0);
  });

  it("keeps model drafts labelled as model drafts", () => {
    addDraft({ kind: "ideas", source: "model", item: { title: "An idea" } });
    expect(loadDrafts()[0]!.source).toBe("model");
  });

  it("removes by id and survives corrupt storage", () => {
    const [d] = addDraft({ kind: "captions", source: "template", item: { title: "Cap", hashtags: ["#x"] } });
    expect(removeDraft(d!.id)).toHaveLength(0);
    localStorage.setItem(DRAFTS_KEY, "{not json");
    expect(loadDrafts()).toEqual([]);
  });

  it("caps the list at MAX_DRAFTS, newest first", () => {
    for (let i = 0; i < MAX_DRAFTS + 5; i++) addDraft({ kind: "ideas", source: "template", item: { title: `Idea ${i}` } });
    const drafts = loadDrafts();
    expect(drafts).toHaveLength(MAX_DRAFTS);
    expect(drafts[0]!.item.title).toBe(`Idea ${MAX_DRAFTS + 4}`);
  });

  it("is a no-op without storage", () => {
    expect(loadDrafts(null)).toEqual([]);
    expect(addDraft({ kind: "ideas", source: "template", item: { title: "x" } }, null)).toEqual([]);
  });
});
