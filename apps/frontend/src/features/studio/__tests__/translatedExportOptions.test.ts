import { describe, expect, it } from "vitest";
import { EXPORT_OPTIONS, optionKey, translatedTextOptions } from "../exportOptions";

describe("translated export options (slice 5.1)", () => {
  it("one SRT + one VTT per saved track, keyed distinctly from the primary rows", () => {
    const opts = translatedTextOptions([
      { lang: "es", label: "Spanish" },
      { lang: "de", label: "German" },
    ]);
    expect(opts.map((o) => optionKey(o))).toEqual(["srt:es", "vtt:es", "srt:de", "vtt:de"]);
    expect(opts.map((o) => o.language)).toEqual(["es", "es", "de", "de"]);
    expect(opts[0]!.title).toContain("Spanish");
    // primary rows keep their plain kind keys
    expect(EXPORT_OPTIONS.map((o) => optionKey(o))).toEqual(EXPORT_OPTIONS.map((o) => o.kind));
  });

  it("no saved tracks -> no translated rows", () => {
    expect(translatedTextOptions([])).toEqual([]);
  });
});
