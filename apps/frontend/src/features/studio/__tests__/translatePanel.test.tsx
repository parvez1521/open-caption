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
    }
    // Package 2 item A: the dropdown rows carry NO download sizes — the one honest
    // download line lives in the panel's Details instead (so the size check is scoped
    // to the <option> elements, not the whole panel)
    expect(html).not.toContain("model download");
    const options = [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
    expect(options.length).toBeGreaterThan(1);
    for (const label of options) expect(label).not.toMatch(/MB|download/i);
    expect(html).toContain("First use of a language downloads its model once (~110 MB); after that it works on this device.");
    expect(html).not.toContain("Portuguese");
    expect(html).not.toContain('value="pt"');
    // honest labelling: runs on-device in the browser, never dressed up as AI/human
    expect(html).toContain("Runs entirely in your browser");
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
