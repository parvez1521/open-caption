import { describe, expect, it } from "vitest";
import { parseArgs, parseSets } from "../src/args";

describe("parseArgs", () => {
  it("parses looks / look / transcribe / mcp / help / version", () => {
    expect(parseArgs(["looks", "bold", "neon", "--json"])).toEqual({ cmd: "looks", query: "bold neon", tags: [], section: undefined, json: true });
    expect(parseArgs(["look", "118"])).toEqual({ cmd: "look", ref: "118", json: false });
    expect(parseArgs(["transcribe", "a.mp4", "--language", "hi", "--out", "w.json"])).toEqual({ cmd: "transcribe", video: "a.mp4", language: "hinglish", out: "w.json", json: false });
    expect(parseArgs(["mcp"])).toEqual({ cmd: "mcp" });
    expect(parseArgs([])).toEqual({ cmd: "help", topic: undefined });
    expect(parseArgs(["--version"])).toEqual({ cmd: "version" });
  });

  it("parses a caption run", () => {
    const c = parseArgs(["talk.mp4", "--look", "12", "--set", "active.color=#FF3366", "--set=maxWordsPerCard=2", "--format", "webm", "-o", "out.webm", "--json"]);
    expect(c).toEqual({
      cmd: "caption",
      video: "talk.mp4",
      look: "12",
      words: undefined,
      language: "en",
      style: { "active.color": "#FF3366" },
      settings: { maxWordsPerCard: "2" },
      overlay: true,
      format: "webm",
      out: "out.webm",
      concurrency: undefined,
      json: true,
    });
    expect(parseArgs(["caption", "v.mov", "-l", "hormozi_box", "--words", "w.json"])).toMatchObject({ cmd: "caption", video: "v.mov", look: "hormozi_box", words: "w.json", overlay: false });
  });

  it("explains mistakes", () => {
    expect(() => parseArgs(["talk.mp4"])).toThrow(/--look/);
    expect(() => parseArgs(["talk.mp4", "--look"])).toThrow(/needs a value/);
    expect(() => parseArgs(["talk.mp4", "--look", "1", "--bogus"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["talk.mp4", "--look", "1", "--set", "nokey"])).toThrow(/key=value/);
    expect(() => parseArgs(["talk.mp4", "--look", "1", "--format", "avi"])).toThrow(/mov or webm/);
    expect(() => parseArgs(["talk.mp4", "--look", "1", "--concurrency", "0"])).toThrow(/concurrency/);
    expect(() => parseArgs(["transcribe", "a.mp4", "--language", "fr"])).toThrow(/language/);
  });

  it("routes --set keys to style or pacing settings", () => {
    expect(parseSets(["fontSize=80", "settings.holdMs=200", "pauseMs=300", "style.glow.enabled=true", "active.color=#F00=x"])).toEqual({
      style: { fontSize: "80", "glow.enabled": "true", "active.color": "#F00=x" },
      settings: { holdMs: "200", pauseMs: "300" },
    });
  });
});
