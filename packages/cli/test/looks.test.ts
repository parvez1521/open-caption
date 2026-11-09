import { describe, expect, it } from "vitest";
import { getTemplate } from "@capseasy/templates";
import { CONTROL_DEFS, describeLook, listLooks, lookBase, resolveLook, visibility } from "../src/looks";
import { CaptionsEasyError } from "../src/errors";

describe("listLooks", () => {
  it("lists the gallery with permanent numbers, no retired looks", () => {
    const all = listLooks();
    expect(all.length).toBe(129); // 99 + 22 Premium Plus looks (2026-11-09) + 8 Slice 1 showcase looks (2026-11-09)
    expect(all[0]).toMatchObject({ number: 1, id: "metal_script", section: "viral" });
    expect(new Set(all.map((l) => l.number)).size).toBe(all.length);
    expect(all.some((l) => l.number === 46)).toBe(false); // retired
    for (const l of all) expect(Boolean(l.name && l.description && l.layout && l.wordsPerCard >= 1)).toBe(true);
  });

  it("filters by query, tag and section", () => {
    expect(listLooks({ query: "neon" }).every((l) => JSON.stringify(l).toLowerCase().includes("neon"))).toBe(true);
    expect(listLooks({ query: "12" }).some((l) => l.number === 12)).toBe(true);
    const box = listLooks({ tags: ["box"] });
    expect(box.length).toBeGreaterThan(0);
    expect(box.every((l) => l.tags.some((t) => /box/i.test(t)))).toBe(true);
    expect(listLooks({ section: "popular" }).map((l) => l.id)).toContain("hormozi_box");
    expect(listLooks({ query: "zzzz-nothing" })).toEqual([]);
  });
});

describe("describeLook", () => {
  it("resolves numbers, '#n' and ids", () => {
    expect(resolveLook(12).id).toBe("hormozi_box");
    expect(resolveLook("#12").id).toBe("hormozi_box");
    expect(resolveLook("hormozi_box").number).toBe(12);
    expect(resolveLook(46).id).toBe("estate_blend_word"); // retired looks still resolve
    expect(() => resolveLook(9999)).toThrow(CaptionsEasyError);
    expect(() => resolveLook("not_a_look")).toThrow(/Unknown look/);
  });

  it("look 118 lists only controls its template honours", () => {
    const d = describeLook(118);
    expect(d).toMatchObject({ number: 118, id: "difference_invert", retired: false });
    const keys = d.controls.map((c) => c.key);
    expect(keys).toContain("fontSize");
    expect(keys).not.toContain("background.type"); // this template has no background
    expect(d.controls.find((c) => c.key === "active.effect")!.options).toEqual(["none", "box"]);
    expect(d.defaults.fontSize).toBe(118);
  });

  it("every listed control is honoured (controlVisible, or after its prerequisite) for every look", () => {
    for (const l of listLooks()) {
      const look = resolveLook(l.id);
      const t = getTemplate(look.templateId);
      const { style } = lookBase(look);
      for (const c of describeLook(l.id).controls) {
        const def = CONTROL_DEFS.find((x) => x.key === c.key)!;
        expect(visibility(def, t, style).visible).toBe(true);
        if (c.type === "number") {
          expect(typeof c.min).toBe("number");
          expect(typeof c.max).toBe("number");
          if (typeof c.default === "number") expect(c.default >= c.min! && c.default <= c.max!).toBe(true);
        }
        if (c.type === "enum") expect(c.options!.length).toBeGreaterThan(1);
      }
    }
  });

  it("one-word looks have no words-per-card setting", () => {
    const oneWord = listLooks().find((l) => l.layout === "word")!;
    expect(describeLook(oneWord.id).settings.map((s) => s.key)).not.toContain("maxWordsPerCard");
    expect(describeLook(12).settings.map((s) => s.key)).toContain("maxWordsPerCard");
  });
});
