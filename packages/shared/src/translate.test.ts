import { describe, expect, it } from "vitest";
import { CaptionDocSchema } from "./doc";
import { ProjectSettingsSchema } from "./settings";
import { TRANSLATION_MODELS, TRANSLATION_TARGET_LANGS, translationModelFor } from "./translate";

describe("translation registry (licence pinning)", () => {
  it("every registered pair carries a complete licence record", () => {
    expect(TRANSLATION_MODELS.length).toBeGreaterThan(0);
    for (const m of TRANSLATION_MODELS) {
      // the notices surface renders these fields; a missing one must fail HERE, not ship silently
      expect(m.modelId, m.targetLang).toMatch(/^Xenova\/opus-mt-en-/);
      expect(m.upstreamId, m.targetLang).toMatch(/^Helsinki-NLP\/opus-mt-en-/);
      expect(m.revision, m.targetLang).toMatch(/^[0-9a-f]{40}$/);
      expect(["Apache-2.0", "CC-BY-4.0"], m.targetLang).toContain(m.license);
      expect(m.attribution, m.targetLang).toContain("Helsinki");
      expect(m.approxDownloadMb, m.targetLang).toBeGreaterThan(0);
      expect(m.targetLabel.length, m.targetLang).toBeGreaterThan(0);
    }
  });

  it("target langs are unique and lookup agrees with the registry", () => {
    expect(new Set(TRANSLATION_TARGET_LANGS).size).toBe(TRANSLATION_TARGET_LANGS.length);
    for (const lang of TRANSLATION_TARGET_LANGS) expect(translationModelFor(lang)?.targetLang).toBe(lang);
    expect(translationModelFor("pt")).toBeNull(); // no opus-mt-en-pt repo exists — pair excluded, see translate.ts
    expect(translationModelFor("xx")).toBeNull();
    expect(translationModelFor(null)).toBeNull();
  });

  it("the German pair is the CC-BY-4.0 checkpoint (attribution duty)", () => {
    expect(translationModelFor("de")?.license).toBe("CC-BY-4.0");
  });
});

describe("settings wiring (translateTo / bilingual are live fields)", () => {
  it("defaults: no target, bilingual off", () => {
    const s = ProjectSettingsSchema.parse({});
    expect(s.translateTo).toBeNull();
    expect(s.bilingual).toBe(false);
  });

  it("accepts every verified pair as translateTo", () => {
    for (const lang of TRANSLATION_TARGET_LANGS) {
      expect(ProjectSettingsSchema.parse({ translateTo: lang, bilingual: true }).translateTo).toBe(lang);
    }
  });

  it("rejects unverified or unknown targets instead of storing a dead value", () => {
    expect(ProjectSettingsSchema.safeParse({ translateTo: "pt" }).success).toBe(false);
    expect(ProjectSettingsSchema.safeParse({ translateTo: "xx" }).success).toBe(false);
    expect(ProjectSettingsSchema.safeParse({ translateTo: "klingon" }).success).toBe(false);
  });
});

describe("translated doc provenance", () => {
  it("CaptionDoc meta carries the translation provenance record", () => {
    const doc = CaptionDocSchema.parse({
      version: 2,
      language: "es",
      words: [{ id: "mt-0-0", text: "Hola", startMs: 0, endMs: 500 }],
      meta: {
        translatedFrom: {
          sourceLanguage: "en",
          modelId: "Xenova/opus-mt-en-es",
          modelRevision: "4b002a4c7edd54a7ced58877258b87f7efd3f892",
          derivedWordTimings: true,
        },
      },
    });
    expect(doc.meta.translatedFrom?.derivedWordTimings).toBe(true);
    // a primary (ASR) doc has no provenance
    expect(CaptionDocSchema.parse({ version: 2, words: [] }).meta.translatedFrom).toBeUndefined();
  });
});
