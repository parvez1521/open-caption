import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TRANSLATION_MODELS } from "@capseasy/shared";
import CreditsPage from "@/app/(legal)/credits/page";

/**
 * Registry ↔ notices pinning (slice 5.1): the /credits page is the licence-notices surface for
 * the OPUS-MT translation models. Every model the app can load MUST appear there with its
 * licence and attribution — this test fails if a registered pair is missing from the page,
 * so a future registry addition cannot ship without its licence record becoming public.
 */
describe("credits page translation notices", () => {
  const html = renderToStaticMarkup(<CreditsPage />);

  it("credits every registered translation model with licence + attribution", () => {
    expect(TRANSLATION_MODELS.length).toBeGreaterThan(0);
    for (const m of TRANSLATION_MODELS) {
      expect(html, m.modelId).toContain(m.upstreamId);
      expect(html, m.modelId).toContain(m.modelId); // the ONNX mirror actually downloaded
      expect(html, m.modelId).toContain(m.license);
      expect(html, m.modelId).toContain("Helsinki-NLP");
      expect(html, m.modelId).toContain(m.targetLabel);
    }
  });

  it("carries the CC-BY-4.0 attribution for the German model", () => {
    const de = TRANSLATION_MODELS.find((m) => m.targetLang === "de")!;
    expect(de.license).toBe("CC-BY-4.0");
    expect(html).toContain("CC-BY-4.0");
    expect(html).toContain("Language Technology Research Group, University of Helsinki");
  });
});
