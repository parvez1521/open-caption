import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from "@/services/api-client";
import {
  CHAT_OUTPUT_TYPES,
  assistantMessageContent,
  buildChatPrompt,
  contextTextForItem,
  parseChatOutput,
  readAssistantPayload,
  readUserText,
  runChatTurn,
  setThreadContext,
  templateChatPayload,
  userMessageContent,
  type ChatTurnResult,
} from "../chat";
import { EMPTY_VOICE, type BrandProfile } from "../brandProfile";
import type { ModelRunner } from "../service";
import type { ContentItem } from "../library";

const makeProfile = (voice: Partial<BrandProfile["voice"]> = {}): BrandProfile => ({
  id: "profile-1",
  name: "Test profile",
  isActive: true,
  colors: [],
  fontId: null,
  voice: { ...EMPTY_VOICE, niche: "home fitness", audience: "busy parents", ...voice },
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
});

describe("CHAT_OUTPUT_TYPES", () => {
  it("labels all seven output types", () => {
    expect(CHAT_OUTPUT_TYPES.map((t) => t.label)).toEqual([
      "Ideas",
      "Hooks",
      "Script",
      "Shot list",
      "7-day calendar",
      "Carousel",
      "Captions",
    ]);
  });
});

describe("buildChatPrompt", () => {
  it("uses the prompts.ts line format for ideas", () => {
    const { system, user } = buildChatPrompt("ideas", "home workouts");
    expect(system).toContain("Follow the requested format exactly");
    expect(user).toContain('Write 6 video content ideas about "home workouts" for Instagram Reels');
    expect(user).toContain("Title :: one-line angle");
  });

  it("uses the prompts.ts line format for captions", () => {
    const { user } = buildChatPrompt("captions", "sourdough");
    expect(user).toContain("Caption text :: #hashtag1 #hashtag2 #hashtag3");
  });

  it("asks for plain hook lines with no style named", () => {
    const { user } = buildChatPrompt("hooks", "morning routines");
    expect(user).toContain('Write 6 opening hooks about "morning routines"');
    expect(user).toContain("first three seconds");
  });

  it("reuses the script BEAT format with the chat defaults (reel, 30s, friendly)", () => {
    const { user } = buildChatPrompt("script", "morning routines");
    expect(user).toContain("BEAT | <startSec>-<endSec> | <label> | <dialogue> | <on-screen text> | <b-roll>");
    expect(user).toContain("lasting exactly 30 seconds");
    expect(user).toContain("friendly");
  });

  it("states the exact formats for shot list, calendar and carousel", () => {
    expect(buildChatPrompt("shot-list", "x").user).toContain("SHOT | <visual> | <action or line> | <duration like 0:03>");
    const cal = buildChatPrompt("calendar", "x").user;
    expect(cal).toContain("exactly 7 lines");
    expect(cal).toContain("Day 1 | <content title> | <format or platform note>");
    expect(buildChatPrompt("carousel", "x").user).toContain("SLIDE | <slide text>");
  });

  it("puts the attached context block before the request", () => {
    const { user } = buildChatPrompt("ideas", "home workouts", { contextText: "My saved hook about mornings" });
    expect(user).toContain("Context the creator attached — stay consistent with it:\nMy saved hook about mornings");
    expect(user.indexOf("Context the creator attached")).toBeLessThan(user.indexOf("Write 6 video content ideas"));
  });

  it("includes the Brand Voice block when a profile is given, and omits it without one", () => {
    const withProfile = buildChatPrompt("ideas", "workouts", { profile: makeProfile() });
    expect(withProfile.user).toContain("Brand voice:");
    expect(withProfile.user).toContain("Niche: home fitness");
    const without = buildChatPrompt("ideas", "workouts");
    expect(without.user).not.toContain("Brand voice:");
  });

  it("carries context and profile into the script prompt too", () => {
    const { user } = buildChatPrompt("script", "routines", {
      contextText: "Attached idea text",
      profile: makeProfile(),
    });
    expect(user).toContain("Context the creator attached");
    expect(user).toContain("Brand voice:");
  });
});

