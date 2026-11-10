import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, TRANSLATION_MODELS } from "@capseasy/shared";
import { TranslatePanel } from "../panels/TranslatePanel";

const doc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [{ id: "w0", text: "Hello", startMs: 0, endMs: 400 }],
});

describe("TranslatePanel", () => {
  it("the picker lists ONLY verified pairs — no Portuguese, no unregistered languages", () => {
    const html = renderToStaticMarkup(
      <TranslatePanel projectId="p1" doc={doc} settings={ProjectSettingsSchema.parse({})} patch={vi.fn()} translations={{}} onTranslated={vi.fn()} />,
    );
    for (const m of TRANSLATION_MODELS) {
      expect(html).toContain(m.targetLabel);
      expect(html).toContain(`~${m.approxDownloadMb} MB`);
    }
    expect(html).not.toContain("Portuguese");
    expect(html).not.toContain('value="pt"');
    // honest labelling: on-device machine translation, never dressed up as AI/human
    expect(html).toContain("On-device machine translation (OPUS-MT)");
    expect(html).not.toMatch(/AI translation|human translation, not|powered by AI/i);
  });

  it("shows the model licence line + bilingual toggle state for a chosen target", () => {
    const html = renderToStaticMarkup(
      <TranslatePanel
        projectId="p1"
        doc={doc}
        settings={ProjectSettingsSchema.parse({ translateTo: "de", bilingual: false })}
        patch={vi.fn()}
        translations={{}}
        onTranslated={vi.fn()}
      />,
    );
    // the panel shows the plain model name + licence; the raw model id lives on /credits
    expect(html).toContain("OPUS-MT");
    expect(html).not.toContain("Xenova/");
    expect(html).toContain("CC-BY-4.0");
    expect(html).toContain("Bilingual captions");
  });
});
