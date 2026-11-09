import { describe, expect, it, vi } from "vitest";
import { CaptionStyleSchema } from "@capseasy/shared";
import { PACK_LOOKS } from "./pack";
import { PREMIUM_LOOKS } from "./looks/premium";
import { LOOK_NUMBER_ORDER, RETIRED_LOOK_NUMBERS } from "./looks/numbers";
import { KNOWN_FONTS, FALLBACK_TEMPLATE, LOOKS, LOOK_SECTIONS, TEMPLATE_IDS, applyLook, deepMerge, getLook, getTemplate, lookCategories, resolveStyle } from "./index";

describe("template registry", () => {
  it("ships the 8 legacy templates", () => {
    expect(TEMPLATE_IDS.slice(0, 19)).toEqual(["staggered_3line", "glow_stack", "cartoon_stack", "serif_pop", "cinematic_emerald", "word_by_word", "sentence_highlight", "sentence_clean", "karaoke", "boxed_word", "typewriter", "subtitle_bar", "chat_bubble", "highlighter", "kinetic", "glow_flow", "glow_duo", "glow_behind", "metal_script"]);
  });

  it("every template resolves to a fully valid style", () => {
    for (const id of TEMPLATE_IDS) {
      const s = resolveStyle({ templateId: id });
      expect(CaptionStyleSchema.safeParse(s).success).toBe(true);
      expect(s.templateId).toBe(id);
    }
  });

  it("unknown template falls back loudly instead of crashing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(getTemplate("hormozi_block").id).toBe(FALLBACK_TEMPLATE);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("gallery is curated: every look is distinct (no two share template + font + effect + fill kind)", () => {
    expect(LOOKS.length).toBe(39 + PACK_LOOKS.length + PREMIUM_LOOKS.length - RETIRED_LOOK_NUMBERS.size);
    for (const l of LOOKS) expect(l.tags?.length, `${l.id} needs gallery tags`).toBeGreaterThan(0);
    for (const l of LOOKS) expect(l.style.emoji.enabled).toBe(false);
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
    const sig = (l: (typeof LOOKS)[number]) => [l.templateId, l.style.fontId, l.style.active.effect, l.style.fill.type, l.style.background.type].join("|");
    const seen = new Map<string, string>();
    for (const l of LOOKS) {
      const k = sig(l);
      expect(seen.has(k), `${l.id} duplicates ${seen.get(k)}`).toBe(false);
      seen.set(k, l.id);
    }
    for (const l of LOOKS) expect(CaptionStyleSchema.safeParse(l.style).success).toBe(true);
    for (const l of LOOKS) expect(KNOWN_FONTS).toContain(l.style.fontId);
    for (const l of LOOKS) expect(TEMPLATE_IDS).toContain(l.templateId);
    const ALL_NUMBERED = LOOK_NUMBER_ORDER.map((id) => getLook(id)).filter((l): l is NonNullable<typeof l> => !!l);
    // every template is used by at least one look (retired looks count: projects still render with them)
    for (const id of TEMPLATE_IDS) expect(ALL_NUMBERED.some((l) => l.templateId === id), id).toBe(true);
  });

  it("every look has a unique permanent number, and the number list only grows", async () => {
    const { LOOK_NUMBER_ORDER } = await import("./looks/numbers");
    expect(new Set(LOOK_NUMBER_ORDER).size).toBe(LOOK_NUMBER_ORDER.length);
    for (const l of LOOKS) expect(l.number, `${l.id} needs a number: append it to looks/numbers.ts`).toBeGreaterThan(0);
    expect(new Set(LOOKS.map((l) => l.number)).size).toBe(LOOKS.length);
    // retired looks leave the gallery but keep their number and still resolve
    const { RETIRED_LOOK_NUMBERS } = await import("./looks/numbers");
    for (const n of RETIRED_LOOK_NUMBERS) {
      const id = LOOK_NUMBER_ORDER[n - 1]!;
      expect(LOOKS.some((l) => l.id === id), `#${n} ${id} is retired`).toBe(false);
      expect(getLook(id)?.number).toBe(n);
    }
    // pinned: renumbering would break what creators already quote
    expect(getLook("metal_script")?.number).toBe(1);
  });

  it("applyLook returns the look's style and timing settings", () => {
    const look = getLook("beast_bounce")!;
    const { style, settings } = applyLook(look);
    expect(style.templateId).toBe("word_by_word");
    expect(style.fontId).toBe("Luckiest Guy");
    expect(settings.maxWordsPerCard).toBe(1);
  });

  it("gallery sections exist and lead the list in order", () => {
    const ids = LOOK_SECTIONS.flatMap((s) => s.lookIds);
    for (const id of ids) expect(getLook(id), id).toBeDefined();
    expect(LOOKS.slice(0, ids.length).map((l) => l.id)).toEqual(ids);
  });

  it("words per card defaults to 3 for every multi-word look and survives look switches", () => {
    for (const look of LOOKS) {
      const oneWord = getTemplate(look.templateId).layout === "word";
      expect(applyLook(look).settings.maxWordsPerCard, look.id).toBe(oneWord ? 1 : getTemplate(look.templateId).fixedWordsPerCard ?? 3);
    }
    // a creator's own choice is kept when switching between multi-word looks, reset after a one-word look
    expect(applyLook(getLook("karaoke_fill")!, 6).settings.maxWordsPerCard).toBe(6);
    expect(applyLook(getLook("karaoke_fill")!, 1).settings.maxWordsPerCard).toBe(3);
  });

  it("system fonts were swapped for deterministic Google fonts", () => {
    const fonts = new Set(LOOKS.map((l) => l.style.fontId));
    for (const bad of ["Georgia", "Impact", "Consolas", "Comic Sans MS"]) expect(fonts.has(bad)).toBe(false);
  });

  it("deepMerge merges objects, replaces arrays, ignores undefined", () => {
    expect(deepMerge({ a: { b: 1, c: 2 }, d: [1] }, { a: { b: 9 }, d: [2, 3], e: undefined })).toEqual({ a: { b: 9, c: 2 }, d: [2, 3] });
  });

  it("card overrides win over the look", () => {
    const s = resolveStyle({ templateId: "sentence_highlight" }, { fontSize: 99, active: { color: "#123456" } });
    expect(s.fontSize).toBe(99);
    expect(s.active.color).toBe("#123456");
    expect(s.active.effect).toBe("pop");
  });
});

