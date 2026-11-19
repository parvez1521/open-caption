import { describe, expect, it } from "vitest";
import { CaptionStyleSchema, defaultStyle, type Word } from "@capseasy/shared";
import { applyCasing } from "@motion-ai/caption-engine/core";
import { baseTextCss, displayText } from "./text";

const w = (text: string, source?: "asr" | "user"): Word => ({
  id: `${text}-${source ?? "plain"}`,
  text,
  startMs: 0,
  endMs: 400,
  ...(source ? { source: { text: source } } : {}),
});

/**
 * Owner 2026-11-19: in the Studio he cannot capitalize any word — a capital typed
 * while editing a word does not stick, every word stays lowercase. The stored text
 * was never the problem (setWordText keeps it verbatim); the look's casing transform
 * at render time lowercased every word, including ones he typed by hand.
 */
describe("displayText — a word the user typed keeps the case they typed", () => {
  it("keeps 'Hello' under a lowercase look", () => {
    const style = { ...defaultStyle(), casing: "lower" as const };
    expect(displayText(w("Hello", "user"), style)).toBe("Hello");
  });

  it("keeps 'McDonald' under an UPPERCASE look", () => {
    const style = { ...defaultStyle(), casing: "upper" as const };
    expect(displayText(w("McDonald", "user"), style)).toBe("McDonald");
  });

  it("keeps 'iPhone' under a lowercase look", () => {
    const style = { ...defaultStyle(), casing: "lower" as const };
    expect(displayText(w("iPhone", "user"), style)).toBe("iPhone");
  });

  it("an ASR word still follows the look's lowercase", () => {
    const style = { ...defaultStyle(), casing: "lower" as const };
    expect(displayText(w("Hello", "asr"), style)).toBe("hello");
    expect(displayText(w("Hello"), style)).toBe("hello");
  });

  it("an ASR word still follows the look's uppercase", () => {
    const style = { ...defaultStyle(), casing: "upper" as const };
    expect(displayText(w("mcdonald", "asr"), style)).toBe("MCDONALD");
  });

  it("Title/Sentence casing still applies its first-letter rule to user words", () => {
    expect(displayText(w("hello", "user"), { ...defaultStyle(), casing: "title" as const })).toBe("Hello");
    expect(displayText(w("hello", "user"), { ...defaultStyle(), casing: "sentence" as const })).toBe("Hello");
  });
});

describe("text case — Small Caps is a rendering property, not a string transform", () => {
  it("smallcaps is a valid casing in the style schema", () => {
    expect(CaptionStyleSchema.parse({ ...defaultStyle(), casing: "smallcaps" }).casing).toBe("smallcaps");
  });

  it("applyCasing leaves the text itself untouched for smallcaps", () => {
    expect(applyCasing("Hello World", "smallcaps")).toBe("Hello World");
  });

  it("baseTextCss renders smallcaps via font-variant, and nothing else does", () => {
    expect(baseTextCss({ ...defaultStyle(), casing: "smallcaps" }, 1, 64).fontVariant).toBe("small-caps");
    expect(baseTextCss({ ...defaultStyle(), casing: "lower" }, 1, 64).fontVariant).toBeUndefined();
    expect(baseTextCss(defaultStyle(), 1, 64).fontVariant).toBeUndefined();
  });

  it("displayText leaves the text untouched for smallcaps (the CSS does the work)", () => {
    const style = { ...defaultStyle(), casing: "smallcaps" as const };
    expect(displayText(w("Hello", "asr"), style)).toBe("Hello");
    expect(displayText(w("Hello", "user"), style)).toBe("Hello");
  });
});