describe("parseChatOutput", () => {
  it("parses ideas via the shared parser", () => {
    const payload = parseChatOutput("ideas", "First idea :: the angle\nSecond idea :: another angle", "topic");
    expect(payload?.items?.map((i) => i.title)).toEqual(["First idea", "Second idea"]);
    expect(payload?.items?.[0]?.detail).toBe("the angle");
  });

  it("parses hooks and leaves the mechanism undefined (no style is chosen in chat)", () => {
    const payload = parseChatOutput(
      "hooks",
      "Nobody tells you this about mornings, and it changes everything.\nStay for the last ten seconds of this one.",
      "mornings",
    );
    expect(payload?.items).toHaveLength(2);
    expect(payload?.items?.[0]?.mechanism).toBeUndefined();
  });

  it("parses captions with hashtags", () => {
    const payload = parseChatOutput("captions", "A friendly caption about bread :: #bread #baking", "bread");
    expect(payload?.items?.[0]?.title).toBe("A friendly caption about bread");
    expect(payload?.items?.[0]?.hashtags).toEqual(["#bread", "#baking"]);
  });

  it("parses a script via the script parser", () => {
    const raw = [
      "TITLE: Mornings, scripted",
      "BEAT | 0-5 | Hook | Stop scrolling, this is the hook line. | Hook text | Close-up to camera",
      "BEAT | 5-30 | Main point | Here is the main point, said plainly. | Main point | Demonstration shot",
      "CTA: Follow for part two.",
      "CAPTION: A caption :: #one #two",
    ].join("\n");
    const payload = parseChatOutput("script", raw, "mornings");
    expect(payload?.script?.title).toBe("Mornings, scripted");
    expect(payload?.script?.beats).toHaveLength(2);
  });

  it("parses shot-list lines into visual + action/duration detail", () => {
    const raw = "SHOT | Kitchen counter wide | Say the opening line | 0:03\nSHOT | Hands kneading dough | Show the fold | 0:05";
    const payload = parseChatOutput("shot-list", raw, "bread");
    expect(payload?.items).toHaveLength(2);
    expect(payload?.items?.[0]).toEqual({ title: "Kitchen counter wide", detail: "Say the opening line · 0:03" });
  });

  it("parses calendar lines and requires at least 4 days", () => {
    const four = ["Day 1 | Idea one | Reel", "Day 2 | Idea two | Short", "Day 3 | Idea three | Reel", "Day 4 | Idea four | Post"].join("\n");
    expect(parseChatOutput("calendar", four, "fitness")?.items).toHaveLength(4);
    const two = "Day 1 | Idea one | Reel\nDay 2 | Idea two | Short";
    expect(parseChatOutput("calendar", two, "fitness")).toBeNull();
  });

  it("parses carousel slides and requires at least 2", () => {
    expect(parseChatOutput("carousel", "SLIDE | First slide text\nSLIDE | Second slide text", "x")?.items).toHaveLength(2);
    expect(parseChatOutput("carousel", "SLIDE | Only one slide here", "x")).toBeNull();
  });

  it("returns null for garbage on every type", () => {
    for (const type of CHAT_OUTPUT_TYPES.map((t) => t.id)) {
      expect(parseChatOutput(type, "!!!\n???", "topic")).toBeNull();
    }
    expect(parseChatOutput("shot-list", "SHOT | Only one visual here | act | 0:03", "x")).toBeNull();
  });
});

