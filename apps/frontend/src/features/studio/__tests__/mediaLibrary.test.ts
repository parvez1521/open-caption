import { describe, expect, it } from "vitest";
import { countByKind, filterLibraryAssets, formatDimensions, formatDurationMs, projectTitleFor, type LibraryAssetLike } from "../mediaLibrary";

const asset = (name: string, kind: LibraryAssetLike["kind"]): LibraryAssetLike => ({ name, kind });

const list: LibraryAssetLike[] = [
  asset("Hook B-Roll.mp4", "video"),
  asset("hook music.mp3", "audio"),
  asset("Logo.PNG", "image"),
  asset("Interview take 2.mov", "video"),
];

describe("filterLibraryAssets", () => {
  it("returns everything for an empty query and the All filter", () => {
    expect(filterLibraryAssets(list, "", "all")).toEqual(list);
    expect(filterLibraryAssets(list, "   ", "all")).toEqual(list);
  });

  it("searches by file name, case-insensitively, trimming the query", () => {
    expect(filterLibraryAssets(list, "  HOOK ", "all").map((a) => a.name)).toEqual(["Hook B-Roll.mp4", "hook music.mp3"]);
    expect(filterLibraryAssets(list, "logo.png", "all").map((a) => a.name)).toEqual(["Logo.PNG"]);
    expect(filterLibraryAssets(list, "zzz", "all")).toEqual([]);
  });

  it("filters by kind", () => {
    expect(filterLibraryAssets(list, "", "video").map((a) => a.name)).toEqual(["Hook B-Roll.mp4", "Interview take 2.mov"]);
    expect(filterLibraryAssets(list, "", "audio").map((a) => a.name)).toEqual(["hook music.mp3"]);
    expect(filterLibraryAssets(list, "", "image").map((a) => a.name)).toEqual(["Logo.PNG"]);
  });

  it("combines search and kind filter", () => {
    expect(filterLibraryAssets(list, "hook", "video").map((a) => a.name)).toEqual(["Hook B-Roll.mp4"]);
    expect(filterLibraryAssets(list, "hook", "image")).toEqual([]);
  });
});

describe("countByKind", () => {
  it("counts the All total and each kind", () => {
    expect(countByKind(list)).toEqual({ all: 4, video: 2, audio: 1, image: 1 });
    expect(countByKind([])).toEqual({ all: 0, video: 0, audio: 0, image: 0 });
  });
});

describe("formatDurationMs", () => {
  it("formats minutes and seconds, with hours when needed", () => {
    expect(formatDurationMs(0)).toBe("0:00");
    expect(formatDurationMs(42_000)).toBe("0:42");
    expect(formatDurationMs(65_000)).toBe("1:05");
    expect(formatDurationMs(3_600_000 + 7_000)).toBe("1:00:07");
  });

  it("shows an em dash for an unknown duration", () => {
    expect(formatDurationMs(null)).toBe("—");
    expect(formatDurationMs(undefined)).toBe("—");
  });
});

describe("formatDimensions", () => {
  it("formats known dimensions and dashes unknown ones", () => {
    expect(formatDimensions(1080, 1920)).toBe("1080 × 1920");
    expect(formatDimensions(null, 1920)).toBe("—");
    expect(formatDimensions(1080, null)).toBe("—");
    expect(formatDimensions(undefined, undefined)).toBe("—");
  });
});

describe("projectTitleFor", () => {
  it("resolves a known project title and falls back gracefully", () => {
    const titles = new Map([["p1", "Podcast ep. 12"]]);
    expect(projectTitleFor("p1", titles)).toBe("Podcast ep. 12");
    expect(projectTitleFor("gone", titles)).toBe("Unknown project");
  });
});