describe("emotion styling", () => {
  it("scales motion at default reactivity, colour only when turned up, never replaces the chosen effect", async () => {
    const { applyEmotion, getTemplate, resolveStyle } = await import("./index");
    const tpl = getTemplate("sentence_highlight");
    const base = resolveStyle({ templateId: "sentence_highlight", active: { effect: "pop", color: "#FFFFFF", scale: 1.1, boxRadius: 12 } });
    expect(applyEmotion(base, tpl, "neutral")).toBe(base);
    const angry = applyEmotion(base, tpl, "angry");
    expect(angry.active.effect).toBe("pop");
    expect(angry.active.color).toBe("#FFFFFF");
    const hot = applyEmotion({ ...base, emotionReactivity: 1 }, tpl, "angry");
    expect(hot.active.color).toBe("#FF3B3B");
    expect(applyEmotion({ ...base, emotionReactivity: 0 }, tpl, "angry")).toEqual({ ...base, emotionReactivity: 0 });
    const calm = resolveStyle({ templateId: "sentence_clean" });
    expect(applyEmotion(calm, getTemplate("sentence_clean"), "angry").active.effect).toBe("none");
    // a look's signature effect is never replaced (regression: Storytime lost its box on 'excited' cards)
    const boxed = resolveStyle({ templateId: "boxed_word" });
    expect(applyEmotion(boxed, getTemplate("boxed_word"), "excited").active.effect).toBe("box");
  });
});