describe("templateChatPayload", () => {
  it("derives ideas, hooks and captions from the real generators", () => {
    expect(templateChatPayload("ideas", "home workouts").items).toHaveLength(6);
    const hooks = templateChatPayload("hooks", "morning routines");
    expect(hooks.items).toHaveLength(6);
    // Template hooks declare the curiosity style, so the mechanism is honest here.
    expect(hooks.items?.[0]?.mechanism).toBeTruthy();
    expect(templateChatPayload("captions", "sourdough").items?.length).toBeGreaterThanOrEqual(1);
  });

  it("derives a script payload with beats", () => {
    const payload = templateChatPayload("script", "morning routines");
    expect(payload.script?.beats.length).toBeGreaterThanOrEqual(2);
    expect(payload.script?.durationSec).toBe(30);
  });

  it("derives the shot list from the script: one item per beat", () => {
    const script = templateChatPayload("script", "morning routines").script!;
    const shots = templateChatPayload("shot-list", "morning routines");
    expect(shots.items).toHaveLength(script.beats.length);
    expect(shots.items?.[0]?.title).toBe(script.beats[0]!.broll);
    expect(shots.items?.[0]?.detail).toContain(script.beats[0]!.label);
    expect(shots.items?.[0]?.detail).toContain("Say:");
  });

  it("derives the calendar: 7 items, details prefixed by day", () => {
    const cal = templateChatPayload("calendar", "home workouts");
    expect(cal.items).toHaveLength(7);
    cal.items?.forEach((item, i) => {
      expect(item.detail?.startsWith(`Day ${i + 1} — `)).toBe(true);
    });
  });

  it("derives the carousel from the script: one item per beat, labelled by slide", () => {
    const script = templateChatPayload("script", "morning routines").script!;
    const carousel = templateChatPayload("carousel", "morning routines");
    expect(carousel.items).toHaveLength(script.beats.length);
    expect(carousel.items?.[0]?.detail).toBe(`Slide 1 of ${script.beats.length}`);
    expect(carousel.items?.[0]?.title).toBe(script.beats[0]!.onScreenText || script.beats[0]!.dialogue);
  });
});

