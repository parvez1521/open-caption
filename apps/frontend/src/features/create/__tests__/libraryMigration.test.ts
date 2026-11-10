import { describe, expect, it } from "vitest";
import {
  draftToContentInput,
  extractItemText,
  generatorKindToContentKind,
  isScriptDocBody,
  planDraftMigration,
  scriptDocFromBody,
  scriptSummary,
} from "../libraryMigration";
import type { Draft } from "../drafts";
import type { ContentItem } from "../library";
import { generateScript, scriptToText } from "../scripts";

const draft = (over: Partial<Draft> = {}): Draft => ({
  id: "d1",
  kind: "ideas",
  source: "template",
  item: { title: "An idea", detail: "Angle: test" },
  savedAt: 1700000000000,
  ...over,
});

const contentItem = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: "c1",
  kind: "idea",
  title: "An idea",
  body: {},
  source: "template",
  folder: null,
  projectId: null,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("generatorKindToContentKind", () => {
  it("maps every generator kind to its singular library kind", () => {
    expect(generatorKindToContentKind("ideas")).toBe("idea");
    expect(generatorKindToContentKind("hooks")).toBe("hook");
    expect(generatorKindToContentKind("captions")).toBe("caption");
    expect(generatorKindToContentKind("repurpose")).toBe("repurpose");
  });
});

describe("draftToContentInput / planDraftMigration", () => {
  it("maps a draft to a content input with the item in the body and the source preserved", () => {
    const input = draftToContentInput(draft({ kind: "hooks", source: "cloud", item: { title: "A hook", detail: "Made for Reels" } }));
    expect(input.kind).toBe("hook");
    expect(input.title).toBe("A hook");
    expect(input.source).toBe("cloud");
    expect(input.body).toEqual({ item: { title: "A hook", detail: "Made for Reels" } });
  });

  it("caps the title at 200 characters", () => {
    const long = "x".repeat(300);
    expect(draftToContentInput(draft({ item: { title: long } })).title).toHaveLength(200);
  });

  it("plans the whole list in order and handles an empty list", () => {
    const plan = planDraftMigration([
      draft({ id: "a", kind: "ideas", item: { title: "One" } }),
      draft({ id: "b", kind: "captions", item: { title: "Two", hashtags: ["#x"] } }),
    ]);
    expect(plan.map((p) => [p.kind, p.title])).toEqual([
      ["idea", "One"],
      ["caption", "Two"],
    ]);
    expect(planDraftMigration([])).toEqual([]);
  });
});

describe("extractItemText", () => {
  it("uses itemCopyText for { item } bodies (title, detail, hashtags)", () => {
    const item = contentItem({
      kind: "caption",
      body: { item: { title: "Caption text", detail: "A detail", hashtags: ["#a", "#b"] } },
    });
    expect(extractItemText(item)).toBe("Caption text\nA detail\n#a #b");
  });

  it("uses scriptToText for script bodies saved as a ScriptDoc", () => {
    const doc = generateScript({ topic: "morning routines", format: "reel", durationSec: 30, tone: "friendly" });
    const item = contentItem({ kind: "script", title: doc.title, body: doc as unknown as Record<string, unknown> });
    expect(extractItemText(item)).toBe(scriptToText(doc));
    expect(extractItemText(item)).toContain(doc.title);
  });

  it("recognises a script-shaped body even without the script kind", () => {
    const doc = generateScript({ topic: "sourdough", format: "short", durationSec: 30, tone: "bold" });
    const item = contentItem({ kind: "chat-output", title: doc.title, body: doc as unknown as Record<string, unknown> });
    expect(extractItemText(item)).toBe(scriptToText(doc));
  });

  it("joins plain { title, detail } bodies", () => {
    const item = contentItem({ body: { title: "Plain title", detail: "Plain detail" } });
    expect(extractItemText(item)).toBe("Plain title\nPlain detail");
  });

  it("joins hashtag-group tags and falls back to the item title for empty bodies", () => {
    expect(extractItemText(contentItem({ kind: "hashtag-group", title: "Fitness", body: { tags: ["#fit", "#gym"] } }))).toBe("#fit #gym");
    expect(extractItemText(contentItem({ title: "Just a title", body: {} }))).toBe("Just a title");
    expect(extractItemText(contentItem({ title: "T", body: { item: "not-an-item" } }))).toBe("T");
  });
});

describe("script helpers", () => {
  it("isScriptDocBody / scriptDocFromBody are defensive", () => {
    expect(isScriptDocBody(null)).toBe(false);
    expect(isScriptDocBody({ title: "x" })).toBe(false);
    expect(isScriptDocBody({ title: "x", beats: [] })).toBe(true);
    expect(scriptDocFromBody({ title: "x", beats: [] })).toBeNull();
    const doc = scriptDocFromBody({ title: "x", beats: [{ dialogue: "Hello" }] });
    expect(doc?.beats[0]).toMatchObject({ label: "Beat 1", dialogue: "Hello", startSec: 0 });
  });

  it("scriptSummary renders format, duration and beat count", () => {
    const doc = generateScript({ topic: "trail running", format: "reel", durationSec: 30, tone: "friendly" });
    const item = contentItem({ kind: "script", title: doc.title, body: doc as unknown as Record<string, unknown> });
    expect(scriptSummary(item)).toBe(`Script · reel · 30s · ${doc.beats.length} beats`);
    expect(scriptSummary(contentItem({ kind: "idea", body: {} }))).toBeNull();
  });
});
