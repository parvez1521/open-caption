/**
 * Regression guard for the template picker (owner bug report, 2026-11-10): EVERY registered look must
 * produce a renderable live preview through the EXACT path the picker uses — its own Page via PageView
 * over the picker's synthetic five-word page ("Make every single word count", 480 ms stagger, page
 * 0–2700 ms), on the picker's 1080×405 canvas, with the picker's font-size boost. A future template
 * whose Page throws, renders nothing at every moment, or never shows any of the sample words fails
 * here loudly, by id. (The picker's live-mount machinery itself — slots, visibility, recycling — is
 * guarded in apps/frontend/src/features/studio/__tests__/animatedPreview.test.tsx.)
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Page, Word } from "@capseasy/shared";
import { PageView } from "./PageView";
import { LOOKS } from "./registry";
import { measure } from "./measure";

/** Mirrors AnimatedTemplatePreview's PREVIEW_PAGE / CANVAS / style boost exactly. */
const SAMPLE_WORDS: Word[] = ["Make", "every", "single", "word", "count"].map((text, i) => ({
  id: `preview-${i}`,
  text,
  startMs: i * 480,
  endMs: i * 480 + 400,
})) as Word[];
const PREVIEW_PAGE: Page = {
  id: "template-preview",
  startMs: 0,
  endMs: 2700,
  words: SAMPLE_WORDS,
  lines: [SAMPLE_WORDS],
  heroIndex: 4,
  emotion: "neutral",
  position: null,
  styleOverride: null,
} as Page;
const CANVAS = { width: 1080, height: 405, fps: 30 };
const TIMES = Array.from({ length: 23 }, (_, i) => i * 120); // 0..2640 ms across the whole loop

/** Text evidence from static markup: DOM text nodes joined (letter-split layouts reassemble), with
 *  shadow-duplicate letter runs collapsed; canvas-painted layouts instead carry glyph specs in a
 *  data-* attribute (their pixels are drawn in an effect, so the spec IS the render contract). */
function hasSampleText(html: string): boolean {
  const textNodes = [...html.matchAll(/>([^<]+)</g)].map((m) => m[1]).join("");
  const letters = textNodes.toLowerCase().replace(/(.)\1+/g, "$1").replace(/[^a-z]/g, "");
  if (["make", "every", "single", "word", "count"].some((w) => letters.includes(w))) return true;
  if (!html.includes("<canvas")) return false;
  const glyphs = (html.match(/&quot;ch&quot;:/g) ?? []).length;
  if (glyphs >= 3) return true;
  // e.g. the knockout layout's spec carries the spoken word itself: "text":"SINGLE"
  return ["make", "every", "single", "word", "count"].some((w) => new RegExp(`&quot;${w}&quot;`, "i").test(html));
}

describe("every registered look renders a picker preview (Bug 1 guard)", () => {
  it("the gallery is enumerated (guard cannot silently shrink to zero)", () => {
    expect(LOOKS.length).toBeGreaterThanOrEqual(141);
  });

  for (const look of LOOKS) {
    it(`${look.id} (template ${look.style.templateId}) renders the sample line`, () => {
      const style = { ...look.style, fontSize: Math.min(260, look.style.fontSize * 2.4) };
      let joined = "";
      for (const t of TIMES) {
        // a throw here fails the test with the look's id in the test name
        joined += renderToStaticMarkup(<PageView page={PREVIEW_PAGE} timeMs={t} style={style} canvas={CANVAS} measure={measure} />);
      }
      expect(joined.length).toBeGreaterThan(500);
      expect(hasSampleText(joined)).toBe(true);
    });
  }
});