describe("runChatTurn routing", () => {
  const goodIdeas: ModelRunner = async () =>
    "Idea one here :: angle one\nIdea two here :: angle two\nIdea three here :: angle three";

  it("uses the template engine when no runner is available", async () => {
    const out = await runChatTurn("ideas", "home workouts", {}, { modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(false);
    expect(out.payload.items).toHaveLength(6);
  });

  it("uses the cloud runner when its output parses", async () => {
    const out = await runChatTurn("ideas", "home workouts", {}, { runCloud: goodIdeas, modelEnabled: false });
    expect(out.source).toBe("cloud");
    expect(out.fellBack).toBe(false);
    expect(out.payload.items?.[0]?.title).toBe("Idea one here");
  });

  it("falls back to templates with a note when the cloud output is garbage", async () => {
    const garbage: ModelRunner = async () => "no usable lines here";
    const out = await runChatTurn("ideas", "home workouts", {}, { runCloud: garbage, modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("free AI service was not available");
    expect(out.payload.items?.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back when the cloud runner throws", async () => {
    const boom: ModelRunner = async () => { throw new Error("rate limited"); };
    const out = await runChatTurn("hooks", "mornings", {}, { runCloud: boom, modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.fellBack).toBe(true);
  });

  it("routes cloud failure to the local model with the cloud-to-local note", async () => {
    const garbage: ModelRunner = async () => "junk";
    const out = await runChatTurn(
      "ideas",
      "home workouts",
      {},
      { runCloud: garbage, modelEnabled: true, runModel: goodIdeas },
    );
    expect(out.source).toBe("model");
    expect(out.fellBack).toBe(true);
    expect(out.note).toContain("local model wrote it");
  });

  it("uses the local model directly when no cloud runner exists", async () => {
    const out = await runChatTurn("ideas", "home workouts", {}, { modelEnabled: true, runModel: goodIdeas });
    expect(out.source).toBe("model");
    expect(out.fellBack).toBe(false);
  });

  it("rejects a one-item cloud batch (below the minimal bar) and falls back", async () => {
    const thin: ModelRunner = async () => "Only one idea :: one angle";
    const out = await runChatTurn("ideas", "home workouts", {}, { runCloud: thin, modelEnabled: false });
    expect(out.source).toBe("template");
  });

  it("passes the context text into the runner prompt", async () => {
    const seen: string[] = [];
    const spy: ModelRunner = async (prompt) => { seen.push(prompt.user); return goodIdeas(prompt); };
    await runChatTurn("ideas", "home workouts", { contextText: "attached context text" }, { runCloud: spy, modelEnabled: false });
    expect(seen[0]).toContain("attached context text");
  });
});

describe("message content shapes and readers", () => {
  it("round-trips a user message", () => {
    expect(readUserText(userMessageContent("hello chat"))).toBe("hello chat");
    expect(readUserText({})).toBe("");
    expect(readUserText(null)).toBe("");
    expect(readUserText("nope")).toBe("");
  });

  it("round-trips an assistant message", () => {
    const result: ChatTurnResult = {
      payload: templateChatPayload("ideas", "home workouts"),
      source: "template",
      fellBack: false,
    };
    const stored = readAssistantPayload(assistantMessageContent(result));
    expect(stored?.source).toBe("template");
    expect(stored?.payload.outputType).toBe("ideas");
    expect(stored?.payload.items).toHaveLength(6);
  });

  it("keeps the fallback note through the round-trip", () => {
    const result: ChatTurnResult = {
      payload: templateChatPayload("hooks", "mornings"),
      source: "template",
      fellBack: true,
      note: "some note",
    };
    expect(readAssistantPayload(assistantMessageContent(result))?.note).toBe("some note");
  });

  it("round-trips a script payload", () => {
    const result: ChatTurnResult = {
      payload: templateChatPayload("script", "mornings"),
      source: "cloud",
      fellBack: false,
    };
    const stored = readAssistantPayload(assistantMessageContent(result));
    expect(stored?.payload.script?.beats.length).toBeGreaterThanOrEqual(2);
  });

  it("returns null for malformed stored content instead of throwing", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "text",
      {},
      { payload: null },
      { payload: { outputType: "essay", items: [{ title: "x" }] } },
      { payload: { outputType: "ideas", items: [] } },
      { payload: { outputType: "ideas", items: [{ noTitle: true }] } },
      { payload: { outputType: "script", script: { title: "t", beats: [] } } },
      { payload: { outputType: "script" } },
    ]) {
      expect(readAssistantPayload(bad)).toBeNull();
    }
  });

  it("drops malformed items but keeps the valid ones", () => {
    const stored = readAssistantPayload({
      payload: { outputType: "ideas", items: [{ title: "Good one" }, { title: 7 }, null] },
      source: "model",
    });
    expect(stored?.payload.items).toHaveLength(1);
    expect(stored?.source).toBe("model");
  });
});

describe("client bridge", () => {
  it("setThreadContext PATCHes the thread route and maps the thread back", async () => {
    const patch = vi.mocked(apiClient.patch);
    patch.mockResolvedValueOnce({
      id: "thread-1",
      title: "Chat",
      contextItemId: "item-1",
      createdAt: "2026-11-10T00:00:00Z",
      updatedAt: "2026-11-10T00:00:00Z",
    });
    const thread = await setThreadContext("thread-1", "item-1");
    expect(patch).toHaveBeenCalledWith("/content/threads/thread-1", { json: { contextItemId: "item-1" } });
    expect(thread.contextItemId).toBe("item-1");
  });

  it("contextTextForItem uses item copy text, script text, or the title", () => {
    const base = { id: "i1", source: "template", folder: null, projectId: null, createdAt: "", updatedAt: "" };
    const itemKind: ContentItem = {
      ...base,
      kind: "idea",
      title: "Saved idea",
      body: { item: { title: "Idea title", detail: "Idea angle" } },
    };
    expect(contextTextForItem(itemKind)).toBe("Idea title\nIdea angle");

    const script = templateChatPayload("script", "morning routines").script!;
    const scriptKind: ContentItem = {
      ...base,
      kind: "script",
      title: script.title,
      body: script as unknown as Record<string, unknown>,
    };
    expect(contextTextForItem(scriptKind)).toContain(script.title);
    expect(contextTextForItem(scriptKind)).toContain(script.beats[0]!.dialogue);

    const plain: ContentItem = { ...base, kind: "hook", title: "Just a title", body: {} };
    expect(contextTextForItem(plain)).toBe("Just a title");
  });
});
