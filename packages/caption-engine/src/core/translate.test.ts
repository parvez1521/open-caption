import { describe, expect, it } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, translationModelFor, type CaptionDoc } from "@capseasy/shared";
import { derivePages } from "./derive";
import { buildTranslatedDoc, translationUnits } from "./translate";

const settings = ProjectSettingsSchema.parse({ maxWordsPerCard: 3, pauseMs: 400 });

const docOf = (words: { text: string; startMs: number; endMs: number }[]): CaptionDoc =>
  CaptionDocSchema.parse({
    version: 2,
    language: "en",
    words: words.map((w, i) => ({ id: `w${i}`, ...w })),
  });

const SOURCE = docOf([
  { text: "Hello", startMs: 0, endMs: 300 },
  { text: "brave", startMs: 320, endMs: 620 },
  { text: "world", startMs: 640, endMs: 1000 },
  { text: "Second", startMs: 3000, endMs: 3400 },
  { text: "card", startMs: 3420, endMs: 3800 },
  { text: "here", startMs: 3820, endMs: 4200 },
]);

describe("translationUnits", () => {
  it("splits the doc into its derived cards with text and windows", () => {
    const units = translationUnits(SOURCE, settings);
    expect(units.length).toBe(2);
    expect(units[0]).toMatchObject({ text: "Hello brave world", startMs: 0 });
    expect(units[1]).toMatchObject({ text: "Second card here", startMs: 3000 });
    expect(units[0]!.endMs).toBeLessThan(units[1]!.startMs);
  });

  it("an empty doc has no units", () => {
    expect(translationUnits(docOf([]), settings)).toEqual([]);
  });
});

describe("buildTranslatedDoc", () => {
  const es = translationModelFor("es")!;

  it("produces a schema-valid doc in the target language with provenance", () => {
    const units = translationUnits(SOURCE, settings);
    const out = buildTranslatedDoc(SOURCE, units, ["Hola mundo valiente", "Segunda tarjeta aquí"], es);
    expect(out.language).toBe("es");
    expect(out.meta.translatedFrom).toEqual({
      sourceLanguage: "en",
      modelId: "Xenova/opus-mt-en-es",
      modelRevision: es.revision,
      derivedWordTimings: true,
    });
    expect(out.words.map((w) => w.text)).toEqual(["Hola", "mundo", "valiente", "Segunda", "tarjeta", "aquí"]);
  });

  it("line timings carry over: each card's words stay inside the source card's window, first/last pinned", () => {
    const units = translationUnits(SOURCE, settings);
    const out = buildTranslatedDoc(SOURCE, units, ["Hola mundo valiente", "Segunda tarjeta aquí"], es);
    const cardA = out.words.slice(0, 3);
    const cardB = out.words.slice(3);
    expect(cardA[0]!.startMs).toBe(units[0]!.startMs);
    expect(cardA[cardA.length - 1]!.endMs).toBe(units[0]!.endMs);
    expect(cardB[0]!.startMs).toBe(units[1]!.startMs);
    expect(cardB[cardB.length - 1]!.endMs).toBe(units[1]!.endMs);
    // monotone, non-overlapping, positive durations
    for (const ws of [cardA, cardB]) {
      for (let i = 0; i < ws.length; i++) {
        expect(ws[i]!.endMs).toBeGreaterThan(ws[i]!.startMs);
        if (i > 0) expect(ws[i]!.startMs).toBe(ws[i - 1]!.endMs);
      }
    }
    // longer words get proportionally more time than shorter ones
    const hola = cardA[0]!;
    const mundo = cardA[1]!;
    expect(mundo.endMs - mundo.startMs).toBeGreaterThan(hola.endMs - hola.startMs);
  });

  it("card structure mirrors the source: manualBreaks reproduce the same pages", () => {
    const units = translationUnits(SOURCE, settings);
    const out = buildTranslatedDoc(SOURCE, units, ["Hola mundo valiente", "Segunda tarjeta aquí"], es);
    expect(out.manualBreaks).toEqual([out.words[3]!.id]);
    const pages = derivePages(out, settings);
    expect(pages.length).toBe(2);
    expect(pages.map((p) => p.words.map((w) => w.text).join(" "))).toEqual(["Hola mundo valiente", "Segunda tarjeta aquí"]);
  });

  it("a count mismatch throws instead of misaligning the track", () => {
    const units = translationUnits(SOURCE, settings);
    expect(() => buildTranslatedDoc(SOURCE, units, ["only one"], es)).toThrow(/count mismatch/);
  });

  it("an empty translation for a card leaves that card untranslated, others intact", () => {
    const units = translationUnits(SOURCE, settings);
    const out = buildTranslatedDoc(SOURCE, units, ["", "Segunda tarjeta aquí"], es);
    expect(out.words.map((w) => w.text)).toEqual(["Segunda", "tarjeta", "aquí"]);
    expect(out.manualBreaks).toEqual([]);
  });
});
